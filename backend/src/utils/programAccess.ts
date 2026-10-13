import {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  ProgramStatus,
  type Prisma,
} from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { HttpError } from './httpError.js'
import { hasOrgRole } from './organizations.js'

export class ProgramAccessError extends HttpError {
  constructor(status: 403 | 404, message: string) {
    super(status, message)
  }
}

export type ProgramAccess = NonNullable<Awaited<ReturnType<typeof loadProgramAccess>>>

async function loadProgramAccess(programId: string, userId: string) {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          type: true,
          verificationStatus: true,
          members: {
            where: { userId },
            select: { id: true, role: true, status: true },
          },
        },
      },
      managers: { where: { userId }, select: { id: true } },
      participants: { where: { userId }, select: { id: true } },
    },
  })
  if (!program) return null

  const orgMember = program.organization.members[0] ?? null
  const membership = orgMember?.status === OrganizationMemberStatus.ACTIVE ? orgMember : null
  const suspended = orgMember?.status === OrganizationMemberStatus.SUSPENDED
  const approved = program.organization.verificationStatus === OrganizationVerificationStatus.APPROVED
  const isOrgAdmin = Boolean(approved && membership && hasOrgRole(membership.role, OrganizationRole.ADMIN))
  const isManager = Boolean(
    approved && membership && program.managers.length > 0 && hasOrgRole(membership.role, OrganizationRole.MANAGER),
  )
  const isStaff = isOrgAdmin || isManager
  // Participation is its own relationship: external participants are not organization members.
  const isParticipant = !suspended && program.participants.length > 0

  return {
    program,
    organization: program.organization,
    membership,
    isOrgAdmin,
    isManager,
    isStaff,
    isParticipant,
    canView: isStaff || isParticipant,
  }
}

/**
 * Resolves the caller's relationship to a program. Anyone who is neither staff nor a participant
 * gets 404 so program existence is not leaked across organizations.
 */
export async function requireProgramAccess(
  programId: string,
  userId: string,
  level: 'view' | 'staff' | 'admin' = 'view',
) {
  const access = await loadProgramAccess(programId, userId)
  if (!access || !access.canView) {
    throw new ProgramAccessError(404, '프로그램을 찾을 수 없습니다.')
  }
  if (level === 'staff' && !access.isStaff) {
    throw new ProgramAccessError(403, '이 프로그램을 관리할 권한이 없습니다.')
  }
  if (level === 'admin' && !access.isOrgAdmin) {
    throw new ProgramAccessError(403, '조직 관리자만 수행할 수 있습니다.')
  }
  return access
}

export const getProgramAccess = loadProgramAccess

/**
 * Row lock on the program for the rest of the transaction. Seat checks run after it, so two staff
 * selecting the last seat at the same moment are serialised instead of both passing the check.
 */
export async function lockProgramSeats(tx: Prisma.TransactionClient, programId: string) {
  await tx.$queryRaw`SELECT id FROM "Program" WHERE id = ${programId} FOR UPDATE`
}

export function assertProgramWritable(status: ProgramStatus) {
  if (status === ProgramStatus.ARCHIVED) {
    throw new ProgramAccessError(403, '보관된 프로그램은 수정할 수 없습니다.')
  }
}

/**
 * Programs of one organization the caller may manage: every program for approved org admins,
 * only assigned programs for managers, none otherwise.
 */
export async function listManagedPrograms(
  organization: { id: string; verificationStatus: OrganizationVerificationStatus },
  membership: { role: OrganizationRole },
  userId: string,
) {
  const approved = organization.verificationStatus === OrganizationVerificationStatus.APPROVED
  if (!approved || !hasOrgRole(membership.role, OrganizationRole.MANAGER)) return { isOrgAdmin: false, programs: [] }
  const isOrgAdmin = hasOrgRole(membership.role, OrganizationRole.ADMIN)
  const programs = await prisma.program.findMany({
    where: { organizationId: organization.id, ...(isOrgAdmin ? {} : { managers: { some: { userId } } }) },
    select: { id: true, title: true, term: true, status: true, startDate: true, endDate: true, createdAt: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return { isOrgAdmin, programs }
}

/** Prisma filter for programs where the user is staff (approved org admin or assigned manager). */
export function programStaffWhere(userId: string): Prisma.ProgramWhereInput {
  const approvedOrg = { verificationStatus: OrganizationVerificationStatus.APPROVED }
  return {
    OR: [
      {
        organization: {
          ...approvedOrg,
          members: {
            some: {
              userId,
              status: OrganizationMemberStatus.ACTIVE,
              role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
            },
          },
        },
      },
      {
        managers: { some: { userId } },
        organization: {
          ...approvedOrg,
          members: {
            some: {
              userId,
              status: OrganizationMemberStatus.ACTIVE,
              role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MANAGER] },
            },
          },
        },
      },
    ],
  }
}
