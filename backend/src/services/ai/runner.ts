import { AIUsageStatus, Prisma, type AIAnalysisType } from '@prisma/client'
import type { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { orgEntitlement } from '../billing/entitlements.js'
import { personalEntitlement } from '../billing/subscriptions.js'
import { LlmError, type LlmMessage } from './aiProvider.js'
import type { GroundingIssue } from './grounding.js'
import { getLlmProvider } from './index.js'
import { redactSecrets } from './openaiCompatible.js'
import { estimateCostUsd } from './pricing.js'

export type AiTask<I, O, G = O> = {
  feature: string
  analysisType: AIAnalysisType
  promptVersion: string
  schema: z.ZodType<O>
  maxTokens: number
  temperature?: number
  /** Role and rules for the model, in Korean. */
  instructions: string
  /** JSON shape the model must return. */
  outputFormat: string
  /** Minimized payload actually sent to the model (and stored as the analysis input). */
  buildPayload: (input: I) => Record<string, unknown>
  /** Deterministic output used when no API key is configured. Must satisfy `schema`. */
  mock: (input: I) => O
  /** Drops claims without valid sources or with numbers not present in the data. */
  ground: (output: O, input: I) => { output: G; issues: GroundingIssue[] }
}

export type AiContext = { userId: string; organizationId?: string | null; projectId?: string | null }

export type AiRunResult<G> = {
  output: G
  issues: GroundingIssue[]
  analysisId: string
  meta: {
    provider: string
    model: string
    promptVersion: string
    inputTokens: number
    outputTokens: number
    costUsd: number
    latencyMs: number
    attempts: number
  }
}

const EXCLUDED_FROM_QUOTA = [AIUsageStatus.RATE_LIMITED, AIUsageStatus.BUDGET_EXCEEDED]

/** Personal quota: calls made outside an organization context, limited by the user's plan. */
export async function getAiQuota(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [used, entitlement] = await Promise.all([
    prisma.aIUsageLog.count({
      where: { userId, organizationId: null, createdAt: { gte: since }, status: { notIn: EXCLUDED_FROM_QUOTA } },
    }),
    personalEntitlement(userId),
  ])
  const planLimit = entitlement.limits.aiCallsPerDay
  const limit = typeof planLimit === 'number' ? planLimit : env.AI_DAILY_LIMIT_PER_USER
  const provider = getLlmProvider()
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    window: '최근 24시간',
    plan: entitlement.plan.key,
    provider: provider.name,
    model: provider.model,
  }
}

/** Organization quota: calls made on behalf of an organization, limited by its plan. */
async function getOrgAiQuota(organizationId: string) {
  const entitlement = await orgEntitlement(organizationId)
  const limit = typeof entitlement.limits.aiCallsPerDay === 'number' ? entitlement.limits.aiCallsPerDay : null
  if (limit === null) return { limit: null, remaining: Number.POSITIVE_INFINITY }
  const used = await prisma.aIUsageLog.count({
    where: {
      organizationId,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      status: { notIn: EXCLUDED_FROM_QUOTA },
    },
  })
  return { limit, remaining: Math.max(0, limit - used) }
}

async function logUsage(data: Prisma.AIUsageLogUncheckedCreateInput) {
  try {
    const row = await prisma.aIUsageLog.create({ data })
    return row.id
  } catch (error) {
    console.error('AI usage log failed:', error)
    return null
  }
}

function parseJson(content: string): unknown {
  const fenced = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '')
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start === -1 || end <= start) throw new SyntaxError('No JSON object in response')
  return JSON.parse(fenced.slice(start, end + 1))
}

function describeZodError(error: z.ZodError) {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function systemPrompt<I, O, G>(task: AiTask<I, O, G>) {
  return [
    task.instructions,
    '',
    '공통 규칙:',
    '- 반드시 JSON 객체 하나만 출력한다. 마크다운, 설명 문장, 코드 블록을 붙이지 않는다.',
    '- 제공된 sources에 없는 사실, 수치, 기관명, 수상 실적, 사용자 수, 성과 지표를 만들어내지 않는다.',
    '- 각 주장에는 근거가 된 source의 ref를 sourceRefs 배열에 넣는다. 근거가 없으면 그 주장을 쓰지 않는다.',
    '- 숫자는 sources에 그대로 나온 값만 사용한다. 비율·배수·증가율을 새로 계산해 쓰지 않는다.',
    '- verified=true인 source만 "기관 검증" 경험으로 표현할 수 있다.',
    '- 한국어로, 과장 없이 사실 중심으로 작성한다.',
    '',
    `출력 JSON 형식:\n${task.outputFormat}`,
  ].join('\n')
}

/**
 * Runs one AI feature end to end: quota and budget checks, provider call with timeout and
 * retries, JSON parsing, Zod validation (with one corrective re-ask), grounding, cost logging and
 * persistence to AIAnalysis. Without an API key the task's deterministic mock is used instead.
 */
export async function runAiTask<I, O, G>(task: AiTask<I, O, G>, input: I, ctx: AiContext): Promise<AiRunResult<G>> {
  const provider = getLlmProvider()
  const quota = ctx.organizationId ? await getOrgAiQuota(ctx.organizationId) : await getAiQuota(ctx.userId)
  const base = {
    userId: ctx.userId,
    organizationId: ctx.organizationId ?? null,
    feature: task.feature,
    provider: provider.name,
    model: provider.model,
  }

  if (quota.remaining <= 0) {
    await logUsage({ ...base, status: AIUsageStatus.RATE_LIMITED, attempts: 0, errorCode: 'daily_limit' })
    throw new HttpError(
      429,
      ctx.organizationId
        ? `이 기관의 AI 사용량이 요금제 한도(24시간 ${quota.limit}회)에 도달했습니다.`
        : `AI 기능은 24시간에 ${quota.limit}회까지 사용할 수 있습니다. 잠시 후 다시 시도해 주세요.`,
    )
  }

  if (provider.name !== 'mock' && env.AI_MONTHLY_BUDGET_USD) {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const spent = await prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } })
    if (Number(spent._sum.costUsd ?? 0) >= env.AI_MONTHLY_BUDGET_USD) {
      await logUsage({ ...base, status: AIUsageStatus.BUDGET_EXCEEDED, attempts: 0, errorCode: 'monthly_budget' })
      throw new HttpError(503, '이번 달 AI 사용 예산을 모두 사용했습니다. 관리자에게 문의해 주세요.')
    }
  }

  const payload = task.buildPayload(input)
  const started = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  let attempts = 0
  let model = provider.model
  let parsed: O

  if (provider.name === 'mock') {
    attempts = 1
    parsed = task.schema.parse(task.mock(input))
  } else {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt(task) },
      { role: 'user', content: JSON.stringify(payload) },
    ]

    const call = async (conversation: LlmMessage[]) => {
      let lastError: LlmError | null = null
      for (let retry = 0; retry <= env.AI_MAX_RETRIES; retry += 1) {
        attempts += 1
        try {
          const completion = await provider.complete(conversation, {
            maxTokens: task.maxTokens,
            temperature: task.temperature ?? 0.2,
            signal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
          })
          inputTokens += completion.inputTokens
          outputTokens += completion.outputTokens
          model = completion.model
          return completion.content
        } catch (error) {
          lastError = error instanceof LlmError ? error : new LlmError('network', redactSecrets(String(error)))
          if (!lastError.retryable || retry === env.AI_MAX_RETRIES) break
          await sleep(Math.min(8000, 500 * 2 ** retry) + Math.floor(Math.random() * 250))
        }
      }
      throw lastError!
    }

    try {
      const content = await call(messages)
      let result = task.schema.safeParse(safeJson(content))
      if (!result.success) {
        const problem = describeZodError(result.error)
        const retryContent = await call([
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content: `직전 응답이 형식 검증을 통과하지 못했습니다: ${problem}\n지정한 JSON 형식만 다시 출력하세요.`,
          },
        ])
        result = task.schema.safeParse(safeJson(retryContent))
      }
      if (!result.success) {
        await logUsage({
          ...base,
          model,
          status: AIUsageStatus.INVALID_OUTPUT,
          attempts,
          inputTokens,
          outputTokens,
          costUsd: estimateCostUsd(model, inputTokens, outputTokens),
          latencyMs: Date.now() - started,
          errorCode: 'schema_validation',
          errorMessage: redactSecrets(describeZodError(result.error)),
        })
        throw new HttpError(502, 'AI 응답이 형식 검증을 통과하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      parsed = result.data
    } catch (error) {
      if (error instanceof HttpError) throw error
      const llmError = error instanceof LlmError ? error : new LlmError('network', String(error))
      await logUsage({
        ...base,
        model,
        status: llmError.code === 'timeout' ? AIUsageStatus.TIMEOUT : AIUsageStatus.PROVIDER_ERROR,
        attempts,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens),
        latencyMs: Date.now() - started,
        errorCode: llmError.code,
        errorMessage: redactSecrets(llmError.message),
      })
      throw new HttpError(502, 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  const { output, issues } = task.ground(parsed, input)
  const latencyMs = Date.now() - started
  const costUsd = provider.name === 'mock' ? 0 : estimateCostUsd(model, inputTokens, outputTokens)

  const analysis = await prisma.aIAnalysis.create({
    data: {
      userId: ctx.userId,
      projectId: ctx.projectId ?? null,
      organizationId: ctx.organizationId ?? null,
      type: task.analysisType,
      input: payload as Prisma.InputJsonValue,
      output: output as unknown as Prisma.InputJsonValue,
      provider: provider.name,
      model,
      promptVersion: task.promptVersion,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      validation: { issues, checkedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  await logUsage({
    ...base,
    model,
    status: AIUsageStatus.SUCCESS,
    attempts,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
    validationIssues: issues.length,
    analysisId: analysis.id,
  })

  return {
    output,
    issues,
    analysisId: analysis.id,
    meta: { provider: provider.name, model, promptVersion: task.promptVersion, inputTokens, outputTokens, costUsd, latencyMs, attempts },
  }
}

function safeJson(content: string) {
  try {
    return parseJson(content)
  } catch {
    return undefined
  }
}
