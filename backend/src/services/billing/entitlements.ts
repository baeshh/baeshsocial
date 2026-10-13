import { OrganizationMemberStatus, ProgramStatus, ProjectStatus, ReportStatus, type Prisma } from '@prisma/client'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { LIMIT_LABELS, ORG_LIMIT_KEYS, planLimits, type OrgLimitKey, type PlanLimits } from './plans.js'
import {
  accessState,
  canCreate,
  currentOrgSubscription,
  daysLeft,
  personalEntitlement,
  type AccessState,
  type SubscriptionWithPlan,
} from './subscriptions.js'

const DAY = 24 * 60 * 60 * 1000
const GB = 1024 ** 3

export type OrgUsage = Record<OrgLimitKey, number>

/** Live usage, computed from the same tables the features write to. */
export async function computeOrgUsage(organizationId: string, subscription: SubscriptionWithPlan | null): Promise<OrgUsage> {
  const now = Date.now()
  const periodStart = subscription?.startsAt ?? new Date(now - 365 * DAY)
  const programWhere = { program: { organizationId } }
  const [members, participants, activePrograms, projects, evidenceBytes, reportBytes, reports, searches, aiCalls, applicationBytes] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId, status: OrganizationMemberStatus.ACTIVE } }),
    prisma.programParticipant.groupBy({ by: ['userId'], where: orgParticipantWhere(organizationId) }).then((rows) => rows.length),
    prisma.program.count({ where: { organizationId, status: ProgramStatus.ACTIVE } }),
    prisma.project.count({ where: { ...programWhere, status: { not: ProjectStatus.ARCHIVED } } }),
    prisma.evidenceFile.aggregate({ _sum: { sizeBytes: true }, where: { evidence: { project: programWhere } } }),
    prisma.generatedReport.aggregate({ _sum: { sizeBytes: true }, where: { organizationId } }),
    prisma.generatedReport.count({
      where: { organizationId, createdAt: { gte: periodStart }, status: { not: ReportStatus.FAILED } },
    }),
    prisma.talentSearch.count({ where: { organizationId, createdAt: { gte: new Date(now - 30 * DAY) } } }),
    prisma.aIUsageLog.count({
      where: { organizationId, createdAt: { gte: new Date(now - DAY) }, status: { notIn: ['RATE_LIMITED', 'BUDGET_EXCEEDED'] } },
    }),
    prisma.programApplicationFile.aggregate({ _sum: { sizeBytes: true }, where: { application: programWhere } }),
  ])
  const storageBytes =
    (evidenceBytes._sum.sizeBytes ?? 0) + (reportBytes._sum.sizeBytes ?? 0) + (applicationBytes._sum.sizeBytes ?? 0)
  return {
    members,
    participants,
    activePrograms,
    projects,
    storageGb: Math.round((storageBytes / GB) * 1000) / 1000,
    reportsPerPeriod: reports,
    talentSearchesPerMonth: searches,
    aiCallsPerDay: aiCalls,
  }
}

export type OrgEntitlement = {
  subscription: SubscriptionWithPlan | null
  state: AccessState
  canCreate: boolean
  daysLeft: number | null
  limits: PlanLimits
}

export async function orgEntitlement(organizationId: string): Promise<OrgEntitlement> {
  const subscription = await currentOrgSubscription(organizationId)
  const state = accessState(subscription)
  return {
    subscription,
    state,
    canCreate: canCreate(state),
    daysLeft: daysLeft(subscription),
    limits: subscription ? planLimits(subscription.plan, subscription.limitOverrides) : {},
  }
}

export function usageRows(limits: PlanLimits, usage: OrgUsage) {
  return ORG_LIMIT_KEYS.map((key) => {
    const limit = typeof limits[key] === 'number' ? (limits[key] as number) : null
    return {
      key,
      label: LIMIT_LABELS[key],
      used: usage[key],
      limit,
      ratio: limit ? Math.min(1, usage[key] / limit) : null,
      exceeded: limit !== null && usage[key] > limit,
    }
  })
}

const STATE_MESSAGE: Record<Exclude<AccessState, 'active' | 'past_due'>, string> = {
  grace: '이용 기간이 끝나 유예 기간 중입니다. 기존 자료 조회·다운로드만 가능하며 새 항목은 만들 수 없습니다. 계약을 갱신해 주세요.',
  expired: '이용 기간이 만료되었습니다. 기존 자료 조회·다운로드만 가능합니다. 계약 갱신은 BAESH 운영팀에 문의해 주세요.',
  none: '이용 중인 요금제가 없습니다. BAESH 운영팀에 계약을 문의해 주세요.',
}

/**
 * Throws 402 when the organization cannot take on `increment` more of `metric`
 * (or cannot create anything because its contract ended). In `warn` mode it only logs.
 */
export async function assertOrgCapacity(organizationId: string, metric: OrgLimitKey, increment = 1) {
  const entitlement = await orgEntitlement(organizationId)
  const fail = (message: string, details: Record<string, unknown>) => {
    if (env.BILLING_ENFORCEMENT === 'warn') {
      console.warn(`[billing] would block ${organizationId} ${metric}: ${message}`)
      return
    }
    throw new HttpError(402, message, details)
  }

  if (!entitlement.canCreate) {
    const state = entitlement.state as Exclude<AccessState, 'active' | 'past_due'>
    return fail(STATE_MESSAGE[state], { code: 'subscription_inactive', state })
  }
  const limit = entitlement.limits[metric]
  if (typeof limit !== 'number') return
  const usage = await computeOrgUsage(organizationId, entitlement.subscription)
  if (usage[metric] + increment > limit) {
    fail(
      `요금제 한도를 초과합니다: ${LIMIT_LABELS[metric]} ${limit.toLocaleString('ko-KR')}${metric === 'storageGb' ? 'GB' : ''} (현재 ${usage[metric].toLocaleString('ko-KR')}). 요금제 변경은 BAESH 운영팀에 문의해 주세요.`,
      { code: 'plan_limit', metric, limit, used: usage[metric], requested: increment },
    )
  }
}

export const bytesToGb = (bytes: number) => bytes / GB

/** A person counts once against the participant limit, however many of the organization's live programs they join. */
export const orgParticipantWhere = (organizationId: string): Prisma.ProgramParticipantWhereInput => ({
  program: { organizationId, status: { not: ProgramStatus.ARCHIVED } },
})

/**
 * Checks the participant limit only for people not yet counted for this organization. `withoutAccount`
 * is for invitees who have no BAESH account yet and therefore always count as new.
 */
export async function assertParticipantSeats(organizationId: string, userIds: string[], withoutAccount = 0) {
  const unique = [...new Set(userIds)]
  const counted = unique.length
    ? await prisma.programParticipant.findMany({
        where: { ...orgParticipantWhere(organizationId), userId: { in: unique } },
        distinct: ['userId'],
        select: { userId: true },
      })
    : []
  const fresh = unique.length - counted.length + withoutAccount
  if (fresh > 0) await assertOrgCapacity(organizationId, 'participants', fresh)
}

/** Personal plan checks (portfolio generation and PDF export). */
export async function assertPersonalFeature(userId: string, feature: 'portfolio' | 'portfolioPdf') {
  const entitlement = await personalEntitlement(userId)
  const fail = (message: string, details: Record<string, unknown>) => {
    if (env.BILLING_ENFORCEMENT === 'warn') return
    throw new HttpError(402, message, details)
  }
  if (feature === 'portfolioPdf') {
    if (entitlement.limits.portfolioPdf !== true) {
      fail('포트폴리오 PDF 내보내기는 개인 Pro 요금제에서 제공됩니다. 웹 보기와 이력서 요약 복사는 계속 이용할 수 있습니다.', {
        code: 'plan_feature',
        feature,
        plan: entitlement.plan.key,
      })
    }
    return
  }
  const limit = entitlement.limits.portfoliosPerMonth
  if (typeof limit !== 'number') return
  const used = await prisma.aIAnalysis.count({
    where: { userId, type: 'PORTFOLIO_GENERATOR', createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
  })
  if (used >= limit) {
    fail(`최근 30일 AI 포트폴리오 생성 한도(${limit}회)를 모두 사용했습니다.`, {
      code: 'plan_limit',
      metric: 'portfoliosPerMonth',
      limit,
      used,
      plan: entitlement.plan.key,
    })
  }
}
