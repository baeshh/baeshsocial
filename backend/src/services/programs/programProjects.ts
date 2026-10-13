import {
  OrganizationMemberStatus,
  ProgramProjectRegistrationStatus,
  ProgramStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { DEFAULT_PROJECT_ROLE_TEMPLATES } from '../../utils/projectPermissions.js'

export { isLeaderSlug } from '../../utils/projectPermissions.js'

type Db = PrismaClient | Prisma.TransactionClient

export type ProgramPolicy = {
  id: string
  organizationId: string
  title: string
  status: ProgramStatus
  allowStudentProjects: boolean
  requireProjectApproval: boolean
  allowStudentTeams: boolean
  allowPublicProjects: boolean
  allowMultipleProjects: boolean
}

export function assertProgramOpenForStudents(status: ProgramStatus) {
  if (status === ProgramStatus.ARCHIVED || status === ProgramStatus.COMPLETED) {
    throw new HttpError(409, '종료되었거나 보관된 프로그램에는 프로젝트를 등록할 수 없습니다.')
  }
}

/**
 * Users who already belong to another team of this program — counting both approved program
 * projects and projects with a pending registration. Empty when the program allows several projects.
 */
export async function findTeamConflicts(
  db: Db,
  program: Pick<ProgramPolicy, 'id' | 'allowMultipleProjects'>,
  userIds: string[],
  excludeProjectId?: string,
) {
  const conflicts = new Map<string, string>()
  if (program.allowMultipleProjects || userIds.length === 0) return conflicts
  const rows = await db.projectMember.findMany({
    where: {
      userId: { in: userIds },
      ...(excludeProjectId ? { projectId: { not: excludeProjectId } } : {}),
      project: {
        OR: [
          { programId: program.id },
          { registrations: { some: { programId: program.id, status: ProgramProjectRegistrationStatus.PENDING } } },
        ],
      },
    },
    select: { userId: true, project: { select: { title: true, teamName: true } } },
  })
  for (const row of rows) conflicts.set(row.userId, row.project.teamName ?? row.project.title)
  return conflicts
}

/** Program participants who are still ACTIVE members of the program's organization. */
export async function activeParticipantIds(db: Db, program: Pick<ProgramPolicy, 'id' | 'organizationId'>, userIds: string[]) {
  if (userIds.length === 0) return new Set<string>()
  const rows = await db.programParticipant.findMany({
    where: {
      programId: program.id,
      userId: { in: userIds },
      user: {
        organizationMemberships: {
          some: { organizationId: program.organizationId, status: OrganizationMemberStatus.ACTIVE },
        },
      },
    },
    select: { userId: true },
  })
  return new Set(rows.map((row) => row.userId))
}

/** Program teams only take participants of that program, and respect its one-team-per-student rule. */
export async function assertProgramInvitee(
  program: { id: string; organizationId: string; allowMultipleProjects: boolean; status: ProgramStatus },
  projectId: string,
  userId: string,
) {
  if (program.status === ProgramStatus.ARCHIVED || program.status === ProgramStatus.COMPLETED) {
    throw new HttpError(409, '종료되었거나 보관된 프로그램의 팀은 변경할 수 없습니다.')
  }
  const eligible = await activeParticipantIds(prisma, program, [userId])
  if (!eligible.has(userId)) throw new HttpError(400, '이 프로그램의 참여자만 팀에 초대할 수 있습니다.')
  const conflicts = await findTeamConflicts(prisma, program, [userId], projectId)
  if (conflicts.size > 0) throw new HttpError(409, `이미 '${conflicts.get(userId)}' 팀에 속한 참여자입니다.`)
}

/** Users who are ACTIVE members of the organization (participant or not). */
export async function activeOrgMemberIds(db: Db, organizationId: string, userIds: string[]) {
  if (userIds.length === 0) return new Set<string>()
  const rows = await db.organizationMember.findMany({
    where: { organizationId, userId: { in: userIds }, status: OrganizationMemberStatus.ACTIVE },
    select: { userId: true },
  })
  return new Set(rows.map((row) => row.userId))
}

export async function seedProjectRoles(db: Db, projectId: string) {
  await db.projectRole.createMany({
    data: DEFAULT_PROJECT_ROLE_TEMPLATES.map((template) => ({
      projectId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      permissions: template.permissions,
      isSystem: template.isSystem,
      sortOrder: template.sortOrder,
    })),
  })
}

export async function uniqueProjectSlug(db: Db, title: string) {
  const base =
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  let slug = base
  for (let index = 1; await db.project.findUnique({ where: { slug }, select: { id: true } }); index += 1) {
    slug = `${base}-${index}`
  }
  return slug
}

/** Student-led projects keep their creator on the team; institution-created ones are owned by staff who are not members. */
export function isStudentLed(project: { ownerId: string; members: { userId: string }[] }) {
  return project.members.some((member) => member.userId === project.ownerId)
}

export async function loadStudentLed(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, members: { select: { userId: true } } },
  })
  return project ? isStudentLed(project) : false
}

export async function programStaffIds(db: Db, programId: string) {
  const rows = await db.programManager.findMany({ where: { programId }, select: { userId: true } })
  return rows.map((row) => row.userId)
}

export async function notifyUsers(userIds: string[], actorId: string | null, title: string, body: string, link: string) {
  const recipients = [...new Set(userIds)].filter((id) => id !== actorId)
  if (recipients.length === 0) return
  try {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, actorId, title, body, link, type: 'PROJECT' as const })),
    })
  } catch (error) {
    console.error('Program project notification failed:', error)
  }
}
