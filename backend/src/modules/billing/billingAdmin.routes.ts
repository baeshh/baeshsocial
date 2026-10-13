import {
  BillingPeriod,
  ContractStatus,
  EvidenceFileKind,
  InvoiceStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
  PaymentMethod,
  PaymentStatus,
  PlanAudience,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { computeOrgUsage, usageRows } from '../../services/billing/entitlements.js'
import { ensureDefaultPlans, ORG_LIMIT_KEYS, PERSONAL_LIMIT_KEYS, planLimits } from '../../services/billing/plans.js'
import { serializeContract, serializeInvoice, serializePlan, serializeSubscription } from '../../services/billing/serialize.js'
import { accessState, currentOrgSubscription, daysLeft } from '../../services/billing/subscriptions.js'
import { validateUpload } from '../../services/storage/fileValidation.js'
import { storage } from '../../services/storage/storage.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { serializeOrganization } from '../../utils/organizations.js'

/** Platform operator console for plans, subscriptions, contracts, invoices and payments. */
export const billingAdminRouter = Router()
billingAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

const DAY = 86_400_000
const VAT_RATE = 0.1

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } })

const dateInput = z.coerce.date()
const krw = z.coerce.number().int().min(0).max(10_000_000_000)
const limitValue = z.union([z.number().min(0).max(1_000_000), z.boolean(), z.null()])
const limitsSchema = z
  .record(z.string(), limitValue)
  .refine((value) => Object.keys(value).every((key) => [...ORG_LIMIT_KEYS, ...PERSONAL_LIMIT_KEYS].includes(key as never)), {
    message: '알 수 없는 한도 항목이 있습니다.',
  })

const planSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{3,40}$/, '키는 영문 소문자·숫자·밑줄 3~40자입니다.'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).nullable().optional(),
  audience: z.enum(['personal', 'organization']),
  orgTypes: z.array(z.enum(['university', 'institution', 'company'])).default([]),
  priceKrw: krw.nullable(),
  priceMaxKrw: krw.nullable().optional(),
  billingPeriod: z.enum(['month', 'semester', 'year', 'custom']),
  vatIncluded: z.boolean().default(false),
  limits: limitsSchema,
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  isPublic: z.boolean().default(true),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
})

const subscriptionSchema = z.object({
  planId: z.string().min(1).max(64),
  status: z.enum(['trial', 'active']).default('active'),
  startsAt: dateInput,
  endsAt: dateInput.nullable(),
  graceDays: z.coerce.number().int().min(0).max(365).default(30),
  limitOverrides: limitsSchema.nullable().optional(),
  autoRenew: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
})

const subscriptionPatchSchema = z.object({
  status: z.enum(['trial', 'active', 'past_due', 'expired', 'canceled']).optional(),
  endsAt: dateInput.nullable().optional(),
  graceDays: z.coerce.number().int().min(0).max(365).optional(),
  limitOverrides: limitsSchema.nullable().optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

const contractSchema = z.object({
  title: z.string().trim().min(2).max(120),
  subscriptionId: z.string().max(64).nullable().optional(),
  status: z.enum(['draft', 'sent', 'signed', 'active', 'expired', 'terminated']).default('draft'),
  amountKrw: krw,
  vatKrw: krw.default(0),
  startsAt: dateInput,
  endsAt: dateInput,
  signedAt: dateInput.nullable().optional(),
  billingContactName: z.string().trim().max(60).nullable().optional(),
  billingContactEmail: z.string().trim().email().max(200).nullable().optional(),
  taxInfo: z
    .object({
      businessNumber: z.string().trim().max(20).optional(),
      companyName: z.string().trim().max(120).optional(),
      representative: z.string().trim().max(60).optional(),
      address: z.string().trim().max(300).optional(),
      email: z.string().trim().email().max(200).optional(),
    })
    .nullable()
    .optional(),
  memo: z.string().trim().max(2000).nullable().optional(),
})

const invoiceSchema = z
  .object({
    organizationId: z.string().max(64).nullable().optional(),
    userId: z.string().max(64).nullable().optional(),
    subscriptionId: z.string().max(64).nullable().optional(),
    contractId: z.string().max(64).nullable().optional(),
    items: z
      .array(z.object({ description: z.string().trim().min(1).max(200), quantity: z.coerce.number().int().min(1).max(100_000), unitKrw: krw }))
      .min(1)
      .max(30),
    vatMode: z.enum(['exclusive', 'inclusive', 'exempt']).default('exclusive'),
    periodStart: dateInput.nullable().optional(),
    periodEnd: dateInput.nullable().optional(),
    dueAt: dateInput.nullable().optional(),
    memo: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Boolean(value.organizationId) !== Boolean(value.userId), { message: '조직 또는 개인 중 하나를 지정하세요.' })

const paymentSchema = z.object({
  method: z.enum(['bank_transfer', 'card', 'pg', 'other']),
  amountKrw: krw.refine((value) => value > 0, '입금액은 0보다 커야 합니다.'),
  paidAt: dateInput,
  reference: z.string().trim().max(120).nullable().optional(),
  memo: z.string().trim().max(1000).nullable().optional(),
})

const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>

function computeTotals(items: { quantity: number; unitKrw: number }[], vatMode: 'exclusive' | 'inclusive' | 'exempt') {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitKrw, 0)
  if (vatMode === 'exempt') return { supplyKrw: subtotal, vatKrw: 0, totalKrw: subtotal }
  if (vatMode === 'inclusive') {
    const supplyKrw = Math.round(subtotal / (1 + VAT_RATE))
    return { supplyKrw, vatKrw: subtotal - supplyKrw, totalKrw: subtotal }
  }
  const vatKrw = Math.round(subtotal * VAT_RATE)
  return { supplyKrw: subtotal, vatKrw, totalKrw: subtotal + vatKrw }
}

/** Sequential per-month numbers (`INV-202610-0001`); retries if two operators issue at once. */
async function nextNumber(prefix: 'INV' | 'CT', exists: (no: string) => Promise<boolean>) {
  const now = new Date()
  const stem = `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`
  const count =
    prefix === 'INV'
      ? await prisma.invoice.count({ where: { invoiceNo: { startsWith: stem } } })
      : await prisma.contract.count({ where: { contractNo: { startsWith: stem } } })
  for (let offset = 1; offset < 50; offset += 1) {
    const candidate = `${stem}${String(count + offset).padStart(4, '0')}`
    if (!(await exists(candidate))) return candidate
  }
  throw new HttpError(500, '번호를 발급하지 못했습니다.')
}

async function notifyOrgAdmins(organizationId: string, actorId: string, title: string, body: string, link: string) {
  const admins = await prisma.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } },
    select: { userId: true },
  })
  if (admins.length === 0) return
  await prisma.notification
    .createMany({ data: admins.map((admin) => ({ userId: admin.userId, actorId, type: 'SYSTEM' as const, title, body, link })) })
    .catch(() => undefined)
}

async function loadInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } })
  if (!invoice) throw new HttpError(404, '청구서를 찾을 수 없습니다.')
  return invoice
}

/* -------------------------------- Plans ------------------------------- */

billingAdminRouter.get('/plans', async (_req, res, next) => {
  try {
    await ensureDefaultPlans()
    const plans = await prisma.plan.findMany({
      orderBy: [{ audience: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    })
    res.status(200).json({
      plans: plans.map((plan) => ({ ...serializePlan(plan), subscriptionCount: plan._count.subscriptions })),
      limitKeys: { organization: ORG_LIMIT_KEYS, personal: PERSONAL_LIMIT_KEYS },
    })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/plans', async (req, res, next) => {
  try {
    const input = planSchema.parse(req.body)
    const plan = await prisma.plan.create({
      data: {
        ...input,
        audience: upper(input.audience) as PlanAudience,
        orgTypes: input.orgTypes.map((type) => upper(type) as OrganizationType),
        billingPeriod: upper(input.billingPeriod) as BillingPeriod,
        limits: input.limits as Prisma.InputJsonValue,
        priceMaxKrw: input.priceMaxKrw ?? null,
        description: input.description ?? null,
      },
    })
    await audit(req, res, { action: 'billing.plan_create', targetType: 'plan', targetId: plan.id, metadata: { key: plan.key } })
    res.status(201).json({ plan: serializePlan(plan) })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      next(new HttpError(409, '이미 사용 중인 요금제 키입니다.'))
      return
    }
    next(error)
  }
})

billingAdminRouter.patch('/plans/:planId', async (req, res, next) => {
  try {
    const input = planSchema.omit({ key: true, audience: true }).partial().parse(req.body)
    const before = await prisma.plan.findUnique({ where: { id: String(req.params.planId) } })
    if (!before) throw new HttpError(404, '요금제를 찾을 수 없습니다.')
    const { orgTypes, billingPeriod, limits, ...rest } = input
    const plan = await prisma.plan.update({
      where: { id: before.id },
      data: {
        ...rest,
        ...(orgTypes ? { orgTypes: orgTypes.map((type) => upper(type) as OrganizationType) } : {}),
        ...(billingPeriod ? { billingPeriod: upper(billingPeriod) as BillingPeriod } : {}),
        ...(limits ? { limits: limits as Prisma.InputJsonValue } : {}),
      },
    })
    await audit(req, res, {
      action: 'billing.plan_update',
      targetType: 'plan',
      targetId: plan.id,
      metadata: { key: plan.key, fields: Object.keys(input), before: { priceKrw: before.priceKrw, limits: before.limits } },
    })
    res.status(200).json({ plan: serializePlan(plan) })
  } catch (error) {
    next(error)
  }
})

/* ---------------------------- Organizations --------------------------- */

const orgListSchema = z.object({
  state: z.enum(['all', 'active', 'past_due', 'grace', 'expired', 'none', 'expiring']).default('all'),
  q: z.string().trim().max(80).optional(),
})

billingAdminRouter.get('/organizations', async (req, res, next) => {
  try {
    const query = orgListSchema.parse(req.query)
    const organizations = await prisma.organization.findMany({
      where: {
        verificationStatus: OrganizationVerificationStatus.APPROVED,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        _count: { select: { members: { where: { status: OrganizationMemberStatus.ACTIVE } }, programs: true } },
      },
      orderBy: { name: 'asc' },
      take: 500,
    })
    const subscriptions = await Promise.all(organizations.map((org) => currentOrgSubscription(org.id)))
    const outstanding = await prisma.invoice.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: organizations.map((org) => org.id) }, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] } },
      _sum: { totalKrw: true },
      _count: { _all: true },
    })
    const outstandingByOrg = new Map(outstanding.map((row) => [row.organizationId, row]))
    const rows = organizations.map((org, index) => {
      const subscription = subscriptions[index]
      const state = accessState(subscription)
      const left = daysLeft(subscription)
      const due = outstandingByOrg.get(org.id)
      return {
        id: org.id,
        name: org.name,
        type: org.type.toLowerCase(),
        members: org._count.members,
        programs: org._count.programs,
        plan: subscription ? { key: subscription.plan.key, name: subscription.plan.name } : null,
        subscriptionStatus: subscription?.status.toLowerCase() ?? null,
        state,
        endsAt: subscription?.endsAt ?? null,
        daysLeft: left,
        outstandingKrw: due?._sum.totalKrw ?? 0,
        outstandingInvoices: due?._count._all ?? 0,
      }
    })
    const filtered = rows.filter((row) =>
      query.state === 'all'
        ? true
        : query.state === 'expiring'
          ? row.daysLeft !== null && row.daysLeft >= 0 && row.daysLeft <= 30
          : row.state === query.state,
    )
    res.status(200).json({ organizations: filtered })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.get('/organizations/:orgId', async (req, res, next) => {
  try {
    const organization = await prisma.organization.findUnique({ where: { id: String(req.params.orgId) } })
    if (!organization) throw new HttpError(404, '조직을 찾을 수 없습니다.')
    const current = await currentOrgSubscription(organization.id)
    const [subscriptions, contracts, invoices, usage, history] = await Promise.all([
      prisma.subscription.findMany({ where: { organizationId: organization.id }, include: { plan: true }, orderBy: { startsAt: 'desc' } }),
      prisma.contract.findMany({ where: { organizationId: organization.id }, orderBy: { startsAt: 'desc' } }),
      prisma.invoice.findMany({ where: { organizationId: organization.id }, include: { payments: true }, orderBy: { createdAt: 'desc' } }),
      computeOrgUsage(organization.id, current),
      prisma.usageRecord.findMany({
        where: { organizationId: organization.id, day: { gte: new Date(Date.now() - 90 * DAY) } },
        orderBy: { day: 'asc' },
      }),
    ])
    const limits = current ? planLimits(current.plan, current.limitOverrides) : {}
    res.status(200).json({
      organization: serializeOrganization(organization, { platformAdmin: true }),
      current: current ? serializeSubscription(current) : null,
      usage: usageRows(limits, usage),
      usageHistory: history.map((row) => ({ metric: row.metric, day: row.day, value: Number(row.value) })),
      subscriptions: subscriptions.map(serializeSubscription),
      contracts: contracts.map(serializeContract),
      invoices: invoices.map(serializeInvoice),
    })
  } catch (error) {
    next(error)
  }
})

/* ---------------------------- Subscriptions --------------------------- */

/**
 * Starts a new subscription. Overlapping earlier periods are cut off at the new start date so
 * exactly one entitlement applies at any moment.
 */
billingAdminRouter.post('/organizations/:orgId/subscriptions', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = subscriptionSchema.parse(req.body)
    const organization = await prisma.organization.findUnique({ where: { id: String(req.params.orgId) }, select: { id: true, name: true } })
    if (!organization) throw new HttpError(404, '조직을 찾을 수 없습니다.')
    const plan = await prisma.plan.findUnique({ where: { id: input.planId } })
    if (!plan || plan.audience !== PlanAudience.ORGANIZATION) throw new HttpError(400, '조직용 요금제를 선택하세요.')
    if (input.endsAt && input.endsAt <= input.startsAt) throw new HttpError(400, '종료일은 시작일 이후여야 합니다.')

    const subscription = await prisma.$transaction(async (tx) => {
      const overlapping = await tx.subscription.findMany({
        where: {
          organizationId: organization.id,
          status: { in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
          ...(input.endsAt ? { startsAt: { lt: input.endsAt } } : {}),
          OR: [{ endsAt: null }, { endsAt: { gt: input.startsAt } }],
        },
        select: { id: true, startsAt: true },
      })
      const endEarly = overlapping.filter((row) => row.startsAt < input.startsAt).map((row) => row.id)
      const cancel = overlapping.filter((row) => row.startsAt >= input.startsAt).map((row) => row.id)
      if (endEarly.length) {
        await tx.subscription.updateMany({
          where: { id: { in: endEarly } },
          data: { endsAt: input.startsAt, graceDays: 0, notes: '새 구독으로 대체됨' },
        })
      }
      if (cancel.length) {
        await tx.subscription.updateMany({
          where: { id: { in: cancel } },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date(), notes: '새 구독으로 대체됨' },
        })
      }
      return tx.subscription.create({
        data: {
          organizationId: organization.id,
          planId: plan.id,
          status: upper(input.status) as SubscriptionStatus,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          graceDays: input.graceDays,
          limitOverrides: (input.limitOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue,
          autoRenew: input.autoRenew,
          notes: input.notes ?? null,
          createdById: authUser.id,
        },
        include: { plan: true },
      })
    })
    await audit(req, res, {
      action: 'billing.subscription_create',
      organizationId: organization.id,
      targetType: 'subscription',
      targetId: subscription.id,
      metadata: { plan: plan.key, startsAt: input.startsAt, endsAt: input.endsAt },
    })
    await notifyOrgAdmins(
      organization.id,
      authUser.id,
      '요금제가 적용되었습니다',
      `${organization.name} · ${plan.name}${input.endsAt ? ` (~${input.endsAt.toISOString().slice(0, 10)})` : ''}`,
      `/org/${organization.id}?tab=billing`,
    )
    res.status(201).json({ subscription: serializeSubscription(subscription) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.patch('/subscriptions/:subscriptionId', async (req, res, next) => {
  try {
    const input = subscriptionPatchSchema.parse(req.body)
    const before = await prisma.subscription.findUnique({ where: { id: String(req.params.subscriptionId) } })
    if (!before) throw new HttpError(404, '구독을 찾을 수 없습니다.')
    const subscription = await prisma.subscription.update({
      where: { id: before.id },
      data: {
        ...(input.status ? { status: upper(input.status) as SubscriptionStatus } : {}),
        ...(input.status === 'canceled' ? { canceledAt: new Date() } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
        ...(input.graceDays !== undefined ? { graceDays: input.graceDays } : {}),
        ...(input.limitOverrides !== undefined
          ? { limitOverrides: (input.limitOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue }
          : {}),
        ...(input.autoRenew !== undefined ? { autoRenew: input.autoRenew } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { plan: true },
    })
    await audit(req, res, {
      action: 'billing.subscription_update',
      organizationId: before.organizationId,
      targetType: 'subscription',
      targetId: before.id,
      metadata: { fields: Object.keys(input), before: { status: before.status, endsAt: before.endsAt, limitOverrides: before.limitOverrides } },
    })
    res.status(200).json({ subscription: serializeSubscription(subscription) })
  } catch (error) {
    next(error)
  }
})

/** Renewal: a new period of the same plan starting when the current one ends. */
billingAdminRouter.post('/subscriptions/:subscriptionId/renew', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { endsAt, planId } = z.object({ endsAt: dateInput, planId: z.string().max(64).optional() }).parse(req.body)
    const previous = await prisma.subscription.findUnique({ where: { id: String(req.params.subscriptionId) }, include: { plan: true } })
    if (!previous?.organizationId) throw new HttpError(404, '조직 구독을 찾을 수 없습니다.')
    const startsAt = previous.endsAt && previous.endsAt > new Date() ? previous.endsAt : new Date()
    if (endsAt <= startsAt) throw new HttpError(400, '갱신 종료일은 현재 기간 종료일 이후여야 합니다.')
    const plan = planId ? await prisma.plan.findUnique({ where: { id: planId } }) : previous.plan
    if (!plan || plan.audience !== PlanAudience.ORGANIZATION) throw new HttpError(400, '조직용 요금제를 선택하세요.')
    const renewed = await prisma.$transaction(async (tx) => {
      if (!previous.endsAt || previous.endsAt > startsAt) {
        await tx.subscription.update({ where: { id: previous.id }, data: { endsAt: startsAt, graceDays: 0 } })
      }
      return tx.subscription.create({
        data: {
          organizationId: previous.organizationId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt,
          endsAt,
          graceDays: previous.graceDays || 30,
          limitOverrides: (previous.limitOverrides ?? Prisma.DbNull) as Prisma.InputJsonValue,
          autoRenew: previous.autoRenew,
          notes: `갱신 (이전 구독 ${previous.id})`,
          createdById: authUser.id,
        },
        include: { plan: true },
      })
    })
    await audit(req, res, {
      action: 'billing.subscription_renew',
      organizationId: previous.organizationId,
      targetType: 'subscription',
      targetId: renewed.id,
      metadata: { previousId: previous.id, plan: plan.key, startsAt, endsAt },
    })
    res.status(201).json({ subscription: serializeSubscription(renewed) })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------ Contracts ----------------------------- */

billingAdminRouter.post('/organizations/:orgId/contracts', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = contractSchema.parse(req.body)
    const organizationId = String(req.params.orgId)
    if (!(await prisma.organization.count({ where: { id: organizationId } }))) throw new HttpError(404, '조직을 찾을 수 없습니다.')
    if (input.endsAt <= input.startsAt) throw new HttpError(400, '종료일은 시작일 이후여야 합니다.')
    if (input.subscriptionId && !(await prisma.subscription.count({ where: { id: input.subscriptionId, organizationId } }))) {
      throw new HttpError(400, '이 조직의 구독이 아닙니다.')
    }
    const contractNo = await nextNumber('CT', async (no) => Boolean(await prisma.contract.count({ where: { contractNo: no } })))
    const contract = await prisma.contract.create({
      data: {
        ...input,
        organizationId,
        contractNo,
        status: upper(input.status) as ContractStatus,
        taxInfo: (input.taxInfo ?? Prisma.DbNull) as Prisma.InputJsonValue,
        createdById: authUser.id,
      },
    })
    await audit(req, res, {
      action: 'billing.contract_create',
      organizationId,
      targetType: 'contract',
      targetId: contract.id,
      metadata: { contractNo, amountKrw: input.amountKrw },
    })
    res.status(201).json({ contract: serializeContract(contract) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.patch('/contracts/:contractId', async (req, res, next) => {
  try {
    const input = contractSchema.partial().parse(req.body)
    const before = await prisma.contract.findUnique({ where: { id: String(req.params.contractId) } })
    if (!before) throw new HttpError(404, '계약을 찾을 수 없습니다.')
    const { status, taxInfo, ...rest } = input
    const contract = await prisma.contract.update({
      where: { id: before.id },
      data: {
        ...rest,
        ...(status ? { status: upper(status) as ContractStatus } : {}),
        ...(taxInfo !== undefined ? { taxInfo: (taxInfo ?? Prisma.DbNull) as Prisma.InputJsonValue } : {}),
      } as Prisma.ContractUncheckedUpdateInput,
    })
    await audit(req, res, {
      action: 'billing.contract_update',
      organizationId: before.organizationId,
      targetType: 'contract',
      targetId: before.id,
      metadata: { fields: Object.keys(input), statusFrom: before.status, statusTo: contract.status },
    })
    res.status(200).json({ contract: serializeContract(contract) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/contracts/:contractId/document', upload.single('file'), async (req, res, next) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: String(req.params.contractId) } })
    if (!contract) throw new HttpError(404, '계약을 찾을 수 없습니다.')
    if (!req.file) throw new HttpError(400, '계약서 PDF를 선택하세요.')
    const file = await validateUpload(req.file)
    if (file.kind !== EvidenceFileKind.PDF) throw new HttpError(400, '계약서는 PDF만 올릴 수 있습니다.')
    const key = `contracts/${contract.organizationId}/${contract.id}-${Date.now()}.pdf`
    await storage.put(key, file.buffer, 'application/pdf')
    const previousKey = contract.documentKey
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { documentKey: key, documentName: file.originalName },
    })
    if (previousKey) await storage.remove(previousKey).catch(() => undefined)
    await audit(req, res, {
      action: 'billing.contract_document_upload',
      organizationId: contract.organizationId,
      targetType: 'contract',
      targetId: contract.id,
      metadata: { sha256: file.sha256, sizeBytes: file.sizeBytes },
    })
    res.status(200).json({ contract: serializeContract(updated) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.get('/contracts/:contractId/document', async (req, res, next) => {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: String(req.params.contractId) } })
    if (!contract?.documentKey) throw new HttpError(404, '계약서 파일이 없습니다.')
    const signed = await storage.signedUrl(contract.documentKey, {
      contentType: 'application/pdf',
      fileName: contract.documentName ?? `${contract.contractNo}.pdf`,
      inline: req.query.inline === '1',
    })
    await audit(req, res, {
      action: 'billing.contract_download',
      organizationId: contract.organizationId,
      targetType: 'contract',
      targetId: contract.id,
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(signed)
  } catch (error) {
    next(error)
  }
})

/* --------------------------- Invoices/payments ------------------------ */

const invoiceListSchema = z.object({
  status: z.enum(['all', 'draft', 'issued', 'paid', 'overdue', 'void']).default('all'),
  organizationId: z.string().max(64).optional(),
})

billingAdminRouter.get('/invoices', async (req, res, next) => {
  try {
    const query = invoiceListSchema.parse(req.query)
    const now = new Date()
    const statusWhere: Prisma.InvoiceWhereInput =
      query.status === 'all'
        ? {}
        : query.status === 'overdue'
          ? { OR: [{ status: InvoiceStatus.OVERDUE }, { status: InvoiceStatus.ISSUED, dueAt: { lt: now } }] }
          : { status: upper(query.status) as InvoiceStatus }
    const invoices = await prisma.invoice.findMany({
      where: { ...statusWhere, ...(query.organizationId ? { organizationId: query.organizationId } : {}) },
      include: { payments: true, organization: { select: { id: true, name: true } }, user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    res.status(200).json({
      invoices: invoices.map((invoice) => ({
        ...serializeInvoice(invoice),
        organization: invoice.organization,
        user: invoice.user,
      })),
    })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/invoices', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = invoiceSchema.parse(req.body)
    if (input.organizationId && !(await prisma.organization.count({ where: { id: input.organizationId } }))) {
      throw new HttpError(404, '조직을 찾을 수 없습니다.')
    }
    if (input.userId && !(await prisma.user.count({ where: { id: input.userId } }))) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    const totals = computeTotals(input.items, input.vatMode)
    const invoiceNo = await nextNumber('INV', async (no) => Boolean(await prisma.invoice.count({ where: { invoiceNo: no } })))
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo,
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        contractId: input.contractId ?? null,
        ...totals,
        items: { lines: input.items, vatMode: input.vatMode } as Prisma.InputJsonValue,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        dueAt: input.dueAt ?? null,
        memo: input.memo ?? null,
        createdById: authUser.id,
      },
      include: { payments: true },
    })
    await audit(req, res, {
      action: 'billing.invoice_create',
      organizationId: invoice.organizationId,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { invoiceNo, totalKrw: totals.totalKrw, vatMode: input.vatMode },
    })
    res.status(201).json({ invoice: serializeInvoice(invoice) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.patch('/invoices/:invoiceId', async (req, res, next) => {
  try {
    const input = z
      .object({
        dueAt: dateInput.nullable().optional(),
        taxInvoiceNo: z.string().trim().max(60).nullable().optional(),
        memo: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(req.body)
    const invoice = await loadInvoice(String(req.params.invoiceId))
    const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: input, include: { payments: true } })
    await audit(req, res, {
      action: 'billing.invoice_update',
      organizationId: invoice.organizationId,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { fields: Object.keys(input) },
    })
    res.status(200).json({ invoice: serializeInvoice(updated) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/invoices/:invoiceId/issue', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = z
      .object({ dueAt: dateInput.optional(), taxInvoiceNo: z.string().trim().max(60).nullable().optional() })
      .parse(req.body ?? {})
    const invoice = await loadInvoice(String(req.params.invoiceId))
    if (invoice.status !== InvoiceStatus.DRAFT) throw new HttpError(409, '초안 상태의 청구서만 발행할 수 있습니다.')
    const dueAt = input.dueAt ?? invoice.dueAt ?? new Date(Date.now() + 30 * DAY)
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.ISSUED, issuedAt: new Date(), dueAt, ...(input.taxInvoiceNo !== undefined ? { taxInvoiceNo: input.taxInvoiceNo } : {}) },
      include: { payments: true },
    })
    await audit(req, res, {
      action: 'billing.invoice_issue',
      organizationId: invoice.organizationId,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { invoiceNo: invoice.invoiceNo, totalKrw: invoice.totalKrw, dueAt },
    })
    if (invoice.organizationId) {
      await notifyOrgAdmins(
        invoice.organizationId,
        authUser.id,
        '청구서가 발행되었습니다',
        `${invoice.invoiceNo} · ${invoice.totalKrw.toLocaleString('ko-KR')}원 · 납부기한 ${dueAt.toISOString().slice(0, 10)}`,
        `/org/${invoice.organizationId}?tab=billing`,
      )
    }
    res.status(200).json({ invoice: serializeInvoice(updated) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/invoices/:invoiceId/void', async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body)
    const invoice = await loadInvoice(String(req.params.invoiceId))
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.VOID) {
      throw new HttpError(409, '결제 완료되었거나 이미 취소된 청구서입니다.')
    }
    if (invoice.payments.some((payment) => payment.status === PaymentStatus.CONFIRMED)) {
      throw new HttpError(409, '입금 기록이 있는 청구서는 먼저 입금을 취소해야 합니다.')
    }
    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.VOID, voidedAt: new Date(), memo: [invoice.memo, `취소 사유: ${reason}`].filter(Boolean).join('\n') },
      include: { payments: true },
    })
    await audit(req, res, {
      action: 'billing.invoice_void',
      organizationId: invoice.organizationId,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { reason },
    })
    res.status(200).json({ invoice: serializeInvoice(updated) })
  } catch (error) {
    next(error)
  }
})

/**
 * Records a (bank transfer etc.) payment. Once confirmed payments cover the total the invoice is
 * PAID, and a PAST_DUE subscription it belongs to goes back to ACTIVE.
 */
billingAdminRouter.post('/invoices/:invoiceId/payments', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = paymentSchema.parse(req.body)
    const invoice = await loadInvoice(String(req.params.invoiceId))
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.OVERDUE) {
      throw new HttpError(409, '발행된 청구서에만 입금을 기록할 수 있습니다.')
    }
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          method: upper(input.method) as PaymentMethod,
          amountKrw: input.amountKrw,
          paidAt: input.paidAt,
          reference: input.reference ?? null,
          memo: input.memo ?? null,
          recordedById: authUser.id,
        },
      })
      const paid = await tx.payment.aggregate({
        where: { invoiceId: invoice.id, status: PaymentStatus.CONFIRMED },
        _sum: { amountKrw: true },
      })
      const fullyPaid = (paid._sum.amountKrw ?? 0) >= invoice.totalKrw
      if (fullyPaid) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.PAID, paidAt: input.paidAt } })
        if (invoice.subscriptionId) {
          await tx.subscription.updateMany({
            where: { id: invoice.subscriptionId, status: SubscriptionStatus.PAST_DUE },
            data: { status: SubscriptionStatus.ACTIVE },
          })
        }
      }
      return { payment, fullyPaid }
    })
    await audit(req, res, {
      action: 'billing.payment_record',
      organizationId: invoice.organizationId,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { paymentId: result.payment.id, amountKrw: input.amountKrw, method: input.method, fullyPaid: result.fullyPaid },
    })
    res.status(201).json({ invoice: serializeInvoice(await loadInvoice(invoice.id)) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.post('/payments/:paymentId/cancel', async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body)
    const payment = await prisma.payment.findUnique({ where: { id: String(req.params.paymentId) }, include: { invoice: true } })
    if (!payment || payment.status !== PaymentStatus.CONFIRMED) throw new HttpError(404, '확정된 입금 기록을 찾을 수 없습니다.')
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.CANCELED, memo: `취소: ${reason}` } })
      if (payment.invoice.status === InvoiceStatus.PAID) {
        await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: InvoiceStatus.ISSUED, paidAt: null } })
      }
    })
    await audit(req, res, {
      action: 'billing.payment_cancel',
      organizationId: payment.invoice.organizationId,
      targetType: 'payment',
      targetId: payment.id,
      metadata: { invoiceId: payment.invoiceId, reason },
    })
    res.status(200).json({ invoice: serializeInvoice(await loadInvoice(payment.invoiceId)) })
  } catch (error) {
    next(error)
  }
})

/* ---------------------------- Personal plans -------------------------- */

billingAdminRouter.post('/users/:userId/personal-plan', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = z
      .object({ planId: z.string().max(64), endsAt: dateInput.nullable(), notes: z.string().trim().max(500).nullable().optional() })
      .parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: String(req.params.userId) }, select: { id: true, name: true } })
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    const plan = await prisma.plan.findUnique({ where: { id: input.planId } })
    if (!plan || plan.audience !== PlanAudience.PERSONAL) throw new HttpError(400, '개인 요금제를 선택하세요.')
    const now = new Date()
    const subscription = await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { userId: user.id, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE] } },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: now },
      })
      return tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          startsAt: now,
          endsAt: input.endsAt,
          graceDays: 0,
          notes: input.notes ?? null,
          createdById: authUser.id,
        },
        include: { plan: true },
      })
    })
    await audit(req, res, {
      action: 'billing.personal_plan_grant',
      targetType: 'user',
      targetId: user.id,
      metadata: { plan: plan.key, endsAt: input.endsAt },
    })
    res.status(201).json({ subscription: serializeSubscription(subscription) })
  } catch (error) {
    next(error)
  }
})

billingAdminRouter.delete('/users/:userId/personal-plan', async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const { count } = await prisma.subscription.updateMany({
      where: { userId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL, SubscriptionStatus.PAST_DUE] } },
      data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
    })
    await audit(req, res, { action: 'billing.personal_plan_cancel', targetType: 'user', targetId: userId, metadata: { canceled: count } })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/* ------------------------------- Summary ------------------------------ */

billingAdminRouter.get('/summary', async (_req, res, next) => {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const [paidMonth, paidYear, outstanding, overdue, orgs, personalPro] = await Promise.all([
      prisma.payment.aggregate({ where: { status: PaymentStatus.CONFIRMED, paidAt: { gte: monthStart } }, _sum: { amountKrw: true } }),
      prisma.payment.aggregate({ where: { status: PaymentStatus.CONFIRMED, paidAt: { gte: yearStart } }, _sum: { amountKrw: true } }),
      prisma.invoice.aggregate({
        where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] } },
        _sum: { totalKrw: true },
        _count: { _all: true },
      }),
      prisma.invoice.count({
        where: { OR: [{ status: InvoiceStatus.OVERDUE }, { status: InvoiceStatus.ISSUED, dueAt: { lt: now } }] },
      }),
      prisma.organization.findMany({ where: { verificationStatus: OrganizationVerificationStatus.APPROVED }, select: { id: true, name: true } }),
      prisma.subscription.count({
        where: {
          userId: { not: null },
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      }),
    ])
    const subs = await Promise.all(orgs.map((org) => currentOrgSubscription(org.id)))
    const byState: Record<string, number> = { active: 0, past_due: 0, grace: 0, expired: 0, none: 0 }
    const byPlan: Record<string, number> = {}
    const expiring: { id: string; name: string; plan: string; endsAt: Date; daysLeft: number }[] = []
    subs.forEach((sub, index) => {
      const state = accessState(sub)
      byState[state] += 1
      if (sub) byPlan[sub.plan.name] = (byPlan[sub.plan.name] ?? 0) + 1
      const left = daysLeft(sub)
      if (sub?.endsAt && left !== null && left >= 0 && left <= 30) {
        expiring.push({ id: orgs[index].id, name: orgs[index].name, plan: sub.plan.name, endsAt: sub.endsAt, daysLeft: left })
      }
    })
    res.status(200).json({
      revenue: { paidThisMonthKrw: paidMonth._sum.amountKrw ?? 0, paidThisYearKrw: paidYear._sum.amountKrw ?? 0 },
      receivables: { outstandingKrw: outstanding._sum.totalKrw ?? 0, outstandingInvoices: outstanding._count._all, overdueInvoices: overdue },
      organizations: { total: orgs.length, byState, byPlan },
      personalProSubscribers: personalPro,
      expiring: expiring.sort((a, b) => a.daysLeft - b.daysLeft),
    })
  } catch (error) {
    next(error)
  }
})
