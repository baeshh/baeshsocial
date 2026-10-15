import {
  CertificateSource,
  OpportunityEnrollmentStatus,
  OpportunityType,
  Prisma,
  UserRole,
  type Opportunity,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { isDeadlinePassed } from '../../utils/serviceDate.js'

const { APPLIED, ENROLLED, COMPLETED, REJECTED, WITHDRAWN } = OpportunityEnrollmentStatus

export const PROGRAM_OPPORTUNITY_TYPES: OpportunityType[] = [
  OpportunityType.EDUCATION,
  OpportunityType.STARTUP_PROGRAM,
  OpportunityType.HACKATHON,
  OpportunityType.COMPETITION,
]

export function isProgramOpportunity(type: OpportunityType) {
  return PROGRAM_OPPORTUNITY_TYPES.includes(type)
}

const applicantInclude = {
  opportunity: { select: { id: true, title: true, organization: true, type: true } },
  certificate: { select: { id: true, verified: true, issuedAt: true } },
} as const

const managerInclude = {
  opportunity: { select: { id: true, title: true, organization: true, type: true } },
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  certificate: true,
} as const

/** A status change that lost a race with another request for the same sign-up. */
const STATE_CHANGED = () => new HttpError(409, '신청 상태가 바뀌었습니다. 새로고침 후 다시 확인해 주세요.')

/**
 * Applicants may sign up again only after withdrawing or not being selected. A pending sign-up is returned
 * as is, so a repeated or concurrent request never resets it; a participation or completion (with its
 * certificate) is never overwritten.
 */
export async function applyForProgram(userId: string, opportunity: Opportunity, now = new Date()) {
  if (!isProgramOpportunity(opportunity.type)) {
    throw new HttpError(400, 'This opportunity does not support program enrollment')
  }
  const key = { userId_opportunityId: { userId, opportunityId: opportunity.id } }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await prisma.opportunityEnrollment.findUnique({ where: key, include: applicantInclude })
    if (existing?.status === APPLIED) return { enrollment: existing, changed: false }
    if (existing?.status === ENROLLED) throw new HttpError(409, '이미 선정되어 참여 중인 프로그램입니다.')
    if (existing?.status === COMPLETED) throw new HttpError(409, '이미 수료한 프로그램은 다시 신청할 수 없습니다.')
    if (isDeadlinePassed(opportunity.deadline, now)) throw new HttpError(409, '모집이 마감되었습니다.')

    if (!existing) {
      try {
        const enrollment = await prisma.opportunityEnrollment.create({
          data: { userId, opportunityId: opportunity.id, status: APPLIED, appliedAt: now },
          include: applicantInclude,
        })
        return { enrollment, changed: true }
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
        throw error
      }
    }

    const { count } = await prisma.opportunityEnrollment.updateMany({
      where: { id: existing.id, status: existing.status },
      data: { status: APPLIED, appliedAt: now, enrolledAt: null, approvedById: null },
    })
    if (count === 1) {
      const enrollment = await prisma.opportunityEnrollment.findUniqueOrThrow({ where: { id: existing.id }, include: applicantInclude })
      return { enrollment, changed: true }
    }
  }
  throw STATE_CHANGED()
}

/** Applicants may cancel a pending sign-up or a participation; completions and rejections stay on record. */
export async function withdrawFromProgram(userId: string, opportunityId: string) {
  const key = { userId_opportunityId: { userId, opportunityId } }
  const existing = await prisma.opportunityEnrollment.findUnique({ where: key, include: applicantInclude })

  if (!existing) throw new HttpError(404, 'Enrollment not found')
  if (existing.status === WITHDRAWN) return existing
  if (existing.status === COMPLETED) throw new HttpError(400, 'Completed programs cannot be cancelled')
  if (existing.status === REJECTED) throw new HttpError(409, '선정되지 않은 신청은 취소할 수 없습니다.')

  const { count } = await prisma.opportunityEnrollment.updateMany({
    where: { id: existing.id, status: { in: [APPLIED, ENROLLED] } },
    data: { status: WITHDRAWN, enrolledAt: null, approvedById: null },
  })
  const current = await prisma.opportunityEnrollment.findUniqueOrThrow({ where: { id: existing.id }, include: applicantInclude })
  if (count === 0 && current.status !== WITHDRAWN) throw STATE_CHANGED()
  return current
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

/** Manager decisions other than completion, and the statuses each may be taken from. */
const MANAGER_TRANSITIONS = {
  enrolled: { to: ENROLLED, from: [APPLIED] },
  rejected: { to: REJECTED, from: [APPLIED, ENROLLED] },
  withdrawn: { to: WITHDRAWN, from: [APPLIED, ENROLLED] },
} as const

const CLOSED_FOR_MANAGER: Partial<Record<OpportunityEnrollmentStatus, string>> = {
  [COMPLETED]: '수료 처리된 신청은 상태를 바꿀 수 없습니다.',
  [WITHDRAWN]: '신청자가 취소한 신청입니다.',
  [REJECTED]: '이미 반려한 신청입니다.',
}

/**
 * Applies a manager decision only from the statuses the management screen offers it for. Repeating a
 * decision changes nothing, so the original approval time and approver stay on record.
 */
export async function updateEnrollmentByManager(
  enrollmentId: string,
  decision: keyof typeof MANAGER_TRANSITIONS,
  managerId: string,
) {
  const { to, from } = MANAGER_TRANSITIONS[decision]
  const current = await prisma.opportunityEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: managerInclude })
  if (current.status === to) return current
  if (!(from as readonly OpportunityEnrollmentStatus[]).includes(current.status)) {
    throw new HttpError(409, CLOSED_FOR_MANAGER[current.status] ?? '현재 상태에서는 할 수 없는 처리입니다.')
  }

  const { count } = await prisma.opportunityEnrollment.updateMany({
    where: { id: enrollmentId, status: current.status },
    data: { status: to, ...(to === ENROLLED ? { enrolledAt: new Date(), approvedById: managerId } : {}) },
  })
  if (count === 0) throw STATE_CHANGED()
  return prisma.opportunityEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: managerInclude })
}

/**
 * Completes a pending or participating sign-up and links a verified certificate to it. Completing again
 * returns the existing record unchanged, so the completion time and certificate issue date never move.
 */
export async function issueProgramCertificate(
  enrollmentId: string,
  approverId: string,
) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.opportunityEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { opportunity: true },
    })

    if (!enrollment) {
      throw new Error('ENROLLMENT_NOT_FOUND')
    }
    if (enrollment.status === COMPLETED) {
      return tx.opportunityEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: managerInclude })
    }
    if (enrollment.status !== APPLIED && enrollment.status !== ENROLLED) {
      throw new HttpError(409, CLOSED_FOR_MANAGER[enrollment.status] ?? '현재 상태에서는 수료 처리할 수 없습니다.')
    }

    const completedAt = new Date()
    const claimed = await tx.opportunityEnrollment.updateMany({
      where: { id: enrollmentId, status: enrollment.status },
      data: {
        status: COMPLETED,
        completedAt,
        enrolledAt: enrollment.enrolledAt ?? completedAt,
        approvedById: enrollment.approvedById ?? approverId,
      },
    })
    if (claimed.count === 0) {
      const now = await tx.opportunityEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: managerInclude })
      if (now.status === COMPLETED) return now
      throw STATE_CHANGED()
    }

    const profile = await tx.profile.upsert({
      where: { userId: enrollment.userId },
      update: {},
      create: { userId: enrollment.userId },
    })

    // Certificate.opportunityId is unique across all profiles, so per-participant certificates are linked
    // through the enrollment's certificateId only.
    const certificate = enrollment.certificateId
      ? await tx.certificate.update({ where: { id: enrollment.certificateId }, data: { verified: true } })
      : await tx.certificate.create({
          data: {
            profileId: profile.id,
            title: enrollment.opportunity.title,
            issuer: enrollment.opportunity.organization,
            issuedAt: completedAt,
            verified: true,
            source: CertificateSource.PROGRAM,
          },
        })

    return tx.opportunityEnrollment.update({
      where: { id: enrollmentId },
      data: { certificateId: certificate.id },
      include: managerInclude,
    })
  })
}
