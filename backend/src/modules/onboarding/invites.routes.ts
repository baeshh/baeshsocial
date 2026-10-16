import { OrganizationInviteStatus, OrganizationRole, type Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { limits } from '../../middlewares/rateLimit.js'
import { audit } from '../../services/audit/audit.js'
import { acceptInviteToken, createInvites, previewInvite, resendInvite } from '../../services/onboarding/invites.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole, toApiOrgRole } from '../../utils/organizations.js'
import { assertProgramWritable, listManagedPrograms, requireProgramAccess } from '../../utils/programAccess.js'

export const organizationInvitesRouter = Router({ mergeParams: true })
export const invitesRouter = Router()

const MAX_ROWS = 500

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

const roleSchema = z
  .enum(['admin', 'manager', 'member'])
  .transform((value) => value.toUpperCase() as OrganizationRole)

const bulkInviteSchema = z.object({
  programId: z.string().min(1).max(64).nullable().optional(),
  role: roleSchema.optional(),
  rows: z
    .array(
      z.object({
        email: z.string().trim().max(200),
        name: optionalText(80),
        role: roleSchema.optional(),
        studentNo: optionalText(40),
        department: optionalText(80),
      }),
    )
    .min(1, '초대할 사람을 1명 이상 입력하세요.')
    .max(MAX_ROWS, `한 번에 최대 ${MAX_ROWS}명까지 초대할 수 있습니다.`),
})

const listQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'revoked', 'expired', 'all']).default('all'),
  programId: z.string().max(64).optional(),
  batchId: z.string().max(32).optional(),
})

const staffAccess = requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true })

const inviteInclude = {
  program: { select: { id: true, title: true } },
  invitedBy: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, status: true } },
} satisfies Prisma.OrganizationInviteInclude

type InviteRow = Prisma.OrganizationInviteGetPayload<{ include: typeof inviteInclude }>

function serializeInvite(invite: InviteRow) {
  const expired = invite.status === OrganizationInviteStatus.PENDING && invite.expiresAt <= new Date()
  return {
    id: invite.id,
    email: invite.email,
    name: invite.name,
    role: toApiOrgRole(invite.role),
    program: invite.program,
    studentNo: invite.studentNo,
    department: invite.department,
    status: expired ? 'expired' : invite.status.toLowerCase(),
    batchId: invite.batchId,
    invitedBy: invite.invitedBy,
    acceptedBy: invite.acceptedBy
      ? { id: invite.acceptedBy.id, name: invite.acceptedBy.name, accountStatus: invite.acceptedBy.status.toLowerCase() }
      : null,
    acceptedAt: invite.acceptedAt,
    expiresAt: invite.expiresAt,
    lastSentAt: invite.lastSentAt,
    sendCount: invite.sendCount,
    createdAt: invite.createdAt,
  }
}

/** Org admins see every invite; managers only those they sent or for programs they manage. */
async function inviteScope(access: OrgAccess, userId: string): Promise<Prisma.OrganizationInviteWhereInput> {
  if (hasOrgRole(access.membership.role, OrganizationRole.ADMIN)) return { organizationId: access.organization.id }
  const { programs } = await listManagedPrograms(access.organization, access.membership, userId)
  return {
    organizationId: access.organization.id,
    OR: [{ invitedById: userId }, { programId: { in: programs.map((program) => program.id) } }],
  }
}

async function findScopedInvite(access: OrgAccess, userId: string, inviteId: string) {
  const invite = await prisma.organizationInvite.findFirst({
    where: { AND: [await inviteScope(access, userId), { id: inviteId }] },
    include: inviteInclude,
  })
  if (!invite) throw new HttpError(404, '초대를 찾을 수 없습니다.')
  return invite
}

/* ------------------------------------------------------------------ */
/* /api/organizations/:orgId/invites                                   */
/* ------------------------------------------------------------------ */

organizationInvitesRouter.get('/', authenticate, staffAccess, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = res.locals.orgAccess as OrgAccess
    const query = listQuerySchema.parse(req.query)
    const now = new Date()
    const statusWhere: Prisma.OrganizationInviteWhereInput =
      query.status === 'all'
        ? {}
        : query.status === 'expired'
          ? { OR: [{ status: OrganizationInviteStatus.EXPIRED }, { status: OrganizationInviteStatus.PENDING, expiresAt: { lte: now } }] }
          : query.status === 'pending'
            ? { status: OrganizationInviteStatus.PENDING, expiresAt: { gt: now } }
            : { status: query.status.toUpperCase() as OrganizationInviteStatus }
    const where: Prisma.OrganizationInviteWhereInput = {
      AND: [
        await inviteScope(access, authUser.id),
        statusWhere,
        query.programId ? { programId: query.programId } : {},
        query.batchId ? { batchId: query.batchId } : {},
      ],
    }
    const [invites, grouped] = await Promise.all([
      prisma.organizationInvite.findMany({ where, include: inviteInclude, orderBy: { createdAt: 'desc' }, take: 1000 }),
      prisma.organizationInvite.groupBy({
        by: ['status'],
        where: { AND: [await inviteScope(access, authUser.id), query.programId ? { programId: query.programId } : {}] },
        _count: { _all: true },
      }),
    ])
    res.status(200).json({
      invites: invites.map(serializeInvite),
      counts: Object.fromEntries(grouped.map((row) => [row.status.toLowerCase(), row._count._all])),
      canInviteStaff: hasOrgRole(access.membership.role, OrganizationRole.ADMIN),
    })
  } catch (error) {
    next(error)
  }
})

organizationInvitesRouter.post('/', authenticate, staffAccess, limits.bulkInvite, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = res.locals.orgAccess as OrgAccess
    const input = bulkInviteSchema.parse(req.body)

    if (input.programId) {
      const program = await requireProgramAccess(input.programId, authUser.id, 'staff')
      if (program.organization.id !== access.organization.id) throw new HttpError(404, '프로그램을 찾을 수 없습니다.')
      assertProgramWritable(program.program.status)
    } else if (!hasOrgRole(access.membership.role, OrganizationRole.ADMIN)) {
      throw new HttpError(403, '매니저는 담당 프로그램 참여자로만 초대할 수 있습니다. 조직 전체 초대는 관리자에게 요청해 주세요.')
    }

    const result = await createInvites({
      organization: access.organization,
      inviter: { id: authUser.id, membership: access.membership },
      rows: input.rows,
      programId: input.programId ?? null,
      defaultRole: input.role,
    })
    const summary = result.results.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1
      return acc
    }, {})
    await audit(req, res, {
      action: 'org.invite_bulk',
      organizationId: access.organization.id,
      targetType: input.programId ? 'program' : 'organization',
      targetId: input.programId ?? access.organization.id,
      metadata: { batchId: result.batchId, rows: input.rows.length, ...summary },
    })
    res.status(201).json({ ...result, summary })
  } catch (error) {
    next(error)
  }
})

organizationInvitesRouter.post('/:inviteId/resend', authenticate, staffAccess, limits.bulkInvite, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = res.locals.orgAccess as OrgAccess
    const invite = await findScopedInvite(access, authUser.id, String(req.params.inviteId))
    const result = await resendInvite(access.organization, invite.id)
    await audit(req, res, {
      action: 'org.invite_resend',
      organizationId: access.organization.id,
      targetType: 'invite',
      targetId: invite.id,
    })
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

organizationInvitesRouter.delete('/:inviteId', authenticate, staffAccess, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = res.locals.orgAccess as OrgAccess
    const invite = await findScopedInvite(access, authUser.id, String(req.params.inviteId))
    if (invite.status === OrganizationInviteStatus.ACCEPTED) throw new HttpError(409, '이미 수락된 초대는 취소할 수 없습니다.')
    await prisma.organizationInvite.update({ where: { id: invite.id }, data: { status: OrganizationInviteStatus.REVOKED } })
    await audit(req, res, {
      action: 'org.invite_revoke',
      organizationId: access.organization.id,
      targetType: 'invite',
      targetId: invite.id,
    })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/* ------------------------------------------------------------------ */
/* /api/invites/:token                                                 */
/* ------------------------------------------------------------------ */

const tokenParam = (value: unknown) => {
  const token = String(value ?? '')
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, '초대 링크가 올바르지 않습니다.')
  return token
}

invitesRouter.get('/:token', limits.inviteAccept, async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({ invite: await previewInvite(tokenParam(req.params.token)) })
  } catch (error) {
    next(error)
  }
})

invitesRouter.post('/:token/accept', authenticate, limits.inviteAccept, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const result = await acceptInviteToken(tokenParam(req.params.token), authUser, req, res)
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})
