import { AIAnalysisType } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { assertPersonalFeature } from '../../services/billing/entitlements.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { collectCareerSources } from '../../services/ai/careerSources.js'
import { truncate, type GroundingIssue, type Source } from '../../services/ai/grounding.js'
import { getAiQuota, runAiTask } from '../../services/ai/runner.js'
import { insightTask } from '../../services/ai/tasks/insight.js'
import { portfolioTask, type PortfolioResult } from '../../services/ai/tasks/portfolio.js'
import { renderPdf } from '../../services/pdf/renderPdf.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { opportunityMatchSchema, portfolioRequestSchema, projectInsightSchema } from '../../validators/ai.validator.js'
import { portfolioHtml } from './portfolioTemplate.js'

export const aiRouter = Router()

const PORTFOLIO_PROMPT_PREFIX = 'portfolio-'

function issueSummary(issues: GroundingIssue[]) {
  return {
    dropped: issues.length,
    reasons: issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.reason] = (acc[issue.reason] ?? 0) + 1
      return acc
    }, {}),
  }
}

const normalizeSkill = (skill: string) => skill.trim().toLowerCase().replace(/[\s._-]+/g, '')

aiRouter.get('/quota', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    res.status(200).json({ quota: await getAiQuota(authUser.id) })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/profile-insight', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const career = await collectCareerSources(authUser.id)
    const result = await runAiTask(insightTask('profile'), { ...career, mode: 'profile' }, { userId: authUser.id })
    res.status(201).json({ analysisId: result.analysisId, insight: result.output, validation: issueSummary(result.issues), meta: result.meta })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/project-insight', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { projectId } = projectInsightSchema.parse(req.body)
    const career = await collectCareerSources(authUser.id, { projectIds: [projectId], maxProjects: 1 })
    if (career.projects.length === 0) throw new HttpError(404, '참여 중인 프로젝트만 분석할 수 있습니다.')
    const result = await runAiTask(insightTask('project'), { ...career, mode: 'project' }, { userId: authUser.id, projectId })
    res.status(201).json({ analysisId: result.analysisId, insight: result.output, validation: issueSummary(result.issues), meta: result.meta })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/opportunity-match', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { opportunityId } = opportunityMatchSchema.parse(req.body)
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { title: true, organization: true, description: true, skills: true },
    })
    if (!opportunity) throw new HttpError(404, '기회 정보를 찾을 수 없습니다.')

    const career = await collectCareerSources(authUser.id)
    const owned = new Set(
      [
        ...career.profileSkills,
        ...[...career.sources.values()].filter((s) => s.kind === 'project').flatMap((s) => /기술: ([^/]+)/.exec(s.text)?.[1]?.split(', ') ?? []),
      ].map(normalizeSkill),
    )
    const required = opportunity.skills.filter(Boolean)
    const matched = required.filter((skill) => owned.has(normalizeSkill(skill)))
    const missing = required.filter((skill) => !owned.has(normalizeSkill(skill)))
    const matchScore = required.length ? Math.round((matched.length / required.length) * 100) : null
    const facts: Source[] = [
      {
        ref: 'F2',
        kind: 'fact',
        label: '기회 요건',
        verified: false,
        text: `${truncate(opportunity.title, 120)} (${truncate(opportunity.organization, 60)}) / 요구 기술: ${required.join(', ') || '명시 없음'} / ${truncate(opportunity.description, 400)}`,
      },
      {
        ref: 'F3',
        kind: 'fact',
        label: '서버 계산 기술 일치',
        verified: false,
        text: `일치 기술: ${matched.join(', ') || '없음'} / 부족 기술: ${missing.join(', ') || '없음'}${matchScore === null ? '' : ` / 일치율 ${matchScore}%`}`,
      },
    ]
    const result = await runAiTask(
      insightTask('opportunity'),
      { ...career, mode: 'opportunity', facts, matchScore },
      { userId: authUser.id },
    )
    res.status(201).json({
      analysisId: result.analysisId,
      insight: result.output,
      match: { score: matchScore, matched, missing, basis: '요구 기술 중 프로필·프로젝트 기술과 일치하는 비율' },
      validation: issueSummary(result.issues),
      meta: result.meta,
    })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/portfolio', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { projectIds } = portfolioRequestSchema.parse(req.body ?? {})
    const career = await collectCareerSources(authUser.id, { projectIds, maxProjects: 6 })
    if (career.projects.length === 0) throw new HttpError(400, '포트폴리오에 포함할 프로젝트가 없습니다. 프로젝트를 먼저 기록해 주세요.')
    await assertPersonalFeature(authUser.id, 'portfolio')
    const result = await runAiTask(portfolioTask, career, { userId: authUser.id })
    res.status(201).json({
      analysisId: result.analysisId,
      portfolio: result.output,
      validation: issueSummary(result.issues),
      meta: result.meta,
    })
  } catch (error) {
    next(error)
  }
})

async function findPortfolio(userId: string, analysisId?: string) {
  return prisma.aIAnalysis.findFirst({
    where: {
      userId,
      type: AIAnalysisType.PORTFOLIO_GENERATOR,
      promptVersion: { startsWith: PORTFOLIO_PROMPT_PREFIX },
      ...(analysisId ? { id: analysisId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, output: true, validation: true, provider: true, model: true, createdAt: true },
  })
}

aiRouter.get('/portfolio/latest', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const analysis = await findPortfolio(authUser.id)
    if (!analysis) {
      res.status(200).json({ portfolio: null })
      return
    }
    const issues = ((analysis.validation as { issues?: GroundingIssue[] } | null)?.issues ?? []) as GroundingIssue[]
    res.status(200).json({
      analysisId: analysis.id,
      portfolio: analysis.output as unknown as PortfolioResult,
      validation: issueSummary(issues),
      meta: { provider: analysis.provider, model: analysis.model, createdAt: analysis.createdAt },
    })
  } catch (error) {
    next(error)
  }
})

aiRouter.get('/portfolio/:analysisId/pdf', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const analysis = await findPortfolio(authUser.id, String(req.params.analysisId))
    if (!analysis) throw new HttpError(404, '포트폴리오를 찾을 수 없습니다.')
    await assertPersonalFeature(authUser.id, 'portfolioPdf')
    const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: { name: true } })
    const pdf = await renderPdf(portfolioHtml(analysis.output as unknown as PortfolioResult, { name: user?.name ?? 'BAESH 사용자', generatedAt: analysis.createdAt }), {
      footerLabel: 'BAESH 포트폴리오 · 근거 기반 자동 생성',
    })
    const fileName = `${user?.name ?? 'baesh'}_portfolio_${analysis.createdAt.toISOString().slice(0, 10)}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="portfolio.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).send(Buffer.from(pdf))
  } catch (error) {
    next(error)
  }
})

aiRouter.get('/analyses/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const analyses = await prisma.aIAnalysis.findMany({
      where: { userId: authUser.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, type: true, projectId: true, provider: true, model: true, promptVersion: true, output: true, createdAt: true },
    })
    res.status(200).json({ analyses })
  } catch (error) {
    next(error)
  }
})
