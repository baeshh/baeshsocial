import { AIAnalysisType } from '@prisma/client'
import { z } from 'zod'
import type { CareerSources } from '../careerSources.js'
import {
  checkFreeText,
  groundClaims,
  numberSet,
  sourceSet,
  sourcesForPrompt,
  type GroundedClaim,
  type GroundingIssue,
  type Source,
} from '../grounding.js'
import type { AiTask } from '../runner.js'

const insightSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  strengths: z
    .array(z.object({ text: z.string().trim().min(1).max(300), sourceRefs: z.array(z.string().max(12)).max(6).default([]) }))
    .max(5)
    .default([]),
  gaps: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
  recommendations: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
})

export type InsightDraft = z.infer<typeof insightSchema>
export type InsightMode = 'profile' | 'project' | 'opportunity'

export type InsightInput = CareerSources & {
  mode: InsightMode
  /** Extra server-computed facts (e.g. opportunity requirements and rule-based match). */
  facts?: Source[]
  matchScore?: number | null
}

export type InsightResult = {
  mode: InsightMode
  summary: string
  strengths: GroundedClaim[]
  gaps: string[]
  recommendations: string[]
  matchScore: number | null
  sources: Source[]
}

function allSources(input: InsightInput) {
  return sourceSet([...input.sources.values(), ...(input.facts ?? [])])
}

function mockInsight(input: InsightInput): InsightDraft {
  const sources = allSources(input)
  const verified = [...sources.values()].filter((s) => s.verified)
  const links = [...sources.values()].filter((s) => s.kind === 'link')
  const tasks = [...sources.values()].filter((s) => s.kind === 'task')
  const strengths = [
    ...input.projects.slice(0, 2).map((p) => ({ text: `${p.title}에서 ${p.role} 역할 수행`, sourceRefs: [p.ref] })),
    ...(verified.length ? [{ text: '기관 담당자가 승인한 활동 증빙 보유', sourceRefs: verified.slice(0, 3).map((s) => s.ref) }] : []),
    ...(links.length ? [{ text: '외부에서 확인 가능한 산출물 링크 연결', sourceRefs: links.slice(0, 3).map((s) => s.ref) }] : []),
  ]
  const gaps = [
    ...(verified.length === 0 ? ['기관 검증을 받은 활동 증빙이 아직 없습니다.'] : []),
    ...(links.length === 0 ? ['GitHub·배포 주소 등 외부 산출물 링크가 연결되지 않았습니다.'] : []),
    ...(tasks.length === 0 ? ['본인에게 배정된 태스크 기록이 없어 기여 범위를 확인하기 어렵습니다.'] : []),
  ]
  const facts = input.facts ?? []
  return {
    summary:
      input.mode === 'opportunity' && facts.length
        ? `${facts[0].text.split(' / ')[0]} 요건과 프로필·프로젝트 기록을 비교한 결과입니다.`
        : input.projects.length
          ? `${input.projects.map((p) => p.title).slice(0, 2).join(', ')} 등 BAESH에 기록된 프로젝트를 바탕으로 정리한 분석입니다.`
          : '아직 분석할 프로젝트 기록이 없습니다. 프로젝트와 활동 기록을 추가해 주세요.',
    strengths,
    gaps,
    recommendations: [
      ...(verified.length === 0 ? ['기관 프로그램에서 활동 증빙을 제출해 검증 기록을 확보하세요.'] : []),
      ...(links.length === 0 ? ['프로젝트에 GitHub 저장소나 배포 주소를 연결하세요.'] : []),
      '프로젝트 활동 기록에 본인의 역할과 결과를 구체적으로 남기세요.',
    ],
  }
}

function groundInsight(draft: InsightDraft, input: InsightInput) {
  const sources = allSources(input)
  const allowed = numberSet([...sources.values()].map((s) => `${s.label} ${s.text}`))
  if (input.matchScore !== undefined && input.matchScore !== null) allowed.add(input.matchScore)
  const issues: GroundingIssue[] = []
  const strengths = groundClaims(draft.strengths, sources, 'strengths')
  issues.push(...strengths.issues)
  const summaryIssue = checkFreeText(draft.summary, 'summary', allowed)
  if (summaryIssue) issues.push(summaryIssue)
  const keepFree = (items: string[], path: string) =>
    items.filter((text, index) => {
      const issue = checkFreeText(text, `${path}[${index}]`, allowed)
      if (issue) issues.push(issue)
      return !issue
    })
  const result: InsightResult = {
    mode: input.mode,
    summary: summaryIssue ? 'BAESH에 기록된 프로젝트·활동 데이터를 바탕으로 정리한 분석입니다.' : draft.summary,
    strengths: strengths.kept,
    gaps: keepFree(draft.gaps, 'gaps'),
    recommendations: keepFree(draft.recommendations, 'recommendations'),
    matchScore: input.matchScore ?? null,
    sources: [...sources.values()],
  }
  return { output: result, issues }
}

const TYPE: Record<InsightMode, AIAnalysisType> = {
  profile: AIAnalysisType.PROFILE_INSIGHT,
  project: AIAnalysisType.PROJECT_INSIGHT,
  opportunity: AIAnalysisType.OPPORTUNITY_MATCH,
}

const FOCUS: Record<InsightMode, string> = {
  profile: '사용자의 역량 강점, 부족한 근거, 다음 행동을 분석한다.',
  project: '선택한 프로젝트의 진행 상황, 사용자의 기여, 보완할 기록을 분석한다.',
  opportunity: '기회(채용·프로그램)의 요구 기술과 사용자의 기록을 비교한다. 매칭 점수는 서버가 계산한 값만 언급한다.',
}

export function insightTask(mode: InsightMode): AiTask<InsightInput, InsightDraft, InsightResult> {
  return {
    feature: `insight_${mode}`,
    analysisType: TYPE[mode],
    promptVersion: 'insight-v1',
    schema: insightSchema,
    maxTokens: 1200,
    instructions: `너는 BAESH의 커리어 분석가다. ${FOCUS[mode]} strengths에는 반드시 근거 sourceRefs를 단다. gaps와 recommendations는 데이터에서 확인되는 공백만 짧게 쓴다.`,
    outputFormat: `{
  "summary": "2~3문장 요약",
  "strengths": [{ "text": "...", "sourceRefs": ["P1", "E1"] }],
  "gaps": ["..."],
  "recommendations": ["..."]
}`,
    buildPayload: (input) => ({
      task: `insight_${mode}`,
      matchScore: input.matchScore ?? undefined,
      sources: sourcesForPrompt(allSources(input)),
    }),
    mock: mockInsight,
    ground: groundInsight,
  }
}
