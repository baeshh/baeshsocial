import { randomBytes } from 'node:crypto'
import {
  EvidenceStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  Prisma,
  ProgramDeliveryMode,
  ProgramRecruitmentMode,
  ProgramStatus,
  ProgramVisibility,
  ProjectActivityType,
  ProjectStatus,
  ProjectTaskStatus,
  ProjectVisibility,
  type ProgramAudience,
  type ProgramBenefit,
  type ProgramCategory,
  type RecordDisclosure,
} from '@prisma/client'
import { Router } from 'express'
import { isHostedMediaUrl } from '../../services/storage/mediaStorage.js'
import {
  replaceApplicationFields,
  type ApplicationFieldInput,
} from '../../services/programs/applicationForm.js'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity } from '../../services/billing/entitlements.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'
import { assertProgramWritable, listManagedPrograms, requireProgramAccess } from '../../utils/programAccess.js'
import { computeProgramKpis, defaultPeriod, kpiTargetsSchema, resolvePeriod } from './programKpis.js'
import { DEFAULT_PROJECT_ROLE_TEMPLATES } from '../../utils/projectPermissions.js'
import {
  addParticipantsSchema,
  applicationFormSchema,
  assignTeamMembersSchema,
  createProgramProjectSchema,
  createProgramSchema,
  evidenceQueueSchema,
  moveProgramProjectSchema,
  publishProgramSchema,
  updateProgramProjectSchema,
  updateProgramSchema,
} from '../../validators/program.validator.js'
import { findTeamConflicts, isStudentLed, loadStudentLed } from '../../services/programs/programProjects.js'
import {
  evidenceInclude,
  serializeApplicationField,
  serializeEvidence,
  serializeProgram,
  takesApplications,
  teamRoleOf,
  userBriefSelect,
} from './program.serializers.js'
import { registerProjectRegistrationRoutes } from './programProjectRegistrations.routes.js'
import { registerProjectReviewRoutes } from './programProjectReviews.routes.js'
import { registerProgramRecruitmentRoutes } from './programRecruitment.routes.js'
import { registerProjectVerificationRoutes } from './projectVerification.routes.js'

export const organizationProgramsRouter = Router({ mergeParams: true })
export const programsRouter = Router()

registerProgramRecruitmentRoutes(programsRouter)
registerProjectRegistrationRoutes(programsRouter)
registerProjectReviewRoutes(programsRouter)
registerProjectVerificationRoutes(programsRouter)

const toProgramStatus = (value: string) => value.toUpperCase() as ProgramStatus
const toProjectStatus = (value: string) => value.toUpperCase() as ProjectStatus

type PolicyInput = {
  allowStudentProjects?: boolean
  requireProjectApproval?: boolean
  allowStudentTeams?: boolean
  allowPublicProjects?: boolean
  allowMultipleProjects?: boolean
  recordDisclosure?: 'hidden' | 'summary' | 'full'
}

function policyData(input: PolicyInput) {
  return {
    ...(input.allowStudentProjects !== undefined ? { allowStudentProjects: input.allowStudentProjects } : {}),
    ...(input.requireProjectApproval !== undefined ? { requireProjectApproval: input.requireProjectApproval } : {}),
    ...(input.allowStudentTeams !== undefined ? { allowStudentTeams: input.allowStudentTeams } : {}),
    ...(input.allowPublicProjects !== undefined ? { allowPublicProjects: input.allowPublicProjects } : {}),
    ...(input.allowMultipleProjects !== undefined ? { allowMultipleProjects: input.allowMultipleProjects } : {}),
    ...(input.recordDisclosure !== undefined
      ? { recordDisclosure: input.recordDisclosure.toUpperCase() as RecordDisclosure }
      : {}),
  }
}

type RecruitmentInput = {
  visibility?: 'private' | 'organization' | 'unlisted' | 'public'
  recruitmentMode?: 'preselected' | 'open' | 'invite' | 'mixed'
  category?: string | null
  coverImageUrl?: string | null
  audiences?: string[]
  targetAudience?: string | null
  eligibility?: Record<string, unknown> | null
  benefits?: string[]
  benefitsNote?: string | null
  capacity?: number | null
  applyStartAt?: Date | null
  applyEndAt?: Date | null
  announceAt?: Date | null
  selectionProcess?: string | null
  deliveryMode?: 'online' | 'offline' | 'hybrid' | null
  location?: string | null
}

const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>

function recruitmentData(input: RecruitmentInput) {
  if (input.coverImageUrl && !isHostedMediaUrl(input.coverImageUrl)) {
    throw new HttpError(400, '대표 이미지는 BAESH에 업로드한 이미지만 사용할 수 있습니다.')
  }
  return {
    ...(input.visibility !== undefined ? { visibility: upper(input.visibility) as ProgramVisibility } : {}),
    ...(input.recruitmentMode !== undefined ? { recruitmentMode: upper(input.recruitmentMode) as ProgramRecruitmentMode } : {}),
    ...(input.category !== undefined ? { category: input.category ? (upper(input.category) as ProgramCategory) : null } : {}),
    ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
    ...(input.audiences !== undefined ? { audiences: [...new Set(input.audiences)].map((a) => upper(a) as ProgramAudience) } : {}),
    ...(input.targetAudience !== undefined ? { targetAudience: input.targetAudience } : {}),
    ...(input.eligibility !== undefined
      ? { eligibility: input.eligibility ? (input.eligibility as Prisma.InputJsonValue) : Prisma.DbNull }
      : {}),
    ...(input.benefits !== undefined ? { benefits: [...new Set(input.benefits)].map((b) => upper(b) as ProgramBenefit) } : {}),
    ...(input.benefitsNote !== undefined ? { benefitsNote: input.benefitsNote } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.applyStartAt !== undefined ? { applyStartAt: input.applyStartAt } : {}),
    ...(input.applyEndAt !== undefined ? { applyEndAt: input.applyEndAt } : {}),
    ...(input.announceAt !== undefined ? { announceAt: input.announceAt } : {}),
    ...(input.selectionProcess !== undefined ? { selectionProcess: input.selectionProcess } : {}),
    ...(input.deliveryMode !== undefined
      ? { deliveryMode: input.deliveryMode ? (upper(input.deliveryMode) as ProgramDeliveryMode) : null }
      : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
  }
}

type RecruitmentSnapshot = {
  visibility: ProgramVisibility
  recruitmentMode: ProgramRecruitmentMode
  applyStartAt: Date | null
  applyEndAt: Date | null
  capacity: number | null
  publishedAt: Date | null
}

/**
 * Checks the merged (stored + incoming) settings, since a PATCH may send only part of them. Drafts may be
 * incomplete; what applicants depend on is enforced once the program is (or is being) published.
 */
function assertRecruitmentConsistent(merged: RecruitmentSnapshot) {
  if (merged.applyStartAt && merged.applyEndAt && merged.applyStartAt > merged.applyEndAt) {
    throw new HttpError(400, '모집 마감 일시는 모집 시작 일시 이후여야 합니다.')
  }
  if (!takesApplications(merged)) return
  if (merged.visibility === ProgramVisibility.PRIVATE) {
    throw new HttpError(400, '지원을 받으려면 공개 범위를 전체 공개, 링크 공개 또는 조직 내부 공개로 설정해 주세요.')
  }
  if (!merged.publishedAt) return
  if (!merged.applyEndAt) throw new HttpError(400, '모집 마감 일시를 입력해 주세요.')
  if (merged.recruitmentMode === ProgramRecruitmentMode.MIXED && !merged.capacity) {
    throw new HttpError(400, '혼합 모집은 전체 정원을 입력해야 추가 모집 인원을 계산할 수 있습니다.')
  }
}

const newShareToken = () => randomBytes(16).toString('base64url')

const DEFAULT_APPLICATION_FIELDS: ApplicationFieldInput[] = [
  { type: 'long_text', label: '지원 동기', description: '참여하고 싶은 이유와 관련 경험을 적어 주세요.', required: true, options: [] },
  {
    type: 'consent',
    label: '개인정보 수집·이용 동의',
    description: '지원서와 BAESH 프로필은 선발 심사를 위해 이 프로그램 담당자에게만 공개됩니다.',
    required: true,
    options: [],
  },
]

const programInclude = {
  _count: { select: { projects: true, participants: true } },
  managers: { include: { user: { select: userBriefSelect } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProgramInclude

const programProjectSelect = {
  id: true,
  title: true,
  slug: true,
  teamName: true,
  objective: true,
  description: true,
  status: true,
  progress: true,
  startDate: true,
  endDate: true,
  programId: true,
  ownerId: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
  members: {
    orderBy: { joinedAt: 'asc' },
    select: {
      userId: true,
      role: true,
      projectRole: { select: { slug: true } },
      user: { select: userBriefSelect },
    },
  },
  tasks: { select: { status: true, dueDate: true } },
  evidence: { select: { status: true } },
  activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  reviews: { orderBy: { createdAt: 'desc' }, take: 50, select: { kind: true, status: true, createdAt: true } },
  verifications: { where: { status: 'VERIFIED' }, take: 1, select: { id: true, verifiedAt: true } },
  registrations: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, source: true } },
} satisfies Prisma.ProjectSelect

const STALE_AFTER_DAYS = 14

/**
 * Supervision status shown to staff, most urgent first: submitted evidence waiting for review,
 * student-side items waiting for staff (open removal request, unanswered reply, stalled team),
 * revision requests waiting for the team, otherwise on track.
 */
function supervisionHealth(project: ProgramProjectRow, now = new Date()) {
  const submitted = project.evidence.filter((item) => item.status === EvidenceStatus.SUBMITTED).length
  const openRevision = project.reviews.some((r) => r.kind === 'REVISION_REQUEST' && r.status === 'OPEN')
  const openRemoval = project.reviews.some((r) => r.kind === 'REMOVAL_REQUEST' && r.status === 'OPEN')
  const lastStaff = project.reviews.find((r) => r.kind === 'FEEDBACK' || r.kind === 'REVISION_REQUEST')
  const lastResponse = project.reviews.find((r) => r.kind === 'RESPONSE')
  const lastActivityAt = project.activities[0]?.createdAt ?? project.updatedAt
  const stale =
    project.status !== ProjectStatus.COMPLETED &&
    project.status !== ProjectStatus.ARCHIVED &&
    now.getTime() - Math.max(lastActivityAt.getTime(), project.updatedAt.getTime()) > STALE_AFTER_DAYS * 86_400_000
  const unanswered = Boolean(lastResponse && (!lastStaff || lastResponse.createdAt > lastStaff.createdAt))
  const health = submitted > 0
    ? 'evidence_review'
    : openRemoval || unanswered || stale
      ? 'feedback_needed'
      : openRevision
        ? 'revision_requested'
        : 'on_track'
  return {
    health,
    stale,
    openRevisionRequests: project.reviews.filter((r) => r.kind === 'REVISION_REQUEST' && r.status === 'OPEN').length,
    openRemovalRequests: project.reviews.filter((r) => r.kind === 'REMOVAL_REQUEST' && r.status === 'OPEN').length,
    lastActivityAt,
    overdueTasks: project.tasks.filter(
      (task) => task.dueDate && task.dueDate < now && task.status !== ProjectTaskStatus.DONE,
    ).length,
  }
}

type ProgramProjectRow = Prisma.ProjectGetPayload<{ select: typeof programProjectSelect }>

export function computeProjectProgress(project: { progress: number; tasks: { status: ProjectTaskStatus }[] }) {
  if (project.tasks.length === 0) return project.progress
  const done = project.tasks.filter((task) => task.status === ProjectTaskStatus.DONE).length
  return Math.round((done / project.tasks.length) * 100)
}

function serializeProgramProject(project: ProgramProjectRow, options: { includeEvidenceStats: boolean }) {
  const evidenceStats = { submitted: 0, approved: 0, rejected: 0 }
  for (const item of project.evidence) {
    if (item.status === EvidenceStatus.SUBMITTED) evidenceStats.submitted += 1
    if (item.status === EvidenceStatus.APPROVED) evidenceStats.approved += 1
    if (item.status === EvidenceStatus.REJECTED) evidenceStats.rejected += 1
  }
  return {
    id: project.id,
    title: project.title,
    slug: project.slug,
    teamName: project.teamName,
    objective: project.objective,
    description: project.description,
    status: project.status.toLowerCase(),
    progress: computeProjectProgress(project),
    startDate: project.startDate,
    endDate: project.endDate,
    programId: project.programId,
    updatedAt: project.updatedAt,
    members: project.members.map((member) => ({
      ...member.user,
      userId: member.userId,
      teamRole: member.userId === project.ownerId ? ('leader' as const) : teamRoleOf(member.projectRole?.slug),
    })),
    taskStats: {
      total: project.tasks.length,
      done: project.tasks.filter((task) => task.status === ProjectTaskStatus.DONE).length,
    },
    evidenceStats: options.includeEvidenceStats ? evidenceStats : null,
    visibility: project.visibility.toLowerCase(),
    origin: isStudentLed(project) ? ('student' as const) : ('institution' as const),
    registration: project.registrations[0]
      ? { status: project.registrations[0].status.toLowerCase(), source: project.registrations[0].source.toLowerCase() }
      : null,
    verification: project.verifications[0] ?? null,
    supervision: options.includeEvidenceStats ? supervisionHealth(project) : null,
  }
}

async function notify(userIds: string[], actorId: string, title: string, body: string, link: string) {
  const recipients = [...new Set(userIds)].filter((id) => id !== actorId)
  if (recipients.length === 0) return
  try {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, actorId, title, body, link, type: 'SYSTEM' as const })),
    })
  } catch (error) {
    console.error('Program notification failed:', error)
  }
}

/** Managers must be ACTIVE members holding at least the MANAGER role in the program's organization. */
async function resolveManagerIds(organizationId: string, userIds: string[]) {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return []
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      userId: { in: unique },
      status: OrganizationMemberStatus.ACTIVE,
      role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MANAGER] },
    },
    select: { userId: true },
  })
  if (members.length !== unique.length) {
    throw new HttpError(400, '담당자는 이 조직의 매니저 이상 구성원만 지정할 수 있습니다.')
  }
  return unique
}

async function findProgramProject(programId: string, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, programId }, select: { id: true, title: true } })
  if (!project) throw new HttpError(404, '이 프로그램에 속한 프로젝트를 찾을 수 없습니다.')
  return project
}

/* ------------------------------------------------------------------ */
/* /api/organizations/:orgId/programs                                  */
/* ------------------------------------------------------------------ */

organizationProgramsRouter.get('/', authenticate, requireOrgAccess(), async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization, membership } = res.locals.orgAccess as OrgAccess
    const approved = organization.verificationStatus === OrganizationVerificationStatus.APPROVED
    const isOrgAdmin = approved && hasOrgRole(membership.role, OrganizationRole.ADMIN)
    const canManage = approved && hasOrgRole(membership.role, OrganizationRole.MANAGER)

    const visibility: Prisma.ProgramWhereInput[] = [{ participants: { some: { userId: authUser.id } } }]
    if (canManage) visibility.push({ managers: { some: { userId: authUser.id } } })
    if (approved) {
      visibility.push({
        visibility: { in: [ProgramVisibility.ORGANIZATION, ProgramVisibility.PUBLIC] },
        publishedAt: { not: null },
        status: { not: ProgramStatus.ARCHIVED },
      })
    }

    const programs = await prisma.program.findMany({
      where: { organizationId: organization.id, ...(isOrgAdmin ? {} : { OR: visibility }) },
      include: {
        ...programInclude,
        managers: { ...programInclude.managers },
        participants: { where: { userId: authUser.id }, select: { id: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    const staffProgramIds = programs
      .filter((program) => isOrgAdmin || (canManage && program.managers.some((m) => m.userId === authUser.id)))
      .map((program) => program.id)
    const pending = staffProgramIds.length
      ? await prisma.projectEvidence.findMany({
          where: { status: EvidenceStatus.SUBMITTED, project: { programId: { in: staffProgramIds } } },
          select: { project: { select: { programId: true } } },
        })
      : []
    const pendingByProgram = new Map<string, number>()
    for (const row of pending) {
      const key = row.project.programId!
      pendingByProgram.set(key, (pendingByProgram.get(key) ?? 0) + 1)
    }

    res.status(200).json({
      canCreate: canManage,
      programs: programs.map((program) => {
        const isStaff = staffProgramIds.includes(program.id)
        return {
          ...serializeProgram(program),
          myAccess: { isStaff, isParticipant: program.participants.length > 0 },
          pendingEvidence: isStaff ? (pendingByProgram.get(program.id) ?? 0) : null,
        }
      }),
    })
  } catch (error) {
    next(error)
  }
})

organizationProgramsRouter.post(
  '/',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true }),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { organization, membership } = res.locals.orgAccess as OrgAccess
      const input = createProgramSchema.parse(req.body)

      const requested = [...input.managerUserIds]
      if (!hasOrgRole(membership.role, OrganizationRole.ADMIN)) requested.push(authUser.id)
      const managerIds = await resolveManagerIds(organization.id, requested)
      const status = toProgramStatus(input.status)
      const recruitment = recruitmentData(input)
      const visibility = recruitment.visibility ?? ProgramVisibility.PRIVATE
      const recruitmentMode = recruitment.recruitmentMode ?? ProgramRecruitmentMode.PRESELECTED
      const publishedAt = input.publish ? new Date() : null
      assertRecruitmentConsistent({
        visibility,
        recruitmentMode,
        applyStartAt: recruitment.applyStartAt ?? null,
        applyEndAt: recruitment.applyEndAt ?? null,
        capacity: recruitment.capacity ?? null,
        publishedAt,
      })
      await assertOrgCapacity(organization.id, 'activePrograms', status === ProgramStatus.ACTIVE ? 1 : 0)

      const program = await prisma.$transaction(async (tx) => {
        const created = await tx.program.create({
          data: {
            organizationId: organization.id,
            title: input.title,
            description: input.description ?? null,
            term: input.term ?? null,
            status,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            createdById: authUser.id,
            managers: { create: managerIds.map((userId) => ({ userId })) },
            ...policyData(input),
            ...recruitment,
            publishedAt,
            shareToken: visibility === ProgramVisibility.UNLISTED ? newShareToken() : null,
          },
        })
        if (takesApplications({ recruitmentMode })) {
          await replaceApplicationFields(tx, created.id, input.applicationFields ?? DEFAULT_APPLICATION_FIELDS)
        }
        return tx.program.findUniqueOrThrow({ where: { id: created.id }, include: programInclude })
      })

      await audit(req, res, {
        action: 'program.create',
        organizationId: organization.id,
        targetType: 'program',
        targetId: program.id,
        metadata: {
          title: program.title,
          status: program.status,
          managers: managerIds.length,
          policy: policyData(input),
          visibility: program.visibility,
          recruitmentMode: program.recruitmentMode,
          published: Boolean(program.publishedAt),
        },
      })
      await notify(
        managerIds,
        authUser.id,
        '프로그램 담당자로 지정되었습니다',
        `${organization.name} · ${program.title}`,
        `/org/${organization.id}/programs/${program.id}`,
      )

      res.status(201).json({ program: { ...serializeProgram(program), shareToken: program.shareToken } })
    } catch (error) {
      next(error)
    }
  },
)

/* ------------------------------------------------------------------ */
/* /api/programs/:programId                                            */
/* ------------------------------------------------------------------ */

programsRouter.get('/:programId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id)
    const program = await prisma.program.findUniqueOrThrow({ where: { id: access.program.id }, include: programInclude })

    res.status(200).json({
      program: { ...serializeProgram(program), shareToken: access.isStaff ? program.shareToken : null },
      organization: {
        id: access.organization.id,
        name: access.organization.name,
        type: access.organization.type.toLowerCase(),
      },
      myAccess: {
        isStaff: access.isStaff,
        isOrgAdmin: access.isOrgAdmin,
        isManager: access.isManager,
        isParticipant: access.isParticipant,
        orgRole: access.membership!.role.toLowerCase(),
      },
    })
  } catch (error) {
    next(error)
  }
})

programsRouter.patch('/:programId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const input = updateProgramSchema.parse(req.body)

    if (input.managerUserIds && !access.isOrgAdmin) {
      throw new HttpError(403, '담당자 변경은 조직 관리자만 할 수 있습니다.')
    }
    const managerIds = input.managerUserIds
      ? await resolveManagerIds(access.organization.id, input.managerUserIds)
      : null
    const nextStatus = input.status !== undefined ? toProgramStatus(input.status) : undefined
    if (nextStatus === ProgramStatus.ACTIVE && access.program.status !== ProgramStatus.ACTIVE) {
      await assertOrgCapacity(access.organization.id, 'activePrograms', 1)
    }

    const policy = policyData(input)
    const recruitment = recruitmentData(input)
    const nextVisibility = recruitment.visibility ?? access.program.visibility
    const nextMode = recruitment.recruitmentMode ?? access.program.recruitmentMode
    assertRecruitmentConsistent({
      visibility: nextVisibility,
      recruitmentMode: nextMode,
      applyStartAt: recruitment.applyStartAt !== undefined ? recruitment.applyStartAt : access.program.applyStartAt,
      applyEndAt: recruitment.applyEndAt !== undefined ? recruitment.applyEndAt : access.program.applyEndAt,
      capacity: recruitment.capacity !== undefined ? recruitment.capacity : access.program.capacity,
      publishedAt: access.program.publishedAt,
    })
    const needsShareToken = nextVisibility === ProgramVisibility.UNLISTED && !access.program.shareToken
    const needsDefaultForm =
      takesApplications({ recruitmentMode: nextMode }) &&
      !takesApplications(access.program) &&
      (await prisma.programApplicationField.count({ where: { programId: access.program.id, archivedAt: null } })) === 0
    const closingPublic = policy.allowPublicProjects === false && access.program.allowPublicProjects
    const program = await prisma.$transaction(async (tx) => {
      if (managerIds) {
        await tx.programManager.deleteMany({ where: { programId: access.program.id, userId: { notIn: managerIds } } })
        await tx.programManager.createMany({
          data: managerIds.map((userId) => ({ programId: access.program.id, userId })),
          skipDuplicates: true,
        })
      }
      if (closingPublic) {
        await tx.project.updateMany({
          where: { programId: access.program.id, visibility: ProjectVisibility.PUBLIC },
          data: { visibility: ProjectVisibility.TEAM },
        })
      }
      if (needsDefaultForm) await replaceApplicationFields(tx, access.program.id, DEFAULT_APPLICATION_FIELDS)
      return tx.program.update({
        where: { id: access.program.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.term !== undefined ? { term: input.term } : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
          ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
          ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
          ...policy,
          ...recruitment,
          ...(needsShareToken ? { shareToken: newShareToken() } : {}),
        },
        include: programInclude,
      })
    })

    await audit(req, res, {
      action: 'program.update',
      organizationId: access.organization.id,
      targetType: 'program',
      targetId: access.program.id,
      metadata: {
        fields: Object.keys(input),
        ...(nextStatus && nextStatus !== access.program.status ? { statusFrom: access.program.status, statusTo: nextStatus } : {}),
        ...(managerIds ? { managers: managerIds } : {}),
        ...(Object.keys(policy).length ? { policy } : {}),
        ...(recruitment.visibility && recruitment.visibility !== access.program.visibility
          ? { visibilityFrom: access.program.visibility, visibilityTo: recruitment.visibility }
          : {}),
        ...(recruitment.recruitmentMode && recruitment.recruitmentMode !== access.program.recruitmentMode
          ? { recruitmentModeTo: recruitment.recruitmentMode }
          : {}),
        ...(closingPublic ? { publicProjectsClosed: true } : {}),
      },
    })

    res.status(200).json({ program: { ...serializeProgram(program), shareToken: program.shareToken } })
  } catch (error) {
    next(error)
  }
})

/** Publishing, early close and share-link rotation are separate from editing so each is audited on its own. */
programsRouter.post('/:programId/publication', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const { action } = publishProgramSchema.parse(req.body)
    const now = new Date()
    let data: Prisma.ProgramUpdateInput
    switch (action) {
      case 'publish':
        assertRecruitmentConsistent({ ...access.program, publishedAt: now })
        data = { publishedAt: access.program.publishedAt ?? now }
        break
      case 'unpublish':
        data = { publishedAt: null }
        break
      case 'close_recruitment':
        if (!takesApplications(access.program)) throw new HttpError(400, '지원을 받는 프로그램이 아닙니다.')
        data = { recruitmentClosedAt: now }
        break
      case 'reopen_recruitment':
        if (access.program.applyEndAt && access.program.applyEndAt <= now) {
          throw new HttpError(400, '모집 마감 일시가 지났습니다. 마감 일시를 먼저 늦춰 주세요.')
        }
        data = { recruitmentClosedAt: null }
        break
      case 'rotate_share_link':
        if (access.program.visibility !== ProgramVisibility.UNLISTED) throw new HttpError(400, '링크 공개 프로그램만 링크를 다시 만들 수 있습니다.')
        data = { shareToken: newShareToken() }
        break
    }
    const program = await prisma.program.update({ where: { id: access.program.id }, data, include: programInclude })
    await audit(req, res, {
      action: `program.${action}`,
      organizationId: access.organization.id,
      targetType: 'program',
      targetId: access.program.id,
      metadata: { visibility: program.visibility, recruitmentMode: program.recruitmentMode },
    })
    res.status(200).json({ program: { ...serializeProgram(program), shareToken: program.shareToken } })
  } catch (error) {
    next(error)
  }
})

/* -------------------------- Application form ------------------------- */

programsRouter.get('/:programId/application-form', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const [fields, submitted] = await Promise.all([
      prisma.programApplicationField.findMany({ where: { programId: access.program.id, archivedAt: null }, orderBy: { position: 'asc' } }),
      prisma.programApplication.count({ where: { programId: access.program.id, status: { not: 'DRAFT' } } }),
    ])
    res.status(200).json({ fields: fields.map(serializeApplicationField), submittedCount: submitted })
  } catch (error) {
    next(error)
  }
})

programsRouter.put('/:programId/application-form', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    if (!takesApplications(access.program)) throw new HttpError(400, '공개 모집 또는 혼합 모집 프로그램에서만 지원서를 받을 수 있습니다.')
    const { fields } = applicationFormSchema.parse(req.body)
    const saved = await prisma.$transaction(async (tx) => {
      await replaceApplicationFields(tx, access.program.id, fields)
      return tx.programApplicationField.findMany({ where: { programId: access.program.id, archivedAt: null }, orderBy: { position: 'asc' } })
    })
    await audit(req, res, {
      action: 'program.application_form_update',
      organizationId: access.organization.id,
      targetType: 'program',
      targetId: access.program.id,
      metadata: { fields: saved.length },
    })
    res.status(200).json({ fields: saved.map(serializeApplicationField) })
  } catch (error) {
    next(error)
  }
})

programsRouter.delete('/:programId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'admin')
    const projectCount = await prisma.project.count({ where: { programId: access.program.id } })
    if (projectCount > 0) {
      throw new HttpError(409, '프로젝트가 남아 있는 프로그램은 삭제할 수 없습니다. 보관 상태로 변경해 주세요.')
    }
    await prisma.program.delete({ where: { id: access.program.id } })
    await audit(req, res, {
      action: 'program.delete',
      organizationId: access.organization.id,
      targetType: 'program',
      targetId: access.program.id,
      metadata: { title: access.program.title },
    })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/* ----------------------------- Projects ----------------------------- */

programsRouter.get('/:programId/projects', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id)
    const projects = await prisma.project.findMany({
      where: {
        programId: access.program.id,
        ...(access.isStaff ? {} : { members: { some: { userId: authUser.id } } }),
      },
      select: programProjectSelect,
      orderBy: [{ teamName: 'asc' }, { createdAt: 'asc' }],
    })
    const serialized = projects.map((project) => serializeProgramProject(project, { includeEvidenceStats: access.isStaff }))
    let summary = null
    if (access.isStaff) {
      const [pendingRequests, participantCount] = await Promise.all([
        prisma.programProjectRegistration.count({ where: { programId: access.program.id, status: 'PENDING' } }),
        prisma.programParticipant.count({ where: { programId: access.program.id } }),
      ])
      const students = new Set(projects.flatMap((project) => project.members.map((member) => member.userId)))
      const byHealth = { evidence_review: 0, feedback_needed: 0, revision_requested: 0, on_track: 0 }
      for (const project of serialized) byHealth[project.supervision!.health as keyof typeof byHealth] += 1
      summary = {
        projects: projects.length,
        studentProjects: serialized.filter((project) => project.origin === 'student').length,
        students: students.size,
        participants: participantCount,
        pendingEvidence: serialized.reduce((sum, project) => sum + (project.evidenceStats?.submitted ?? 0), 0),
        pendingRequests,
        openRemovalRequests: serialized.reduce((sum, project) => sum + (project.supervision?.openRemovalRequests ?? 0), 0),
        verified: serialized.filter((project) => project.verification).length,
        byHealth,
      }
    }
    res.status(200).json({ projects: serialized, summary })
  } catch (error) {
    next(error)
  }
})

programsRouter.post('/:programId/projects', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const input = createProgramProjectSchema.parse(req.body)
    if (toProjectStatus(input.status) !== ProjectStatus.ARCHIVED) {
      await assertOrgCapacity(access.organization.id, 'projects', 1)
    }

    const baseSlug =
      input.title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project'
    let slug = baseSlug
    for (let index = 1; await prisma.project.findUnique({ where: { slug }, select: { id: true } }); index += 1) {
      slug = `${baseSlug}-${index}`
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          title: input.title,
          slug,
          teamName: input.teamName ?? null,
          objective: input.objective ?? null,
          description: input.description ?? null,
          status: toProjectStatus(input.status),
          startDate: input.startDate ?? access.program.startDate,
          endDate: input.endDate ?? access.program.endDate,
          visibility: ProjectVisibility.TEAM,
          ownerId: authUser.id,
          programId: access.program.id,
        },
      })
      await tx.projectRole.createMany({
        data: DEFAULT_PROJECT_ROLE_TEMPLATES.map((template) => ({
          projectId: created.id,
          name: template.name,
          slug: template.slug,
          description: template.description,
          permissions: template.permissions,
          isSystem: template.isSystem,
          sortOrder: template.sortOrder,
        })),
      })
      await tx.projectActivity.create({
        data: {
          projectId: created.id,
          userId: authUser.id,
          type: ProjectActivityType.MILESTONE,
          title: 'Program project created',
          description: `${access.program.title} 프로그램 프로젝트로 생성되었습니다.`,
        },
      })
      return tx.project.findUniqueOrThrow({ where: { id: created.id }, select: programProjectSelect })
    })

    res.status(201).json({ project: serializeProgramProject(project, { includeEvidenceStats: true }) })
  } catch (error) {
    next(error)
  }
})

programsRouter.patch('/:programId/projects/:projectId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const target = await findProgramProject(access.program.id, String(req.params.projectId))
    const input = updateProgramProjectSchema.parse(req.body)
    if (await loadStudentLed(target.id)) {
      const contentFields = Object.keys(input).filter((key) => key !== 'teamName' && input[key as keyof typeof input] !== undefined)
      if (contentFields.length > 0) {
        throw new HttpError(403, '참여자 주도 프로젝트의 내용은 직접 수정할 수 없습니다. 피드백이나 수정 요청을 남겨 주세요.')
      }
    }
    if (input.status !== undefined && toProjectStatus(input.status) !== ProjectStatus.ARCHIVED) {
      const current = await prisma.project.findUniqueOrThrow({ where: { id: target.id }, select: { status: true } })
      if (current.status === ProjectStatus.ARCHIVED) await assertOrgCapacity(access.organization.id, 'projects', 1)
    }

    const project = await prisma.project.update({
      where: { id: target.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.teamName !== undefined ? { teamName: input.teamName } : {}),
        ...(input.objective !== undefined ? { objective: input.objective } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: toProjectStatus(input.status) } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      },
      select: programProjectSelect,
    })
    res.status(200).json({ project: serializeProgramProject(project, { includeEvidenceStats: true }) })
  } catch (error) {
    next(error)
  }
})

programsRouter.post('/:programId/projects/:projectId/move', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const source = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const target = await findProgramProject(source.program.id, String(req.params.projectId))
    const { targetProgramId } = moveProgramProjectSchema.parse(req.body)
    if (targetProgramId === source.program.id) {
      throw new HttpError(400, '같은 프로그램으로는 이동할 수 없습니다.')
    }

    const destination = await requireProgramAccess(targetProgramId, authUser.id, 'staff')
    if (destination.organization.id !== source.organization.id) {
      throw new HttpError(403, '다른 조직의 프로그램으로는 이동할 수 없습니다.')
    }
    assertProgramWritable(destination.program.status)

    const teamMembers = await prisma.projectMember.findMany({ where: { projectId: target.id }, select: { userId: true } })
    const conflicts = await prisma.projectMember.findMany({
      where: {
        userId: { in: teamMembers.map((member) => member.userId) },
        project: { programId: destination.program.id },
      },
      select: { user: { select: { name: true } } },
    })
    if (conflicts.length > 0) {
      throw new HttpError(
        409,
        `대상 프로그램에서 이미 다른 팀에 배정된 참여자가 있습니다: ${conflicts.map((c) => c.user.name).join(', ')}`,
      )
    }

    await prisma.$transaction([
      prisma.project.update({ where: { id: target.id }, data: { programId: destination.program.id } }),
      prisma.programParticipant.createMany({
        data: teamMembers.map((member) => ({
          programId: destination.program.id,
          userId: member.userId,
          addedById: authUser.id,
        })),
        skipDuplicates: true,
      }),
      prisma.projectActivity.create({
        data: {
          projectId: target.id,
          userId: authUser.id,
          type: ProjectActivityType.UPDATE,
          title: 'Program changed',
          description: `${source.program.title} → ${destination.program.title} 프로그램으로 이동했습니다.`,
        },
      }),
    ])

    res.status(200).json({ ok: true, programId: destination.program.id })
  } catch (error) {
    next(error)
  }
})

/* ------------------------- Team assignment -------------------------- */

programsRouter.post('/:programId/projects/:projectId/members', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const project = await findProgramProject(access.program.id, String(req.params.projectId))
    const input = assignTeamMembersSchema.parse(req.body)

    const participants = await prisma.programParticipant.findMany({
      where: {
        programId: access.program.id,
        userId: { in: input.userIds },
        user: {
          organizationMemberships: {
            some: { organizationId: access.organization.id, status: OrganizationMemberStatus.ACTIVE },
          },
        },
      },
      select: { userId: true },
    })
    const participantIds = new Set(participants.map((p) => p.userId))
    const otherTeamByUser = await findTeamConflicts(prisma, access.program, input.userIds, project.id)

    const role = await prisma.projectRole.findUnique({
      where: { projectId_slug: { projectId: project.id, slug: input.teamRole === 'leader' ? 'admin' : 'editor' } },
    })
    if (!role) throw new HttpError(500, '프로젝트 기본 역할이 없습니다.')

    const added: string[] = []
    const skipped: { userId: string; reason: string }[] = []
    for (const userId of [...new Set(input.userIds)]) {
      if (!participantIds.has(userId)) {
        skipped.push({ userId, reason: '프로그램 참여자가 아닙니다.' })
        continue
      }
      const otherTeam = otherTeamByUser.get(userId)
      if (otherTeam) {
        skipped.push({ userId, reason: `이미 '${otherTeam}' 팀에 배정되어 있습니다.` })
        continue
      }
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId } },
        create: {
          projectId: project.id,
          userId,
          roleId: role.id,
          role: input.teamRole === 'leader' ? '팀장' : '팀원',
          contribution: access.program.title,
        },
        update: { roleId: role.id, role: input.teamRole === 'leader' ? '팀장' : '팀원' },
      })
      added.push(userId)
    }

    await notify(
      added,
      authUser.id,
      '프로젝트 팀에 배정되었습니다',
      `${access.program.title} · ${project.title}`,
      `/projects/${project.id}?tab=evidence`,
    )

    res.status(200).json({ added, skipped })
  } catch (error) {
    next(error)
  }
})

programsRouter.delete('/:programId/projects/:projectId/members/:userId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const project = await findProgramProject(access.program.id, String(req.params.projectId))
    const userId = String(req.params.userId)
    const owner = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, select: { ownerId: true } })
    if (owner.ownerId === userId) {
      throw new HttpError(409, '프로젝트를 만든 참여자는 팀에서 제외할 수 없습니다. 프로젝트를 프로그램에서 제거해 주세요.')
    }
    const { count } = await prisma.projectMember.deleteMany({ where: { projectId: project.id, userId } })
    if (count > 0) {
      await audit(req, res, {
        action: 'program.team_member_remove',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: project.id,
        metadata: { programId: access.program.id, userId },
      })
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/* --------------------------- Participants --------------------------- */

programsRouter.get('/:programId/participants', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const [participants, assignments, evidence] = await Promise.all([
      prisma.programParticipant.findMany({
        where: { programId: access.program.id },
        include: { user: { select: userBriefSelect } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.projectMember.findMany({
        where: { project: { programId: access.program.id } },
        select: {
          userId: true,
          projectRole: { select: { slug: true } },
          project: { select: { id: true, title: true, teamName: true } },
        },
      }),
      prisma.projectEvidence.groupBy({
        by: ['authorId', 'status'],
        where: { project: { programId: access.program.id }, status: { not: EvidenceStatus.DRAFT } },
        _count: { _all: true },
      }),
    ])

    const assignmentsByUser = new Map<string, typeof assignments>()
    for (const row of assignments) assignmentsByUser.set(row.userId, [...(assignmentsByUser.get(row.userId) ?? []), row])
    res.status(200).json({
      participants: participants.map((participant) => {
        const userAssignments = assignmentsByUser.get(participant.userId) ?? []
        const assignment = userAssignments[0]
        const counts = { submitted: 0, approved: 0, rejected: 0 }
        for (const row of evidence.filter((item) => item.authorId === participant.userId)) {
          counts[row.status.toLowerCase() as keyof typeof counts] = row._count._all
        }
        return {
          id: participant.id,
          userId: participant.userId,
          studentNo: participant.studentNo,
          department: participant.department,
          createdAt: participant.createdAt,
          user: participant.user,
          team: assignment
            ? { ...assignment.project, teamRole: teamRoleOf(assignment.projectRole?.slug) }
            : null,
          teams: userAssignments.map((row) => ({ ...row.project, teamRole: teamRoleOf(row.projectRole?.slug) })),
          evidence: counts,
        }
      }),
    })
  } catch (error) {
    next(error)
  }
})

programsRouter.post('/:programId/participants', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const { participants } = addParticipantsSchema.parse(req.body)

    const emails = participants.flatMap((entry) => (entry.email ? [entry.email] : []))
    const ids = participants.flatMap((entry) => (entry.userId ? [entry.userId] : []))
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { in: emails } }, { id: { in: ids } }] },
      select: {
        id: true,
        email: true,
        organizationMemberships: {
          where: { organizationId: access.organization.id },
          select: { id: true, status: true },
        },
      },
    })
    const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))
    const byId = new Map(users.map((user) => [user.id, user]))
    const existing = new Set(
      (
        await prisma.programParticipant.findMany({
          where: { programId: access.program.id, userId: { in: users.map((user) => user.id) } },
          select: { userId: true },
        })
      ).map((row) => row.userId),
    )

    const pendingToApprove = new Set(
      participants.flatMap((entry) => {
        const user = entry.userId ? byId.get(entry.userId) : byEmail.get(entry.email!)
        return user?.organizationMemberships[0]?.status === OrganizationMemberStatus.PENDING ? [user.id] : []
      }),
    )
    if (pendingToApprove.size > 0) {
      await assertOrgCapacity(access.organization.id, 'members', pendingToApprove.size)
    }

    const added: string[] = []
    const skipped: { input: string; reason: string }[] = []
    const approvedMemberships: string[] = []

    for (const entry of participants) {
      const label = entry.email ?? entry.userId!
      const user = entry.userId ? byId.get(entry.userId) : byEmail.get(entry.email!)
      if (!user) {
        skipped.push({ input: label, reason: 'BAESH 계정을 찾을 수 없습니다.' })
        continue
      }
      const membership = user.organizationMemberships[0]
      if (!membership || membership.status === OrganizationMemberStatus.REJECTED) {
        skipped.push({ input: label, reason: '조직에 가입하지 않은 사용자입니다. 먼저 조직 가입을 요청하도록 안내해 주세요.' })
        continue
      }
      if (membership.status === OrganizationMemberStatus.SUSPENDED) {
        skipped.push({ input: label, reason: '조직에서 이용이 정지된 구성원입니다.' })
        continue
      }
      if (membership.status === OrganizationMemberStatus.PENDING) {
        await prisma.organizationMember.update({
          where: { id: membership.id },
          data: { status: OrganizationMemberStatus.ACTIVE, role: OrganizationRole.MEMBER, joinedAt: new Date() },
        })
        approvedMemberships.push(user.id)
      }
      await prisma.programParticipant.upsert({
        where: { programId_userId: { programId: access.program.id, userId: user.id } },
        create: {
          programId: access.program.id,
          userId: user.id,
          studentNo: entry.studentNo ?? null,
          department: entry.department ?? null,
          addedById: authUser.id,
        },
        update: {
          ...(entry.studentNo !== undefined ? { studentNo: entry.studentNo } : {}),
          ...(entry.department !== undefined ? { department: entry.department } : {}),
        },
      })
      if (!existing.has(user.id)) {
        existing.add(user.id)
        added.push(user.id)
      }
    }

    await notify(
      added,
      authUser.id,
      '프로그램 참여자로 등록되었습니다',
      `${access.organization.name} · ${access.program.title}`,
      `/org/${access.organization.id}/programs/${access.program.id}`,
    )

    await audit(req, res, {
      action: 'program.participants_add',
      organizationId: access.organization.id,
      targetType: 'program',
      targetId: access.program.id,
      metadata: { added: added.length, skipped: skipped.length, approvedMemberships },
    })
    res.status(200).json({ added, skipped, approvedMemberships })
  } catch (error) {
    next(error)
  }
})

programsRouter.delete('/:programId/participants/:userId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const userId = String(req.params.userId)
    await prisma.$transaction([
      prisma.projectMember.deleteMany({ where: { userId, project: { programId: access.program.id } } }),
      prisma.programParticipant.deleteMany({ where: { programId: access.program.id, userId } }),
    ])
    await audit(req, res, {
      action: 'program.participant_remove',
      organizationId: access.organization.id,
      targetType: 'user',
      targetId: userId,
      metadata: { programId: access.program.id },
    })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/* -------------------------------- KPIs ------------------------------- */

programsRouter.get('/:programId/kpis', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const period = resolvePeriod(req.query, defaultPeriod([access.program]))
    res.status(200).json(await computeProgramKpis([access.program.id], period))
  } catch (error) {
    next(error)
  }
})

programsRouter.put('/:programId/kpi-targets', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    assertProgramWritable(access.program.status)
    const targets = kpiTargetsSchema.parse(req.body?.targets ?? {})
    const cleaned = Object.fromEntries(Object.entries(targets).filter(([, value]) => value !== null && value !== undefined))
    await prisma.program.update({ where: { id: access.program.id }, data: { kpiTargets: cleaned } })
    res.status(200).json({ targets: cleaned })
  } catch (error) {
    next(error)
  }
})

organizationProgramsRouter.get(
  '/kpis',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true }),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { organization, membership } = res.locals.orgAccess as OrgAccess
      const { programs, isOrgAdmin } = await listManagedPrograms(organization, membership, authUser.id)
      const period = resolvePeriod(req.query, defaultPeriod(programs))
      const result = await computeProgramKpis(
        programs.map((program) => program.id),
        period,
      )
      res.status(200).json({ ...result, isOrgAdmin })
    } catch (error) {
      next(error)
    }
  },
)

/* --------------------------- Review queue --------------------------- */

programsRouter.get('/:programId/evidence', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
    const query = evidenceQueueSchema.parse(req.query)
    const evidence = await prisma.projectEvidence.findMany({
      where: {
        project: { programId: access.program.id, ...(query.projectId ? { id: query.projectId } : {}) },
        status:
          query.status === 'all'
            ? { not: EvidenceStatus.DRAFT }
            : (query.status.toUpperCase() as EvidenceStatus),
      },
      include: {
        ...evidenceInclude,
        project: { select: { id: true, title: true, teamName: true, programId: true } },
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    })
    res.status(200).json({ evidence: evidence.map(serializeEvidence) })
  } catch (error) {
    next(error)
  }
})
