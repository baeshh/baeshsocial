import {
  ProgramProjectRegistrationSource,
  ProgramProjectRegistrationStatus,
  ProjectActivityType,
  ProjectStatus,
  ProjectVisibility,
  type Prisma,
} from '@prisma/client'
import type { Router as ExpressRouter } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity } from '../../services/billing/entitlements.js'
import {
  activeOrgMemberIds,
  assertProgramOpenForStudents,
  findTeamConflicts,
  isLeaderSlug,
  notifyUsers,
  programStaffIds,
  seedProjectRoles,
  uniqueProjectSlug,
} from '../../services/programs/programProjects.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { requireProgramAccess, type ProgramAccess } from '../../utils/programAccess.js'
import { DEFAULT_OWNER_CONTRIBUTION } from '../../utils/projectPermissions.js'
import {
  createProjectRequestSchema,
  decideProjectRequestSchema,
  projectRequestQuerySchema,
} from '../../validators/program.validator.js'
import { userBriefSelect } from './program.serializers.js'

type RegistrationSnapshot = {
  title: string
  description: string | null
  objective: string | null
  teamName: string | null
  visibility: string
  members: { userId: string; name: string; role: string }[]
  counts: { tasks: number; activities: number; links: number; files: number }
}

const registrationInclude = {
  project: {
    select: {
      id: true,
      title: true,
      teamName: true,
      visibility: true,
      programId: true,
      ownerId: true,
      _count: { select: { members: true, tasks: true, activities: true, externalLinks: true } },
    },
  },
  requester: { select: userBriefSelect },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProgramProjectRegistrationInclude

type RegistrationRow = Prisma.ProgramProjectRegistrationGetPayload<{ include: typeof registrationInclude }>

function serializeRegistration(row: RegistrationRow) {
  return {
    id: row.id,
    programId: row.programId,
    source: row.source.toLowerCase(),
    status: row.status.toLowerCase(),
    message: row.message,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    requester: row.requester,
    reviewedBy: row.reviewedBy,
    snapshot: row.snapshot as RegistrationSnapshot | null,
    project: {
      id: row.project.id,
      title: row.project.title,
      teamName: row.project.teamName,
      visibility: row.project.visibility.toLowerCase(),
      inProgram: row.project.programId === row.programId,
      counts: row.project._count,
    },
  }
}

async function buildSnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
  teamName: string | null | undefined,
): Promise<RegistrationSnapshot> {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      title: true,
      description: true,
      objective: true,
      teamName: true,
      visibility: true,
      members: { select: { userId: true, role: true, user: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } },
      _count: { select: { tasks: true, activities: true, externalLinks: true, files: true } },
    },
  })
  return {
    title: project.title,
    description: project.description,
    objective: project.objective,
    teamName: teamName ?? project.teamName,
    visibility: project.visibility.toLowerCase(),
    members: project.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    counts: {
      tasks: project._count.tasks,
      activities: project._count.activities,
      links: project._count.externalLinks,
      files: project._count.files,
    },
  }
}

/**
 * Every rule that must hold both when a request is filed and again when staff approve it:
 * the project is still independent, the whole team belongs to the organization, nobody is already
 * on another team of this program (unless allowed), and public visibility matches the policy.
 */
async function assertEligible(db: Prisma.TransactionClient | typeof prisma, access: ProgramAccess, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, programId: true, visibility: true, members: { select: { userId: true, user: { select: { name: true } } } } },
  })
  if (!project) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.')
  if (project.programId) throw new HttpError(409, '이미 기관 프로그램에 속한 프로젝트입니다.')
  if (project.visibility === ProjectVisibility.PUBLIC && !access.program.allowPublicProjects) {
    throw new HttpError(400, '이 프로그램은 전체 공개 프로젝트를 허용하지 않습니다. 공개 범위를 팀 공개로 바꾼 뒤 요청해 주세요.')
  }
  const memberIds = project.members.map((m) => m.userId)
  const active = await activeOrgMemberIds(db, access.organization.id, memberIds)
  const outsiders = project.members.filter((m) => !active.has(m.userId)).map((m) => m.user.name)
  if (outsiders.length > 0) {
    throw new HttpError(400, `${access.organization.name} 구성원이 아닌 팀원이 있어 등록할 수 없습니다: ${outsiders.join(', ')}`)
  }
  const conflicts = await findTeamConflicts(db, access.program, memberIds, project.id)
  if (conflicts.size > 0) {
    const names = project.members.filter((m) => conflicts.has(m.userId)).map((m) => `${m.user.name}(${conflicts.get(m.userId)})`)
    throw new HttpError(409, `이 프로그램에서 이미 다른 팀에 속한 팀원이 있습니다: ${names.join(', ')}`)
  }
  return project
}

/** Links the same project row to the program. Nothing is copied: tasks, files, links and history stay put. */
async function approveInTx(
  tx: Prisma.TransactionClient,
  access: ProgramAccess,
  registrationId: string,
  input: { reviewerId: string | null; note: string | null; teamName: string | null },
) {
  const registration = await tx.programProjectRegistration.findUniqueOrThrow({ where: { id: registrationId } })
  const project = await assertEligible(tx, access, registration.projectId)
  const updated = await tx.programProjectRegistration.updateMany({
    where: { id: registrationId, status: ProgramProjectRegistrationStatus.PENDING },
    data: {
      status: ProgramProjectRegistrationStatus.APPROVED,
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      reviewNote: input.note,
    },
  })
  if (updated.count === 0) throw new HttpError(409, '이미 처리된 요청입니다.')

  const current = await tx.project.findUniqueOrThrow({
    where: { id: project.id },
    select: { startDate: true, endDate: true, ownerId: true },
  })
  await tx.project.update({
    where: { id: project.id },
    data: {
      programId: access.program.id,
      ...(input.teamName ? { teamName: input.teamName } : {}),
      ...(current.startDate ? {} : { startDate: access.program.startDate }),
      ...(current.endDate ? {} : { endDate: access.program.endDate }),
    },
  })
  await tx.programParticipant.createMany({
    data: project.members.map((member) => ({
      programId: access.program.id,
      userId: member.userId,
      addedById: input.reviewerId,
    })),
    skipDuplicates: true,
  })
  await tx.projectActivity.create({
    data: {
      projectId: project.id,
      userId: input.reviewerId ?? registration.requesterId ?? current.ownerId,
      type: ProjectActivityType.MILESTONE,
      title: 'Program registration approved',
      description: input.reviewerId
        ? `${access.program.title} 프로그램 프로젝트로 등록이 승인되었습니다. (성과 인증과는 별개입니다)`
        : `${access.program.title} 프로그램 정책에 따라 바로 등록되었습니다. (성과 인증과는 별개입니다)`,
    },
  })
  return project
}

export function registerProjectRegistrationRoutes(router: ExpressRouter) {
  /** A participant asks to run a new project, or an existing one they lead, inside the program. */
  router.post('/:programId/project-requests', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id)
      if (!access.isParticipant) throw new HttpError(403, '프로그램 참여 학생만 프로젝트를 등록할 수 있습니다.')
      if (!access.program.allowStudentProjects) throw new HttpError(403, '이 프로그램은 학생 프로젝트 등록을 허용하지 않습니다.')
      assertProgramOpenForStudents(access.program.status)
      const input = createProjectRequestSchema.parse(req.body)

      const conflicts = await findTeamConflicts(prisma, access.program, [authUser.id])
      if (input.mode === 'new' && conflicts.size > 0) {
        throw new HttpError(409, `이미 '${conflicts.get(authUser.id)}' 팀에 속해 있습니다. 이 프로그램은 학생당 한 프로젝트만 허용합니다.`)
      }

      let projectId: string
      if (input.mode === 'existing') {
        const project = await prisma.project.findUnique({
          where: { id: input.projectId },
          select: {
            id: true,
            ownerId: true,
            programId: true,
            members: { where: { userId: authUser.id }, select: { projectRole: { select: { slug: true } } } },
          },
        })
        const leads =
          project && !project.programId && (project.ownerId === authUser.id || isLeaderSlug(project.members[0]?.projectRole?.slug))
        if (!project || !leads) throw new HttpError(404, '내가 소유하거나 리더인 개인 프로젝트만 연결할 수 있습니다.')
        await assertEligible(prisma, access, project.id)
        projectId = project.id
      } else {
        if (input.visibility === 'public' && !access.program.allowPublicProjects) {
          throw new HttpError(400, '이 프로그램은 전체 공개 프로젝트를 허용하지 않습니다.')
        }
        if (!access.program.requireProjectApproval) await assertOrgCapacity(access.organization.id, 'projects', 1)
        const slug = await uniqueProjectSlug(prisma, input.title)
        projectId = await prisma.$transaction(async (tx) => {
          const created = await tx.project.create({
            data: {
              title: input.title,
              slug,
              teamName: input.teamName ?? null,
              objective: input.objective ?? null,
              description: input.description ?? null,
              skills: input.skills,
              status: ProjectStatus.PLANNING,
              visibility: input.visibility.toUpperCase() as ProjectVisibility,
              ownerId: authUser.id,
            },
          })
          await seedProjectRoles(tx, created.id)
          const ownerRole = await tx.projectRole.findUniqueOrThrow({
            where: { projectId_slug: { projectId: created.id, slug: 'owner' } },
          })
          await tx.projectMember.create({
            data: {
              projectId: created.id,
              userId: authUser.id,
              roleId: ownerRole.id,
              role: '팀장',
              contribution: DEFAULT_OWNER_CONTRIBUTION,
              privateAccess: true,
            },
          })
          await tx.projectActivity.create({
            data: {
              projectId: created.id,
              userId: authUser.id,
              type: ProjectActivityType.MILESTONE,
              title: 'Project created',
              description: `${access.program.title} 프로그램 등록을 위해 프로젝트를 만들었습니다.`,
            },
          })
          return created.id
        })
      }

      if (input.mode === 'existing' && !access.program.requireProjectApproval) {
        await assertOrgCapacity(access.organization.id, 'projects', 1)
      }

      const registration = await prisma.$transaction(async (tx) => {
        const row = await tx.programProjectRegistration
          .create({
            data: {
              programId: access.program.id,
              projectId,
              requesterId: authUser.id,
              source: input.mode === 'new' ? ProgramProjectRegistrationSource.NEW_PROJECT : ProgramProjectRegistrationSource.EXISTING_PROJECT,
              message: input.message ?? null,
              snapshot: (await buildSnapshot(tx, projectId, input.teamName)) as unknown as Prisma.InputJsonValue,
            },
          })
          .catch((error: { code?: string }) => {
            if (error.code === 'P2002') throw new HttpError(409, '이미 검토 중인 등록 요청이 있는 프로젝트입니다.')
            throw error
          })
        if (!access.program.requireProjectApproval) {
          await approveInTx(tx, access, row.id, { reviewerId: null, note: '프로그램 정책에 따라 자동 승인', teamName: input.teamName ?? null })
        }
        return tx.programProjectRegistration.findUniqueOrThrow({ where: { id: row.id }, include: registrationInclude })
      })

      await audit(req, res, {
        action: registration.status === ProgramProjectRegistrationStatus.APPROVED ? 'program.project_registered' : 'program.project_request',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: projectId,
        metadata: { programId: access.program.id, registrationId: registration.id, source: registration.source },
      })
      if (registration.status === ProgramProjectRegistrationStatus.PENDING) {
        await notifyUsers(
          await programStaffIds(prisma, access.program.id),
          authUser.id,
          '프로젝트 등록 요청이 도착했습니다',
          `${access.program.title} · ${registration.project.title}`,
          `/org/${access.organization.id}/programs/${access.program.id}?tab=requests`,
        )
      }

      res.status(201).json({ registration: serializeRegistration(registration) })
    } catch (error) {
      next(error)
    }
  })

  /** Staff see every request in the program; students see the ones they filed or whose team they are on. */
  router.get('/:programId/project-requests', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id)
      const { status } = projectRequestQuerySchema.parse(req.query)
      const rows = await prisma.programProjectRegistration.findMany({
        where: {
          programId: access.program.id,
          ...(status === 'all' ? {} : { status: status.toUpperCase() as ProgramProjectRegistrationStatus }),
          ...(access.isStaff
            ? {}
            : { OR: [{ requesterId: authUser.id }, { project: { members: { some: { userId: authUser.id } } } }] }),
        },
        include: registrationInclude,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      })
      res.status(200).json({ requests: rows.map(serializeRegistration) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:programId/project-requests/:requestId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id)
      const input = decideProjectRequestSchema.parse(req.body)
      const existing = await prisma.programProjectRegistration.findFirst({
        where: { id: String(req.params.requestId), programId: access.program.id },
        include: registrationInclude,
      })
      if (!existing) throw new HttpError(404, '등록 요청을 찾을 수 없습니다.')
      if (existing.status !== ProgramProjectRegistrationStatus.PENDING) throw new HttpError(409, '이미 처리된 요청입니다.')

      if (input.decision === 'withdraw') {
        if (existing.requesterId !== authUser.id) throw new HttpError(403, '요청한 학생만 철회할 수 있습니다.')
      } else {
        if (!access.isStaff) throw new HttpError(403, '프로그램 담당자만 승인하거나 반려할 수 있습니다.')
        if (existing.project.ownerId === authUser.id) throw new HttpError(403, '본인이 소유한 프로젝트는 승인할 수 없습니다.')
        assertProgramOpenForStudents(access.program.status)
      }

      if (input.decision === 'approve') {
        await assertOrgCapacity(access.organization.id, 'projects', 1)
        const snapshot = existing.snapshot as RegistrationSnapshot | null
        await prisma.$transaction((tx) =>
          approveInTx(tx, access, existing.id, { reviewerId: authUser.id, note: input.note ?? null, teamName: snapshot?.teamName ?? null }),
        )
      } else {
        const updated = await prisma.programProjectRegistration.updateMany({
          where: { id: existing.id, status: ProgramProjectRegistrationStatus.PENDING },
          data: {
            status: input.decision === 'reject' ? ProgramProjectRegistrationStatus.REJECTED : ProgramProjectRegistrationStatus.WITHDRAWN,
            reviewedById: input.decision === 'reject' ? authUser.id : null,
            reviewedAt: new Date(),
            reviewNote: input.note ?? null,
          },
        })
        if (updated.count === 0) throw new HttpError(409, '이미 처리된 요청입니다.')
      }

      await audit(req, res, {
        action: `program.project_request_${input.decision}`,
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: existing.project.id,
        metadata: { programId: access.program.id, registrationId: existing.id, note: input.note ?? null },
      })

      if (input.decision !== 'withdraw') {
        const team = await prisma.projectMember.findMany({ where: { projectId: existing.project.id }, select: { userId: true } })
        await notifyUsers(
          team.map((m) => m.userId),
          authUser.id,
          input.decision === 'approve' ? '프로젝트 등록이 승인되었습니다' : '프로젝트 등록이 반려되었습니다',
          input.decision === 'approve'
            ? `${access.program.title} · ${existing.project.title} — 이제 프로그램에서 관리됩니다. 성과 인증은 별도로 진행됩니다.`
            : `${access.program.title} · ${existing.project.title} — 사유: ${input.note}`,
          `/projects/${existing.project.id}`,
        )
      }

      const row = await prisma.programProjectRegistration.findUniqueOrThrow({ where: { id: existing.id }, include: registrationInclude })
      res.status(200).json({ registration: serializeRegistration(row) })
    } catch (error) {
      next(error)
    }
  })

  /** The student's own projects that could be linked to this program, with the reason when not. */
  router.get('/:programId/linkable-projects', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id)
      if (!access.isParticipant) throw new HttpError(403, '프로그램 참여 학생만 조회할 수 있습니다.')
      const projects = await prisma.project.findMany({
        where: {
          programId: null,
          OR: [
            { ownerId: authUser.id },
            { members: { some: { userId: authUser.id, projectRole: { slug: { in: ['owner', 'admin'] } } } } },
          ],
        },
        select: {
          id: true,
          title: true,
          visibility: true,
          updatedAt: true,
          registrations: { where: { status: ProgramProjectRegistrationStatus.PENDING }, select: { programId: true } },
          _count: { select: { members: true, tasks: true, externalLinks: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      })
      res.status(200).json({
        projects: projects.map((project) => ({
          id: project.id,
          title: project.title,
          visibility: project.visibility.toLowerCase(),
          updatedAt: project.updatedAt,
          counts: project._count,
          blockedReason: project.registrations.length
            ? '다른 등록 요청이 검토 중입니다.'
            : project.visibility === ProjectVisibility.PUBLIC && !access.program.allowPublicProjects
              ? '전체 공개 프로젝트는 팀 공개로 바꾼 뒤 연결할 수 있습니다.'
              : null,
        })),
      })
    } catch (error) {
      next(error)
    }
  })
}
