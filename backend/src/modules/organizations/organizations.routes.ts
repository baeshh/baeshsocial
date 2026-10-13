import {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  UserRole,
  type Prisma,
} from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { dashboardQuerySchema } from '../../validators/program.validator.js'
import { buildInstitutionDashboard } from '../programs/programDashboard.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  canManageMember,
  hasOrgRole,
  memberUserSelect,
  serializeMember,
  serializeOrganization,
  serializePublicOrganization,
  serializeVerification,
  toApiMemberStatus,
  toApiOrgRole,
} from '../../utils/organizations.js'
import {
  createOrganizationSchema,
  joinOrganizationSchema,
  memberDecisionSchema,
  organizationDirectorySchema,
  submitVerificationSchema,
  updateMemberRoleSchema,
  updateOrganizationSchema,
} from '../../validators/organization.validator.js'

export const organizationsRouter = Router()

const MAX_UNAPPROVED_ORGANIZATIONS_PER_USER = 5

const verificationSummarySelect = {
  id: true,
  documentType: true,
  documentName: true,
  note: true,
  status: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
} satisfies Prisma.OrganizationVerificationSelect

async function notifyUsers(userIds: string[], actorId: string | null, title: string, body: string, link: string) {
  if (userIds.length === 0) return
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, actorId, title, body, link, type: 'SYSTEM' as const })),
    })
  } catch (error) {
    console.error('Organization notification failed:', error)
  }
}

async function getOrgManagerIds(organizationId: string, minRole: OrganizationRole) {
  const managers = await prisma.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE },
    select: { userId: true, role: true },
  })
  return managers.filter((member) => hasOrgRole(member.role, minRole)).map((member) => member.userId)
}

/** Approved organizations that users can browse and request to join. */
organizationsRouter.get('/directory', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const filters = organizationDirectorySchema.parse(req.query)
    const organizations = await prisma.organization.findMany({
      where: {
        verificationStatus: OrganizationVerificationStatus.APPROVED,
        ...(filters.type ? { type: filters.type.toUpperCase() as 'UNIVERSITY' | 'INSTITUTION' | 'COMPANY' } : {}),
        ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        website: true,
        _count: { select: { members: { where: { status: OrganizationMemberStatus.ACTIVE } } } },
        members: { where: { userId: authUser.id }, select: { status: true, role: true } },
      },
      orderBy: { name: 'asc' },
      take: 50,
    })

    res.status(200).json({
      organizations: organizations.map((organization) => ({
        ...serializePublicOrganization(organization),
        myMembership: organization.members[0]
          ? {
              status: toApiMemberStatus(organization.members[0].status),
              role: toApiOrgRole(organization.members[0].role),
            }
          : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

/** Every organization the caller belongs to or has applied to — drives the context switcher. */
organizationsRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: authUser.id, status: { not: OrganizationMemberStatus.REJECTED } },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    })

    res.status(200).json({
      memberships: memberships.map((membership) => ({
        ...serializeMember(membership),
        organization: serializeOrganization(membership.organization),
      })),
    })
  } catch (error) {
    next(error)
  }
})

organizationsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = createOrganizationSchema.parse(req.body)

    const unapprovedCount = await prisma.organization.count({
      where: {
        createdById: authUser.id,
        verificationStatus: { not: OrganizationVerificationStatus.APPROVED },
      },
    })
    if (unapprovedCount >= MAX_UNAPPROVED_ORGANIZATIONS_PER_USER) {
      res.status(429).json({ message: '승인 대기 중인 조직이 너무 많습니다. 기존 신청 결과를 먼저 확인해 주세요.' })
      return
    }

    const organization = await prisma.organization.create({
      data: {
        ...input,
        verificationStatus: OrganizationVerificationStatus.PENDING,
        createdById: authUser.id,
        members: {
          create: {
            userId: authUser.id,
            role: OrganizationRole.OWNER,
            status: OrganizationMemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
        },
      },
    })

    res.status(201).json({ organization: serializeOrganization(organization), myRole: 'owner' })
  } catch (error) {
    next(error)
  }
})

/** Minimal public card for an approved organization (used on the join screen). */
organizationsRouter.get('/:orgId/public', authenticate, async (req, res, next) => {
  try {
    const organization = await prisma.organization.findFirst({
      where: { id: String(req.params.orgId), verificationStatus: OrganizationVerificationStatus.APPROVED },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        website: true,
        _count: { select: { members: { where: { status: OrganizationMemberStatus.ACTIVE } } } },
      },
    })
    if (!organization) {
      res.status(404).json({ message: 'Organization not found' })
      return
    }
    res.status(200).json({ organization: serializePublicOrganization(organization) })
  } catch (error) {
    next(error)
  }
})

organizationsRouter.post('/:orgId/join', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const organizationId = String(req.params.orgId)
    const input = joinOrganizationSchema.parse(req.body ?? {})

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!organization || organization.verificationStatus !== OrganizationVerificationStatus.APPROVED) {
      res.status(404).json({ message: 'Organization not found' })
      return
    }

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: authUser.id } },
    })
    if (existing && existing.status !== OrganizationMemberStatus.REJECTED) {
      res.status(409).json({
        message: existing.status === OrganizationMemberStatus.ACTIVE ? '이미 소속된 조직입니다.' : '이미 가입 신청한 조직입니다.',
      })
      return
    }

    // Re-applying after rejection always resets the request to a plain MEMBER application.
    const membership = existing
      ? await prisma.organizationMember.update({
          where: { id: existing.id },
          data: { status: OrganizationMemberStatus.PENDING, role: OrganizationRole.MEMBER, joinedAt: null, ...input },
        })
      : await prisma.organizationMember.create({
          data: { organizationId, userId: authUser.id, ...input },
        })

    await notifyUsers(
      await getOrgManagerIds(organizationId, OrganizationRole.MANAGER),
      authUser.id,
      '새 조직 가입 신청',
      `${authUser.name}님이 ${organization.name} 가입을 신청했습니다.`,
      `/org/${organizationId}?tab=members`,
    )

    res.status(201).json({ membership: serializeMember(membership) })
  } catch (error) {
    next(error)
  }
})

/** Cancel the caller's own pending join request. */
organizationsRouter.delete('/:orgId/join', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const result = await prisma.organizationMember.deleteMany({
      where: {
        organizationId: String(req.params.orgId),
        userId: authUser.id,
        status: OrganizationMemberStatus.PENDING,
      },
    })
    if (result.count === 0) {
      res.status(404).json({ message: 'No pending request found' })
      return
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

organizationsRouter.get('/:orgId', authenticate, requireOrgAccess(), async (_req, res) => {
  const { organization, membership } = res.locals.orgAccess as OrgAccess
  res.status(200).json({
    organization: serializeOrganization(organization),
    myRole: toApiOrgRole(membership.role),
  })
})

organizationsRouter.patch(
  '/:orgId',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN }),
  async (req, res, next) => {
    try {
      const { organization } = res.locals.orgAccess as OrgAccess
      const input = updateOrganizationSchema.parse(req.body)

      // Identity fields were what the platform verified; changing them requires a new review.
      const changesIdentity =
        (input.name !== undefined && input.name !== organization.name) ||
        (input.type !== undefined && input.type !== organization.type) ||
        (input.registrationNumber !== undefined && input.registrationNumber !== organization.registrationNumber)
      if (changesIdentity && organization.verificationStatus === OrganizationVerificationStatus.APPROVED) {
        res.status(409).json({ message: '승인된 조직의 이름·유형·등록번호는 운영자 재심사 후에만 변경할 수 있습니다.' })
        return
      }

      const updated = await prisma.organization.update({
        where: { id: organization.id },
        data: input,
      })
      res.status(200).json({ organization: serializeOrganization(updated) })
    } catch (error) {
      next(error)
    }
  },
)

organizationsRouter.get('/:orgId/dashboard', authenticate, requireOrgAccess(), async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization, membership } = res.locals.orgAccess as OrgAccess
    const { programId } = dashboardQuerySchema.parse(req.query)
    const canSeeManagement =
      organization.verificationStatus === OrganizationVerificationStatus.APPROVED &&
      hasOrgRole(membership.role, OrganizationRole.MANAGER)

    const [roleGroups, pendingRequests, latestVerification, institution] = await Promise.all([
      prisma.organizationMember.groupBy({
        by: ['role'],
        where: { organizationId: organization.id, status: OrganizationMemberStatus.ACTIVE },
        _count: { _all: true },
      }),
      canSeeManagement
        ? prisma.organizationMember.count({
            where: { organizationId: organization.id, status: OrganizationMemberStatus.PENDING },
          })
        : Promise.resolve(null),
      hasOrgRole(membership.role, OrganizationRole.ADMIN)
        ? prisma.organizationVerification.findFirst({
            where: { organizationId: organization.id },
            orderBy: { createdAt: 'desc' },
            select: verificationSummarySelect,
          })
        : Promise.resolve(null),
      buildInstitutionDashboard(organization, membership, authUser.id, programId),
    ])

    const roleCounts = { owner: 0, admin: 0, manager: 0, member: 0 }
    for (const group of roleGroups) {
      roleCounts[toApiOrgRole(group.role)] = group._count._all
    }

    res.status(200).json({
      organization: serializeOrganization(organization),
      myRole: toApiOrgRole(membership.role),
      stats: {
        memberCount: Object.values(roleCounts).reduce((sum, count) => sum + count, 0),
        roleCounts,
        pendingRequests,
      },
      latestVerification: latestVerification ? serializeVerification(latestVerification) : null,
      institution,
    })
  } catch (error) {
    next(error)
  }
})

organizationsRouter.get('/:orgId/members', authenticate, requireOrgAccess(), async (_req, res, next) => {
  try {
    const { organization, membership } = res.locals.orgAccess as OrgAccess
    const canSeePending =
      organization.verificationStatus === OrganizationVerificationStatus.APPROVED &&
      hasOrgRole(membership.role, OrganizationRole.MANAGER)

    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId: organization.id,
        status: canSeePending
          ? { in: [OrganizationMemberStatus.ACTIVE, OrganizationMemberStatus.PENDING] }
          : OrganizationMemberStatus.ACTIVE,
      },
      include: { user: { select: memberUserSelect } },
      orderBy: [{ createdAt: 'asc' }],
    })

    const serialized = members.map(serializeMember)
    res.status(200).json({
      members: serialized.filter((member) => member.status === 'active'),
      pendingRequests: canSeePending ? serialized.filter((member) => member.status === 'pending') : [],
    })
  } catch (error) {
    next(error)
  }
})

organizationsRouter.post(
  '/:orgId/members/:memberId/decision',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true }),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { organization } = res.locals.orgAccess as OrgAccess
      const { decision } = memberDecisionSchema.parse(req.body)

      const target = await prisma.organizationMember.findFirst({
        where: { id: String(req.params.memberId), organizationId: organization.id, status: OrganizationMemberStatus.PENDING },
      })
      if (!target) {
        res.status(404).json({ message: 'Pending request not found' })
        return
      }

      const updated = await prisma.organizationMember.update({
        where: { id: target.id },
        data:
          decision === 'approve'
            ? { status: OrganizationMemberStatus.ACTIVE, role: OrganizationRole.MEMBER, joinedAt: new Date() }
            : { status: OrganizationMemberStatus.REJECTED },
        include: { user: { select: memberUserSelect } },
      })

      await notifyUsers(
        [target.userId],
        authUser.id,
        decision === 'approve' ? '조직 가입 승인' : '조직 가입 거절',
        decision === 'approve'
          ? `${organization.name} 구성원으로 승인되었습니다.`
          : `${organization.name} 가입 신청이 거절되었습니다.`,
        decision === 'approve' ? `/org/${organization.id}` : '/organizations',
      )

      res.status(200).json({ member: serializeMember(updated) })
    } catch (error) {
      next(error)
    }
  },
)

organizationsRouter.patch(
  '/:orgId/members/:memberId',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN, requireApproved: true }),
  async (req, res, next) => {
    try {
      const { organization, membership } = res.locals.orgAccess as OrgAccess
      const input = updateMemberRoleSchema.parse(req.body)

      const target = await prisma.organizationMember.findFirst({
        where: { id: String(req.params.memberId), organizationId: organization.id, status: OrganizationMemberStatus.ACTIVE },
      })
      if (!target) {
        res.status(404).json({ message: 'Member not found' })
        return
      }
      if (target.id === membership.id) {
        res.status(403).json({ message: '자신의 역할은 변경할 수 없습니다.' })
        return
      }
      if (!canManageMember(membership.role, target.role) || !canManageMember(membership.role, input.role)) {
        res.status(403).json({ message: '자신보다 낮은 역할의 구성원에게, 자신보다 낮은 역할만 부여할 수 있습니다.' })
        return
      }

      const updated = await prisma.organizationMember.update({
        where: { id: target.id },
        data: { role: input.role, ...(input.title !== undefined ? { title: input.title } : {}) },
        include: { user: { select: memberUserSelect } },
      })
      res.status(200).json({ member: serializeMember(updated) })
    } catch (error) {
      next(error)
    }
  },
)

organizationsRouter.delete(
  '/:orgId/members/:memberId',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN, requireApproved: true }),
  async (req, res, next) => {
    try {
      const { organization, membership } = res.locals.orgAccess as OrgAccess
      const target = await prisma.organizationMember.findFirst({
        where: { id: String(req.params.memberId), organizationId: organization.id, status: OrganizationMemberStatus.ACTIVE },
      })
      if (!target) {
        res.status(404).json({ message: 'Member not found' })
        return
      }
      if (!canManageMember(membership.role, target.role)) {
        res.status(403).json({ message: '자신보다 낮은 역할의 구성원만 내보낼 수 있습니다.' })
        return
      }
      await prisma.organizationMember.delete({ where: { id: target.id } })
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  },
)

/** Leave an organization. The last OWNER cannot leave (ownership transfer comes later). */
organizationsRouter.delete('/:orgId/membership', authenticate, requireOrgAccess(), async (_req, res, next) => {
  try {
    const { organization, membership } = res.locals.orgAccess as OrgAccess
    if (membership.role === OrganizationRole.OWNER) {
      const ownerCount = await prisma.organizationMember.count({
        where: { organizationId: organization.id, role: OrganizationRole.OWNER, status: OrganizationMemberStatus.ACTIVE },
      })
      if (ownerCount <= 1) {
        res.status(409).json({ message: '마지막 소유자는 조직을 떠날 수 없습니다.' })
        return
      }
    }
    await prisma.organizationMember.delete({ where: { id: membership.id } })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

organizationsRouter.get(
  '/:orgId/verifications',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN }),
  async (_req, res, next) => {
    try {
      const { organization } = res.locals.orgAccess as OrgAccess
      const verifications = await prisma.organizationVerification.findMany({
        where: { organizationId: organization.id },
        orderBy: { createdAt: 'desc' },
        select: verificationSummarySelect,
      })
      res.status(200).json({ verifications: verifications.map((verification) => serializeVerification(verification)) })
    } catch (error) {
      next(error)
    }
  },
)

organizationsRouter.post(
  '/:orgId/verifications',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.ADMIN }),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { organization } = res.locals.orgAccess as OrgAccess
      const input = submitVerificationSchema.parse(req.body)

      if (organization.verificationStatus === OrganizationVerificationStatus.APPROVED) {
        res.status(409).json({ message: '이미 승인된 조직입니다.' })
        return
      }

      const [verification] = await prisma.$transaction([
        prisma.organizationVerification.create({
          data: { ...input, organizationId: organization.id, submittedById: authUser.id },
          select: verificationSummarySelect,
        }),
        prisma.organization.update({
          where: { id: organization.id },
          data: { verificationStatus: OrganizationVerificationStatus.PENDING },
        }),
      ])

      const platformAdmins = await prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } })
      await notifyUsers(
        platformAdmins.map((admin) => admin.id),
        authUser.id,
        '조직 인증 심사 요청',
        `${organization.name} 조직이 인증 서류를 제출했습니다.`,
        `/admin/organizations?focus=${organization.id}`,
      )

      res.status(201).json({ verification: serializeVerification(verification) })
    } catch (error) {
      next(error)
    }
  },
)
