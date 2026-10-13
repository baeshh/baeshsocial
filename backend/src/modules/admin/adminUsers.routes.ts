import { UserRole, UserStatus, type Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { revokeUserSessions } from '../../services/auth/sessions.js'
import { personalEntitlement } from '../../services/billing/subscriptions.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'

/**
 * Platform account management. Roles and status are read from the DB on every request, so a role
 * change or suspension takes effect immediately; suspension also revokes all sessions.
 */
export const adminUsersRouter = Router()
adminUsersRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  role: z.enum(['all', 'user', 'company', 'institution', 'admin']).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
})

const PAGE_SIZE = 50

adminUsersRouter.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query)
    const where: Prisma.UserWhereInput = {
      ...(query.q ? { OR: [{ email: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] } : {}),
      ...(query.status !== 'all' ? { status: query.status.toUpperCase() as UserStatus } : {}),
      ...(query.role !== 'all' ? { role: query.role.toUpperCase() as UserRole } : {}),
    }
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          suspendedAt: true,
          suspendReason: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { organizationMemberships: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])
    const activeSessions = await prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((user) => user.id) }, revokedAt: null, expiresAt: { gt: new Date() } },
      _count: { _all: true },
    })
    const sessionsByUser = new Map(activeSessions.map((row) => [row.userId, row._count._all]))
    res.status(200).json({
      total,
      page: query.page,
      pageSize: PAGE_SIZE,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
        suspendedAt: user.suspendedAt,
        suspendReason: user.suspendReason,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        organizations: user._count.organizationMemberships,
        activeSessions: sessionsByUser.get(user.id) ?? 0,
      })),
    })
  } catch (error) {
    next(error)
  }
})

adminUsersRouter.get('/:userId', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.userId) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        suspendedAt: true,
        suspendReason: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        createdAt: true,
        organizationMemberships: {
          select: { role: true, status: true, organization: { select: { id: true, name: true, type: true } } },
        },
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
          orderBy: { lastSeenAt: 'desc' },
        },
      },
    })
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    const [entitlement, recentAudit] = await Promise.all([
      personalEntitlement(user.id),
      prisma.auditLog.findMany({
        where: { OR: [{ actorId: user.id }, { targetType: 'user', targetId: user.id }] },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, outcome: true, createdAt: true, ip: true, actorEmail: true, metadata: true },
      }),
    ])
    res.status(200).json({
      user: {
        ...user,
        role: user.role.toLowerCase(),
        status: user.status.toLowerCase(),
        organizationMemberships: user.organizationMemberships.map((membership) => ({
          organization: { ...membership.organization, type: membership.organization.type.toLowerCase() },
          role: membership.role.toLowerCase(),
          status: membership.status.toLowerCase(),
        })),
      },
      plan: entitlement.plan,
      personalSubscription: entitlement.subscription,
      recentAudit,
    })
  } catch (error) {
    next(error)
  }
})

adminUsersRouter.post('/:userId/suspend', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { reason } = z.object({ reason: z.string().trim().min(2).max(500) }).parse(req.body)
    const userId = String(req.params.userId)
    if (userId === authUser.id) throw new HttpError(400, '본인 계정은 정지할 수 없습니다.')
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, role: true } })
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    await prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED, suspendedAt: new Date(), suspendReason: reason },
    })
    const revoked = await revokeUserSessions(userId, 'admin_suspend')
    await audit(req, res, { action: 'admin.user_suspend', targetType: 'user', targetId: userId, metadata: { reason, revokedSessions: revoked } })
    res.status(200).json({ status: 'suspended', revokedSessions: revoked })
  } catch (error) {
    next(error)
  }
})

adminUsersRouter.post('/:userId/activate', async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE, suspendedAt: null, suspendReason: null } })
    await audit(req, res, { action: 'admin.user_activate', targetType: 'user', targetId: userId })
    res.status(200).json({ status: 'active' })
  } catch (error) {
    next(error)
  }
})

adminUsersRouter.patch('/:userId/role', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { role } = z
      .object({ role: z.enum(['user', 'company', 'institution', 'admin']).transform((value) => value.toUpperCase() as UserRole) })
      .parse(req.body)
    const userId = String(req.params.userId)
    if (userId === authUser.id) throw new HttpError(400, '본인 권한은 변경할 수 없습니다.')
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user) throw new HttpError(404, '사용자를 찾을 수 없습니다.')
    if (user.role === role) {
      res.status(200).json({ role: role.toLowerCase() })
      return
    }
    if (user.role === UserRole.ADMIN && (await prisma.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } })) <= 1) {
      throw new HttpError(409, '마지막 플랫폼 관리자의 권한은 회수할 수 없습니다.')
    }
    await prisma.user.update({ where: { id: userId }, data: { role } })
    // A demoted admin is signed out everywhere so no open console keeps elevated state.
    const revoked = user.role === UserRole.ADMIN ? await revokeUserSessions(userId, 'role_change') : 0
    await audit(req, res, {
      action: 'admin.user_role_change',
      targetType: 'user',
      targetId: userId,
      metadata: { from: user.role, to: role, revokedSessions: revoked },
    })
    res.status(200).json({ role: role.toLowerCase(), revokedSessions: revoked })
  } catch (error) {
    next(error)
  }
})

adminUsersRouter.post('/:userId/sessions/revoke', async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const revoked = await revokeUserSessions(userId, 'admin_revoke')
    await audit(req, res, { action: 'admin.user_sessions_revoke', targetType: 'user', targetId: userId, metadata: { revoked } })
    res.status(200).json({ revokedSessions: revoked })
  } catch (error) {
    next(error)
  }
})
