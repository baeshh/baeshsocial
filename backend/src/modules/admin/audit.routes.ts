import { OrganizationRole, UserRole, type Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'

export const adminAuditRouter = Router()
export const organizationAuditRouter = Router({ mergeParams: true })

const querySchema = z.object({
  action: z.string().trim().max(80).optional(),
  outcome: z.enum(['all', 'success', 'denied', 'failure']).default('all'),
  actor: z.string().trim().max(200).optional(),
  organizationId: z.string().max(64).optional(),
  targetId: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

const auditSelect = {
  id: true,
  actorId: true,
  actorEmail: true,
  organizationId: true,
  action: true,
  targetType: true,
  targetId: true,
  outcome: true,
  metadata: true,
  ip: true,
  userAgent: true,
  requestId: true,
  createdAt: true,
  organization: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogSelect

function buildWhere(query: z.infer<typeof querySchema>): Prisma.AuditLogWhereInput {
  return {
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.outcome !== 'all' ? { outcome: query.outcome } : {}),
    ...(query.actor ? { OR: [{ actorEmail: { contains: query.actor, mode: 'insensitive' } }, { actorId: query.actor }] } : {}),
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
  }
}

async function page(where: Prisma.AuditLogWhereInput, query: z.infer<typeof querySchema>) {
  const rows = await prisma.auditLog.findMany({
    where,
    select: auditSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > query.limit
  const logs = rows.slice(0, query.limit)
  return { logs, nextCursor: hasMore ? logs[logs.length - 1].id : null }
}

adminAuditRouter.get('/', authenticate, requireRoles([UserRole.ADMIN]), async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query)
    const [result, denied24h] = await Promise.all([
      page(buildWhere(query), query),
      prisma.auditLog.count({ where: { outcome: 'denied', createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
    ])
    res.status(200).json({ ...result, stats: { denied24h } })
  } catch (error) {
    next(error)
  }
})

/** Organization admins see only their organization's trail (IP/user agent omitted). */
organizationAuditRouter.get(
  '/',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN, requireApproved: true }),
  async (req, res, next) => {
    try {
      const { organization } = res.locals.orgAccess as OrgAccess
      const query = querySchema.parse(req.query)
      const result = await page({ ...buildWhere({ ...query, organizationId: undefined }), organizationId: organization.id }, query)
      res.status(200).json({
        ...result,
        logs: result.logs.map(({ ip: _ip, userAgent: _ua, ...log }) =>
          log.action === 'org.access_denied' ? { ...log, actorId: null, actorEmail: null } : log,
        ),
      })
    } catch (error) {
      next(error)
    }
  },
)
