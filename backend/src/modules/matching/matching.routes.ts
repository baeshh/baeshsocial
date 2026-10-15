import { MatchFeedback, OrganizationType, type Prisma } from '@prisma/client'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { runAiTask } from '../../services/ai/runner.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity } from '../../services/billing/entitlements.js'
import { hiddenProjectsByUser } from '../../services/projects/profileDisplay.js'
import {
  buildTalentExplanationInput,
  fallbackExplanation,
  talentExplanationTask,
  type CandidateExplanation,
} from '../../services/ai/tasks/talentExplanation.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { rankCandidates, SCORING_BASIS, SCORING_VERSION, searchCriteriaSchema, WEIGHTS, type MatchEvidence } from './scoring.js'

export const talentRouter = Router({ mergeParams: true })

const EXPLAINED_TOP = 5
const DAILY_SEARCH_LIMIT = 50

const companyOnly: RequestHandler = (_req, res, next) => {
  const { organization } = res.locals.orgAccess as OrgAccess
  if (organization.type !== OrganizationType.COMPANY) {
    res.status(403).json({ message: '인재 검색은 승인된 기업 조직만 사용할 수 있습니다.' })
    return
  }
  next()
}

const access = [authenticate, requireOrgAccess({ requireApproved: true }), companyOnly]

const feedbackSchema = z.object({ feedback: z.enum(['shortlisted', 'contacted', 'not_a_fit']).nullable() })

type StoredEvidence = MatchEvidence & { explanation?: CandidateExplanation | null }

async function loadResults(searchId: string) {
  const rows = await prisma.matchResult.findMany({
    where: { searchId },
    orderBy: { rank: 'asc' },
    select: {
      id: true,
      rank: true,
      score: true,
      breakdown: true,
      evidence: true,
      explanation: true,
      explanationSource: true,
      explanationModel: true,
      feedback: true,
      feedbackAt: true,
      candidate: {
        select: { id: true, name: true, avatarUrl: true, profile: { select: { headline: true, school: true, talentSearchOptIn: true } } },
      },
    },
  })
  // Projects hidden from the profile since the search are dropped from its evidence on every read too.
  const hidden = await hiddenProjectsByUser(rows.map((row) => row.candidate.id))
  const recordIds = rows.flatMap((row) => (hidden.has(row.candidate.id) ? (row.evidence as unknown as StoredEvidence).verified.map((item) => item.id) : []))
  const recordProjects = new Map(
    recordIds.length
      ? (await prisma.verifiedRecord.findMany({ where: { id: { in: recordIds } }, select: { id: true, projectId: true } })).map((record) => [
          record.id,
          record.projectId,
        ])
      : [],
  )
  // Consent is re-checked on every read: withdrawn candidates are hidden from past searches too.
  return rows.map((row) => {
    if (!row.candidate.profile?.talentSearchOptIn) {
      return { id: row.id, rank: row.rank, withdrawn: true as const }
    }
    const stored = row.evidence as unknown as StoredEvidence
    const hiddenIds = hidden.get(row.candidate.id)
    const evidence: StoredEvidence = hiddenIds
      ? {
          ...stored,
          projects: stored.projects.filter((project) => !hiddenIds.has(project.id)),
          verified: stored.verified.filter((item) => !hiddenIds.has(recordProjects.get(item.id) ?? '')),
        }
      : stored
    return {
      id: row.id,
      rank: row.rank,
      withdrawn: false as const,
      score: row.score,
      breakdown: row.breakdown,
      evidence: { ...evidence, explanation: undefined },
      explanation: evidence.explanation ?? null,
      explanationSource: row.explanationSource,
      explanationModel: row.explanationModel,
      feedback: row.feedback?.toLowerCase() ?? null,
      feedbackAt: row.feedbackAt,
      candidate: {
        id: row.candidate.id,
        name: row.candidate.name,
        avatarUrl: row.candidate.avatarUrl,
        headline: row.candidate.profile.headline,
        school: row.candidate.profile.school,
      },
    }
  })
}

talentRouter.get('/meta', ...access, (_req, res) => {
  res.status(200).json({ scoringVersion: SCORING_VERSION, weights: WEIGHTS, basis: SCORING_BASIS })
})

talentRouter.post('/searches', ...access, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization } = res.locals.orgAccess as OrgAccess
    const criteria = searchCriteriaSchema.parse(req.body)
    const recent = await prisma.talentSearch.count({
      where: { organizationId: organization.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    if (recent >= DAILY_SEARCH_LIMIT) throw new HttpError(429, `인재 검색은 조직별로 24시간에 ${DAILY_SEARCH_LIMIT}회까지 가능합니다.`)
    await assertOrgCapacity(organization.id, 'talentSearchesPerMonth', 1)

    const ranked = await rankCandidates(criteria, [authUser.id])
    const top = ranked.slice(0, EXPLAINED_TOP)
    let explanations: Record<string, CandidateExplanation> = {}
    let explanationSource: 'ai' | 'rule' = 'rule'
    let explanationModel: string | null = null
    if (top.length) {
      const input = buildTalentExplanationInput(criteria, top)
      try {
        const ai = await runAiTask(talentExplanationTask, input, { userId: authUser.id, organizationId: organization.id })
        explanations = ai.output
        explanationSource = ai.meta.provider === 'mock' ? 'rule' : 'ai'
        explanationModel = ai.meta.provider === 'mock' ? null : ai.meta.model
      } catch (error) {
        console.warn('[talent] AI explanation unavailable, using rule text:', error instanceof Error ? error.message : error)
        explanations = fallbackExplanation(input).output
      }
    }

    const search = await prisma.$transaction(async (tx) => {
      const created = await tx.talentSearch.create({
        data: {
          organizationId: organization.id,
          createdById: authUser.id,
          title: criteria.title ?? criteria.skills.join(', '),
          criteria: criteria as unknown as Prisma.InputJsonValue,
          scoringVersion: SCORING_VERSION,
          candidateCount: ranked.length,
        },
      })
      if (ranked.length) {
        await tx.matchResult.createMany({
          data: ranked.map((row, index) => {
            const explanation = index < EXPLAINED_TOP ? (explanations[`C${index + 1}`] ?? null) : null
            return {
              searchId: created.id,
              candidateId: row.userId,
              rank: index + 1,
              score: row.score,
              breakdown: row.breakdown as unknown as Prisma.InputJsonValue,
              evidence: { ...row.evidence, explanation } as unknown as Prisma.InputJsonValue,
              explanation: explanation ? [...explanation.reasons, ...explanation.cautions].map((c) => c.text).join(' ') : null,
              explanationSource: explanation ? explanationSource : null,
              explanationModel: explanation ? explanationModel : null,
              scoringVersion: SCORING_VERSION,
            }
          }),
        })
      }
      return created
    })

    await audit(req, res, {
      action: 'talent.search',
      organizationId: organization.id,
      targetType: 'talent_search',
      targetId: search.id,
      metadata: { skills: criteria.skills, candidates: ranked.length },
    })
    res.status(201).json({
      search: { id: search.id, title: search.title, criteria, scoringVersion: SCORING_VERSION, candidateCount: ranked.length, createdAt: search.createdAt },
      results: await loadResults(search.id),
    })
  } catch (error) {
    next(error)
  }
})

talentRouter.get('/searches', ...access, async (_req, res, next) => {
  try {
    const { organization } = res.locals.orgAccess as OrgAccess
    const searches = await prisma.talentSearch.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, criteria: true, scoringVersion: true, candidateCount: true, createdAt: true, createdBy: { select: { id: true, name: true } } },
    })
    res.status(200).json({ searches })
  } catch (error) {
    next(error)
  }
})

talentRouter.get('/searches/:searchId', ...access, async (req, res, next) => {
  try {
    const { organization } = res.locals.orgAccess as OrgAccess
    const search = await prisma.talentSearch.findFirst({
      where: { id: String(req.params.searchId), organizationId: organization.id },
      select: { id: true, title: true, criteria: true, scoringVersion: true, candidateCount: true, createdAt: true },
    })
    if (!search) throw new HttpError(404, '검색 기록을 찾을 수 없습니다.')
    res.status(200).json({ search, results: await loadResults(search.id) })
  } catch (error) {
    next(error)
  }
})

talentRouter.patch('/searches/:searchId/results/:resultId/feedback', ...access, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization } = res.locals.orgAccess as OrgAccess
    const { feedback } = feedbackSchema.parse(req.body)
    const result = await prisma.matchResult.findFirst({
      where: { id: String(req.params.resultId), searchId: String(req.params.searchId), search: { organizationId: organization.id } },
      select: { id: true, candidate: { select: { profile: { select: { talentSearchOptIn: true } } } } },
    })
    if (!result || !result.candidate.profile?.talentSearchOptIn) throw new HttpError(404, '추천 결과를 찾을 수 없습니다.')
    const updated = await prisma.matchResult.update({
      where: { id: result.id },
      data: {
        feedback: feedback ? (feedback.toUpperCase() as MatchFeedback) : null,
        feedbackAt: feedback ? new Date() : null,
        feedbackById: feedback ? authUser.id : null,
      },
      select: { id: true, feedback: true, feedbackAt: true },
    })
    res.status(200).json({ result: { ...updated, feedback: updated.feedback?.toLowerCase() ?? null } })
  } catch (error) {
    next(error)
  }
})
