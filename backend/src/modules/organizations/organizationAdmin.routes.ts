import { OrganizationMemberStatus, OrganizationRole, OrganizationVerificationStatus, UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { ensureTrialSubscription } from '../../services/billing/subscriptions.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  memberUserSelect,
  serializeMember,
  serializeOrganization,
  serializeVerification,
} from '../../utils/organizations.js'
import { reviewOrganizationSchema } from '../../validators/organization.validator.js'

/** Platform operator review of organization verification requests. */
export const organizationAdminRouter = Router()

organizationAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
})

organizationAdminRouter.get('/', async (req, res, next) => {
  try {
    const { status } = listQuerySchema.parse(req.query)
    const organizations = await prisma.organization.findMany({
      where: { verificationStatus: status.toUpperCase() as OrganizationVerificationStatus },
      include: {
        createdBy: { select: memberUserSelect },
        verifications: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            documentType: true,
            documentName: true,
            note: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
          },
        },
        _count: { select: { members: { where: { status: OrganizationMemberStatus.ACTIVE } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    res.status(200).json({
      organizations: organizations.map((organization) => ({
        ...serializeOrganization(organization, { platformAdmin: true }),
        createdBy: organization.createdBy,
        memberCount: organization._count.members,
        latestVerification: organization.verifications[0]
          ? serializeVerification(organization.verifications[0])
          : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

organizationAdminRouter.get('/:orgId', async (req, res, next) => {
  try {
    const organization = await prisma.organization.findUnique({
      where: { id: String(req.params.orgId) },
      include: {
        createdBy: { select: memberUserSelect },
        verifications: { orderBy: { createdAt: 'desc' } },
        members: {
          where: { role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] }, status: OrganizationMemberStatus.ACTIVE },
          include: { user: { select: memberUserSelect } },
        },
      },
    })
    if (!organization) {
      res.status(404).json({ message: 'Organization not found' })
      return
    }

    res.status(200).json({
      organization: {
        ...serializeOrganization(organization, { platformAdmin: true }),
        createdBy: organization.createdBy,
        admins: organization.members.map((member) => serializeMember(member)),
        verifications: organization.verifications.map((verification) =>
          serializeVerification(verification, { includeDocument: true }),
        ),
      },
    })
  } catch (error) {
    next(error)
  }
})

organizationAdminRouter.post('/:orgId/review', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = reviewOrganizationSchema.parse(req.body)
    const organizationId = String(req.params.orgId)

    const organization = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!organization) {
      res.status(404).json({ message: 'Organization not found' })
      return
    }

    const pendingVerification = await prisma.organizationVerification.findFirst({
      where: { organizationId, status: OrganizationVerificationStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    })
    if (input.decision === OrganizationVerificationStatus.APPROVED && !pendingVerification) {
      res.status(409).json({ message: '심사할 인증 서류가 없습니다. 조직이 증빙을 먼저 제출해야 합니다.' })
      return
    }

    const now = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      if (pendingVerification) {
        await tx.organizationVerification.update({
          where: { id: pendingVerification.id },
          data: { status: input.decision, reviewedById: authUser.id, reviewNote: input.note ?? null, reviewedAt: now },
        })
      }
      return tx.organization.update({
        where: { id: organizationId },
        data: {
          verificationStatus: input.decision,
          verifiedAt: input.decision === OrganizationVerificationStatus.APPROVED ? now : null,
        },
      })
    })

    const managers = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: OrganizationMemberStatus.ACTIVE,
        role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
      },
      select: { userId: true },
    })
    const approved = input.decision === OrganizationVerificationStatus.APPROVED
    if (managers.length > 0) {
      await prisma.notification
        .createMany({
          data: managers.map(({ userId }) => ({
            userId,
            actorId: authUser.id,
            type: 'SYSTEM' as const,
            title: approved ? '조직 인증 승인' : '조직 인증 반려',
            body: approved
              ? `${organization.name} 조직이 승인되어 관리 기능이 활성화되었습니다.`
              : `${organization.name} 조직 인증이 반려되었습니다.${input.note ? ` 사유: ${input.note}` : ''}`,
            link: `/org/${organizationId}`,
          })),
        })
        .catch((error: unknown) => console.error('Organization review notification failed:', error))
    }

    if (approved) await ensureTrialSubscription(organizationId, authUser.id)
    await audit(req, res, {
      action: approved ? 'admin.org_approve' : 'admin.org_reject',
      organizationId,
      targetType: 'organization',
      targetId: organizationId,
      metadata: { note: input.note ?? null },
    })
    res.status(200).json({ organization: serializeOrganization(updated, { platformAdmin: true }) })
  } catch (error) {
    next(error)
  }
})
