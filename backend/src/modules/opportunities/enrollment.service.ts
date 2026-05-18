import {
  CertificateSource,
  OpportunityEnrollmentStatus,
  OpportunityType,
  UserRole,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'

export const PROGRAM_OPPORTUNITY_TYPES: OpportunityType[] = [
  OpportunityType.EDUCATION,
  OpportunityType.STARTUP_PROGRAM,
  OpportunityType.HACKATHON,
  OpportunityType.COMPETITION,
]

export function isProgramOpportunity(type: OpportunityType) {
  return PROGRAM_OPPORTUNITY_TYPES.includes(type)
}

export async function assertCanManageEnrollment(
  enrollmentId: string,
  managerUserId: string,
  managerRole: UserRole,
) {
  const enrollment = await prisma.opportunityEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      opportunity: { select: { createdBy: true, title: true, organization: true, type: true } },
      user: { select: { id: true, name: true } },
    },
  })

  if (!enrollment) {
    throw new Error('ENROLLMENT_NOT_FOUND')
  }

  const isAdmin = managerRole === UserRole.ADMIN
  const isInstitution = managerRole === UserRole.INSTITUTION
  const isCreator = enrollment.opportunity.createdBy === managerUserId

  if (!isAdmin && !(isInstitution && isCreator)) {
    throw new Error('FORBIDDEN')
  }

  return enrollment
}

export async function issueProgramCertificate(
  enrollmentId: string,
  approverId: string,
) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.opportunityEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        opportunity: true,
        user: true,
      },
    })

    if (!enrollment) {
      throw new Error('ENROLLMENT_NOT_FOUND')
    }

    const profile = await tx.profile.upsert({
      where: { userId: enrollment.userId },
      update: {},
      create: { userId: enrollment.userId },
    })

    const completedAt = new Date()

    const certificate =
      enrollment.certificateId
        ? await tx.certificate.update({
            where: { id: enrollment.certificateId },
            data: { verified: true, issuedAt: completedAt },
          })
        : await tx.certificate.create({
            data: {
              profileId: profile.id,
              title: enrollment.opportunity.title,
              issuer: enrollment.opportunity.organization,
              issuedAt: completedAt,
              verified: true,
              source: CertificateSource.PROGRAM,
              opportunityId: enrollment.opportunityId,
            },
          })

    const updated = await tx.opportunityEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: OpportunityEnrollmentStatus.COMPLETED,
        completedAt,
        enrolledAt: enrollment.enrolledAt ?? completedAt,
        approvedById: approverId,
        certificateId: certificate.id,
      },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true },
        },
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        certificate: true,
      },
    })

    return updated
  })
}
