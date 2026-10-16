import { SubscriptionStatus, type Plan, type Subscription } from '@prisma/client'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { PLAN_KEYS, ensureDefaultPlans, planLimits, type PlanLimits } from './plans.js'

const DAY = 24 * 60 * 60 * 1000

/**
 * Access state derived from dates and status:
 * - active: full use · past_due: full use with a payment warning
 * - grace: contract ended; existing data readable, nothing new can be created
 * - expired: grace ended; still read-only (data is never deleted automatically)
 * - none: no entitlement on record
 */
export type AccessState = 'active' | 'past_due' | 'grace' | 'expired' | 'none'

export type SubscriptionWithPlan = Subscription & { plan: Plan }

/** The subscription in force now: latest started, non-canceled period. */
export async function currentOrgSubscription(organizationId: string): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findFirst({
    where: { organizationId, status: { not: SubscriptionStatus.CANCELED }, startsAt: { lte: new Date() } },
    orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
    include: { plan: true },
  })
}

export function accessState(subscription: Pick<Subscription, 'status' | 'endsAt' | 'graceDays'> | null, now = new Date()): AccessState {
  if (!subscription) return 'none'
  if (subscription.status === SubscriptionStatus.CANCELED) return 'none'
  if (subscription.endsAt && now >= subscription.endsAt) {
    const graceEnd = subscription.endsAt.getTime() + subscription.graceDays * DAY
    return now.getTime() < graceEnd ? 'grace' : 'expired'
  }
  if (subscription.status === SubscriptionStatus.EXPIRED) return 'expired'
  if (subscription.status === SubscriptionStatus.PAST_DUE) return 'past_due'
  return 'active'
}

export function canCreate(state: AccessState) {
  return state === 'active' || state === 'past_due'
}

export function daysLeft(subscription: Pick<Subscription, 'endsAt'> | null, now = new Date()) {
  if (!subscription?.endsAt) return null
  return Math.ceil((subscription.endsAt.getTime() - now.getTime()) / DAY)
}

/** Approved organizations without any entitlement get a trial so pilots can start immediately. */
export async function ensureTrialSubscription(organizationId: string, createdById: string | null = null) {
  const existing = await prisma.subscription.findFirst({ where: { organizationId }, select: { id: true } })
  if (existing) return null
  await ensureDefaultPlans()
  const plan = await prisma.plan.findUniqueOrThrow({ where: { key: PLAN_KEYS.orgTrial } })
  const now = new Date()
  return prisma.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      status: SubscriptionStatus.TRIAL,
      startsAt: now,
      endsAt: new Date(now.getTime() + env.BILLING_TRIAL_DAYS * DAY),
      graceDays: 14,
      createdById,
      notes: '조직 인증 승인 시 자동 생성된 체험 기간',
    },
  })
}

/** Approved organizations created before billing existed get the same trial once. */
export async function backfillTrialSubscriptions() {
  const organizations = await prisma.organization.findMany({
    where: { verificationStatus: 'APPROVED', subscriptions: { none: {} } },
    select: { id: true },
  })
  for (const organization of organizations) await ensureTrialSubscription(organization.id)
  return organizations.length
}

export type PersonalEntitlement = {
  plan: Pick<Plan, 'id' | 'key' | 'name'>
  subscription: Pick<Subscription, 'id' | 'status' | 'startsAt' | 'endsAt'> | null
  limits: PlanLimits
}

/** Personal plan in force: an active personal subscription, otherwise Free. */
export async function personalEntitlement(userId: string): Promise<PersonalEntitlement> {
  const now = new Date()
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { startsAt: 'desc' },
    include: { plan: true },
  })
  if (subscription) {
    return {
      plan: { id: subscription.plan.id, key: subscription.plan.key, name: subscription.plan.name },
      subscription: { id: subscription.id, status: subscription.status, startsAt: subscription.startsAt, endsAt: subscription.endsAt },
      limits: planLimits(subscription.plan, subscription.limitOverrides),
    }
  }
  await ensureDefaultPlans()
  const free = await prisma.plan.findUniqueOrThrow({ where: { key: PLAN_KEYS.personalFree } })
  return { plan: { id: free.id, key: free.key, name: free.name }, subscription: null, limits: planLimits(free) }
}
