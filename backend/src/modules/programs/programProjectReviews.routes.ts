import {
  EvidenceStatus,
  ProgramProjectRegistrationSource,
  ProgramProjectRegistrationStatus,
  ProjectActivityType,
  ProjectReviewKind,
  ProjectReviewStatus,
  ProjectTaskStatus,
  type Prisma,
} from '@prisma/client'
import type { RequestHandler, Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { isStudentLed, notifyUsers, programStaffIds } from '../../services/programs/programProjects.js'
import { captureProgramProjectRecord } from '../../services/records/programProjectRecords.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { assertProgramWritable, requireProgramAccess } from '../../utils/programAccess.js'
import { resolveUserProjectPermissions } from '../../utils/projectPermissions.js'
import {
  createProjectReviewSchema,
  removeProgramProjectSchema,
  resolveProjectReviewSchema,
} from '../../validators/program.validator.js'
import { teamRoleOf, userBriefSelect } from './program.serializers.js'

const reviewInclude = {
  author: { select: userBriefSelect },
  targetUser: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProjectReviewInclude

type ReviewRow = Prisma.ProjectReviewGetPayload<{ include: typeof reviewInclude }>

function serializeReview(row: ReviewRow, staffIds: Set<string>) {
  return {
    id: row.id,
    kind: row.kind.toLowerCase(),
    status: row.status?.toLowerCase() ?? null,
    body: row.body,
    parentId: row.parentId,
    author: row.author,
    authorIsStaff: row.authorId ? staffIds.has(row.authorId) : false,
    targetUser: row.targetUser,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
  }
}

/**
 * Program staff, or a team member who can currently view the project. Locked-out members of a
 * PRIVATE project and people outside the team get 404.
 */
async function loadReviewContext(programId: string, projectId: string, userId: string) {
  const access = await requireProgramAccess(programId, userId)
  const project = await prisma.project.findFirst({
    where: { id: projectId, programId: access.program.id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      members: {
        orderBy: { joinedAt: 'asc' },
        select: { userId: true, role: true, joinedAt: true, projectRole: { select: { slug: true } }, user: { select: userBriefSelect } },
      },
    },
  })
  if (!project) throw new HttpError(404, '이 프로그램에 속한 프로젝트를 찾을 수 없습니다.')
  const resolved = await resolveUserProjectPermissions(project.id, userId)
  const member = project.members.find((m) => m.userId === userId) ?? null
  const isTeamMember = Boolean(member) && resolved.permissions.includes('project.view')
  if (!access.isStaff && !isTeamMember) throw new HttpError(404, '이 프로그램에 속한 프로젝트를 찾을 수 없습니다.')
  return { access, project, member, isTeamMember, isLeader: resolved.isLeader }
}

async function staffIdSet(programId: string, organizationId: string) {
  const [managers, admins] = await Promise.all([
    programStaffIds(prisma, programId),
    prisma.organizationMember.findMany({
      where: { organizationId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      select: { userId: true },
    }),
  ])
  return new Set([...managers, ...admins.map((row) => row.userId)])
}

export function registerProjectReviewRoutes(router: Router) {
  router.get('/:programId/projects/:projectId/reviews', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { access, project, isTeamMember, isLeader } = await loadReviewContext(
        String(req.params.programId),
        String(req.params.projectId),
        authUser.id,
      )
      const now = new Date()
      const [reviews, evidence, tasks, staff] = await Promise.all([
        prisma.projectReview.findMany({
          where: { projectId: project.id, programId: access.program.id },
          include: reviewInclude,
          orderBy: { createdAt: 'asc' },
          take: 300,
        }),
        prisma.projectEvidence.groupBy({
          by: ['authorId', 'status'],
          where: { projectId: project.id, status: { not: EvidenceStatus.DRAFT } },
          _count: { _all: true },
          _max: { activityDate: true },
        }),
        prisma.projectTask.findMany({ where: { projectId: project.id }, select: { status: true, dueDate: true } }),
        staffIdSet(access.program.id, access.organization.id),
      ])

      const members = project.members.map((member) => {
        const counts = { submitted: 0, approved: 0, rejected: 0 }
        let lastEvidenceAt: Date | null = null
        for (const row of evidence.filter((item) => item.authorId === member.userId)) {
          counts[row.status.toLowerCase() as keyof typeof counts] = row._count._all
          if (row._max.activityDate && (!lastEvidenceAt || row._max.activityDate > lastEvidenceAt)) lastEvidenceAt = row._max.activityDate
        }
        return {
          ...member.user,
          userId: member.userId,
          role: member.role,
          teamRole: teamRoleOf(member.projectRole?.slug),
          joinedAt: member.joinedAt,
          evidence: counts,
          lastEvidenceAt,
          missingSubmission: counts.submitted + counts.approved + counts.rejected === 0,
        }
      })

      res.status(200).json({
        reviews: reviews.map((row) => serializeReview(row, staff)),
        members,
        tasks: {
          total: tasks.length,
          done: tasks.filter((task) => task.status === ProjectTaskStatus.DONE).length,
          overdue: tasks.filter((task) => task.dueDate && task.dueDate < now && task.status !== ProjectTaskStatus.DONE).length,
        },
        origin: isStudentLed(project) ? 'student' : 'institution',
        permissions: {
          canFeedback: access.isStaff,
          canRespond: isTeamMember,
          canRequestRemoval: isTeamMember && isLeader,
          canResolve: access.isStaff,
          canRemoveProject: access.isStaff && isStudentLed(project),
        },
      })
    } catch (error) {
      next(error)
    }
  })

  const createReview: RequestHandler = async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { access, project, isTeamMember, isLeader } = await loadReviewContext(
        String(req.params.programId),
        String(req.params.projectId),
        authUser.id,
      )
      assertProgramWritable(access.program.status)
      const input = createProjectReviewSchema.parse(req.body)
      const kind = input.kind.toUpperCase() as ProjectReviewKind

      if ((kind === ProjectReviewKind.FEEDBACK || kind === ProjectReviewKind.REVISION_REQUEST) && !access.isStaff) {
        throw new HttpError(403, '피드백과 수정 요청은 프로그램 담당자만 남길 수 있습니다.')
      }
      if (kind === ProjectReviewKind.RESPONSE && !isTeamMember) {
        throw new HttpError(403, '팀원만 답변을 남길 수 있습니다.')
      }
      if (kind === ProjectReviewKind.REMOVAL_REQUEST && !(isTeamMember && isLeader)) {
        throw new HttpError(403, '팀장만 팀원 제외 또는 프로젝트 제거를 요청할 수 있습니다.')
      }
      if (input.targetUserId) {
        if (kind !== ProjectReviewKind.REMOVAL_REQUEST) throw new HttpError(400, '대상 팀원은 제외 요청에만 지정할 수 있습니다.')
        if (!project.members.some((m) => m.userId === input.targetUserId)) throw new HttpError(400, '이 프로젝트의 팀원이 아닙니다.')
        if (input.targetUserId === project.ownerId) throw new HttpError(400, '프로젝트를 만든 참여자는 제외할 수 없습니다. 프로젝트 제거를 요청해 주세요.')
      }
      if (input.parentId) {
        const parent = await prisma.projectReview.findFirst({ where: { id: input.parentId, projectId: project.id }, select: { id: true } })
        if (!parent) throw new HttpError(400, '답변할 리뷰를 찾을 수 없습니다.')
      }

      const review = await prisma.projectReview.create({
        data: {
          projectId: project.id,
          programId: access.program.id,
          authorId: authUser.id,
          kind,
          status:
            kind === ProjectReviewKind.REVISION_REQUEST || kind === ProjectReviewKind.REMOVAL_REQUEST ? ProjectReviewStatus.OPEN : null,
          body: input.body,
          targetUserId: input.targetUserId ?? null,
          parentId: input.parentId ?? null,
        },
        include: reviewInclude,
      })

      if (kind === ProjectReviewKind.REMOVAL_REQUEST) {
        await audit(req, res, {
          action: 'program.project_removal_request',
          organizationId: access.organization.id,
          targetType: 'project',
          targetId: project.id,
          metadata: { programId: access.program.id, reviewId: review.id, targetUserId: input.targetUserId ?? null },
        })
      }

      const link = `/projects/${project.id}?tab=reviews`
      if (access.isStaff && (kind === ProjectReviewKind.FEEDBACK || kind === ProjectReviewKind.REVISION_REQUEST)) {
        await notifyUsers(
          project.members.map((m) => m.userId),
          authUser.id,
          kind === ProjectReviewKind.REVISION_REQUEST ? '담당자가 수정을 요청했습니다' : '담당자 피드백이 도착했습니다',
          `${access.program.title} · ${project.title}`,
          link,
        )
      } else {
        await notifyUsers(
          await programStaffIds(prisma, access.program.id),
          authUser.id,
          kind === ProjectReviewKind.REMOVAL_REQUEST ? '팀원 제외·프로젝트 제거 요청' : '팀이 피드백에 답변했습니다',
          `${access.program.title} · ${project.title}`,
          link,
        )
      }

      const staff = await staffIdSet(access.program.id, access.organization.id)
      res.status(201).json({ review: serializeReview(review, staff) })
    } catch (error) {
      next(error)
    }
  }

  router.post('/:programId/projects/:projectId/reviews', authenticate, createReview)
  router.post('/:programId/projects/:projectId/feedback', authenticate, createReview)

  router.patch('/:programId/projects/:projectId/reviews/:reviewId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { access, project } = await loadReviewContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      if (!access.isStaff) throw new HttpError(403, '프로그램 담당자만 요청을 처리할 수 있습니다.')
      assertProgramWritable(access.program.status)
      const input = resolveProjectReviewSchema.parse(req.body)
      const review = await prisma.projectReview.findFirst({ where: { id: String(req.params.reviewId), projectId: project.id } })
      if (!review) throw new HttpError(404, '리뷰를 찾을 수 없습니다.')
      if (review.status !== ProjectReviewStatus.OPEN) throw new HttpError(409, '처리할 수 없는 상태입니다.')

      await prisma.$transaction(async (tx) => {
        await tx.projectReview.update({
          where: { id: review.id },
          data: { status: ProjectReviewStatus.RESOLVED, resolvedById: authUser.id, resolvedAt: new Date() },
        })
        if (input.note) {
          await tx.projectReview.create({
            data: {
              projectId: project.id,
              programId: access.program.id,
              authorId: authUser.id,
              kind: ProjectReviewKind.FEEDBACK,
              body: input.note,
              parentId: review.id,
            },
          })
        }
      })
      await notifyUsers(
        project.members.map((m) => m.userId),
        authUser.id,
        review.kind === ProjectReviewKind.REMOVAL_REQUEST ? '제외·제거 요청이 처리되었습니다' : '수정 요청이 완료 처리되었습니다',
        `${access.program.title} · ${project.title}`,
        `/projects/${project.id}?tab=reviews`,
      )
      res.status(200).json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Takes a student-led project out of the program. The project and its history stay with the
   * team as an independent project; issued verification records are left untouched.
   */
  router.post('/:programId/projects/:projectId/remove', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { access, project } = await loadReviewContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      if (!access.isStaff) throw new HttpError(403, '프로그램 담당자만 프로젝트를 제거할 수 있습니다.')
      assertProgramWritable(access.program.status)
      if (!isStudentLed(project)) {
        throw new HttpError(409, '기관이 만든 프로젝트는 제거 대신 보관 상태로 변경해 주세요.')
      }
      const { reason } = removeProgramProjectSchema.parse(req.body)

      await prisma.$transaction(async (tx) => {
        const recordKey = { programId: access.program.id, projectId: project.id, actorId: authUser.id }
        await captureProgramProjectRecord(tx, { ...recordKey, trigger: 'project.removing' })
        await tx.project.update({ where: { id: project.id }, data: { programId: null } })
        const approved = await tx.programProjectRegistration.findFirst({
          where: { projectId: project.id, programId: access.program.id, status: ProgramProjectRegistrationStatus.APPROVED },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        const removal = { status: ProgramProjectRegistrationStatus.REMOVED, reviewedById: authUser.id, reviewedAt: new Date(), reviewNote: reason }
        if (approved) {
          await tx.programProjectRegistration.update({ where: { id: approved.id }, data: removal })
        } else {
          await tx.programProjectRegistration.create({
            data: {
              programId: access.program.id,
              projectId: project.id,
              requesterId: null,
              source: ProgramProjectRegistrationSource.EXISTING_PROJECT,
              ...removal,
            },
          })
        }
        await tx.projectReview.updateMany({
          where: { projectId: project.id, status: ProjectReviewStatus.OPEN },
          data: { status: ProjectReviewStatus.RESOLVED, resolvedById: authUser.id, resolvedAt: new Date() },
        })
        await tx.projectActivity.create({
          data: {
            projectId: project.id,
            userId: authUser.id,
            type: ProjectActivityType.UPDATE,
            title: 'Removed from program',
            description: `${access.program.title} 프로그램에서 제외되어 개인 프로젝트로 돌아갔습니다. 사유: ${reason}`,
          },
        })
        await captureProgramProjectRecord(tx, { ...recordKey, trigger: 'project.removed', finalize: true, reason })
      })

      await audit(req, res, {
        action: 'program.project_remove',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: project.id,
        metadata: { programId: access.program.id, reason },
      })
      await notifyUsers(
        project.members.map((m) => m.userId),
        authUser.id,
        '프로젝트가 프로그램에서 제외되었습니다',
        `${access.program.title} · ${project.title} — 사유: ${reason}`,
        `/projects/${project.id}`,
      )
      res.status(200).json({ ok: true })
    } catch (error) {
      next(error)
    }
  })
}
