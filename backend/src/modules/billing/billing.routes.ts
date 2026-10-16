import { OrganizationRole, PlanAudience } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { getAiQuota } from '../../services/ai/runner.js'
import { audit } from '../../services/audit/audit.js'
import { computeOrgUsage, orgEntitlement, usageRows } from '../../services/billing/entitlements.js'
import { ensureDefaultPlans, LIMIT_LABELS } from '../../services/billing/plans.js'
import { serializeContract, serializeInvoice, serializePlan, serializeSubscription } from '../../services/billing/serialize.js'
import { personalEntitlement } from '../../services/billing/subscriptions.js'
import { storage } from '../../services/storage/storage.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'

export const organizationBillingRouter = Router({ mergeParams: true })
export const billingRouter = Router()

const WARN_RATIO = 0.8

/* ------------------------------------------------------------------ */
/* /api/organizations/:orgId/billing                                   */
/* ------------------------------------------------------------------ */

/** Managers see plan and usage; contract and invoice details are limited to org admins. */
organizationBillingRouter.get(
  '/',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.MANAGER }),
  async (_req, res, next) => {
    try {
      const { organization, membership } = res.locals.orgAccess as OrgAccess
      const isAdmin = hasOrgRole(membership.role, OrganizationRole.ADMIN)
      const entitlement = await orgEntitlement(organization.id)
      const usage = usageRows(entitlement.limits, await computeOrgUsage(organization.id, entitlement.subscription))
      const warnings: { key: string; level: 'warning' | 'critical'; message: string }[] = usage
        .filter((row) => row.limit !== null && row.ratio !== null && row.ratio >= WARN_RATIO)
        .map((row) => ({
          key: row.key,
          level: (row.exceeded || row.used >= (row.limit ?? Infinity) ? 'critical' : 'warning') as 'warning' | 'critical',
          message: `${row.label} 사용량이 한도의 ${Math.round((row.used / (row.limit ?? 1)) * 100)}%입니다.`,
        }))
      if (entitlement.daysLeft !== null && entitlement.daysLeft <= 30 && entitlement.daysLeft > 0) {
        warnings.push({ key: 'expiry', level: entitlement.daysLeft <= 7 ? 'critical' : 'warning', message: `이용 기간이 ${entitlement.daysLeft}일 남았습니다.` })
      }

      const [contracts, invoices] = isAdmin
        ? await Promise.all([
            prisma.contract.findMany({ where: { organizationId: organization.id }, orderBy: { startsAt: 'desc' }, take: 20 }),
            prisma.invoice.findMany({
              where: { organizationId: organization.id, status: { not: 'DRAFT' } },
              include: { payments: true },
              orderBy: { createdAt: 'desc' },
              take: 50,
            }),
          ])
        : [[], []]

      const subscription = entitlement.subscription ? serializeSubscription(entitlement.subscription) : null
      res.status(200).json({
        state: entitlement.state,
        canCreate: entitlement.canCreate,
        daysLeft: entitlement.daysLeft,
        subscription: subscription ? { ...subscription, notes: isAdmin ? subscription.notes : null } : null,
        plan: entitlement.subscription ? serializePlan(entitlement.subscription.plan) : null,
        usage,
        warnings,
        contracts: contracts.map((contract) => ({ ...serializeContract(contract), memo: null })),
        invoices: invoices.map((invoice) => ({ ...serializeInvoice(invoice), memo: null })),
        canSeeContracts: isAdmin,
        policy: {
          grace: '이용 기간 종료 후 유예 기간에는 기존 자료 조회·다운로드만 가능하고 새 항목은 만들 수 없습니다.',
          expired: '유예 기간이 지나도 데이터는 자동 삭제되지 않으며, 계약 갱신 시 그대로 이어서 사용합니다.',
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

organizationBillingRouter.get(
  '/contracts/:contractId/document',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN }),
  async (req, res, next) => {
    try {
      const { organization } = res.locals.orgAccess as OrgAccess
      const contract = await prisma.contract.findFirst({
        where: { id: String(req.params.contractId), organizationId: organization.id },
        select: { id: true, documentKey: true, documentName: true },
      })
      if (!contract?.documentKey) throw new HttpError(404, '계약서 파일이 없습니다.')
      const signed = await storage.signedUrl(contract.documentKey, {
        contentType: 'application/pdf',
        fileName: contract.documentName ?? 'contract.pdf',
        inline: false,
      })
      await audit(req, res, { action: 'billing.contract_download', organizationId: organization.id, targetType: 'contract', targetId: contract.id })
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(signed)
    } catch (error) {
      next(error)
    }
  },
)

/* ------------------------------------------------------------------ */
/* /api/billing                                                        */
/* ------------------------------------------------------------------ */

/** Public catalog for the pricing page. Prices are indicative; organizations get a quote. */
billingRouter.get('/plans', async (_req, res, next) => {
  try {
    await ensureDefaultPlans()
    const plans = await prisma.plan.findMany({ where: { isPublic: true, active: true }, orderBy: { sortOrder: 'asc' } })
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.status(200).json({
      plans: plans.map(serializePlan),
      limitLabels: LIMIT_LABELS,
      audiences: { personal: PlanAudience.PERSONAL.toLowerCase(), organization: PlanAudience.ORGANIZATION.toLowerCase() },
    })
  } catch (error) {
    next(error)
  }
})

billingRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const [entitlement, quota, portfolios, invoices] = await Promise.all([
      personalEntitlement(authUser.id),
      getAiQuota(authUser.id),
      prisma.aIAnalysis.count({
        where: { userId: authUser.id, type: 'PORTFOLIO_GENERATOR', createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
      prisma.invoice.findMany({
        where: { userId: authUser.id, status: { not: 'DRAFT' } },
        include: { payments: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])
    const plan = await prisma.plan.findUnique({ where: { id: entitlement.plan.id } })
    res.status(200).json({
      plan: plan ? serializePlan(plan) : null,
      subscription: entitlement.subscription,
      limits: entitlement.limits,
      usage: {
        aiCallsPerDay: { used: quota.used, limit: quota.limit },
        portfoliosPerMonth: {
          used: portfolios,
          limit: typeof entitlement.limits.portfoliosPerMonth === 'number' ? entitlement.limits.portfoliosPerMonth : null,
        },
        portfolioPdf: entitlement.limits.portfolioPdf === true,
      },
      invoices: invoices.map((invoice) => ({ ...serializeInvoice(invoice), memo: null })),
      upgrade: {
        available: entitlement.plan.key === 'personal_free',
        message: '개인 Pro 결제는 준비 중입니다. 먼저 이용을 원하시면 지원 요청으로 문의해 주세요.',
      },
    })
  } catch (error) {
    next(error)
  }
})
