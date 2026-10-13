import {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  ProgramApplicationStatus,
  ProgramStatus,
  ProgramVisibility,
  type Prisma,
  type ProgramCategory,
} from '@prisma/client'
import type { RequestHandler, Router as ExpressRouter } from 'express'
import multer from 'multer'
import { prisma } from '../../config/prisma.js'
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js'
import { limits } from '../../middlewares/rateLimit.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity, assertParticipantSeats, bytesToGb } from '../../services/billing/entitlements.js'
import { MAX_FILES_PER_FIELD, normaliseAnswers } from '../../services/programs/applicationForm.js'
import { heldSeats, liveOfferWhere, offerDeadline, refillProgram } from '../../services/programs/applicationOffers.js'
import { notifyUsers, programStaffIds } from '../../services/programs/programProjects.js'
import { FileRejectedError, validateUpload } from '../../services/storage/fileValidation.js'
import { buildStorageKey, storage } from '../../services/storage/storage.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'
import { assertProgramWritable, lockProgramSeats, requireProgramAccess } from '../../utils/programAccess.js'
import {
  decideProgramApplicationSchema,
  discoverProgramsSchema,
  programApplicationQuerySchema,
  programViewQuerySchema,
  saveApplicationSchema,
} from '../../validators/program.validator.js'
import {
  recruitmentState,
  serializeApplicationField,
  serializeRecruitment,
  takesApplications,
  userBriefSelect,
  type RecruitmentState,
} from './program.serializers.js'

const DISCOVER_POOL_SIZE = 200
const MAX_APPLICATION_FILE_BYTES = 20 * 1024 * 1024
const STATE_ORDER: Record<RecruitmentState, number> = { open: 0, scheduled: 1, closed: 2, selected: 3, invite_only: 4, draft: 5 }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_APPLICATION_FILE_BYTES, files: 1, fields: 5 } })
const acceptFile: RequestHandler = (req, res, next) => upload.single('file')(req, res, next)

const liveProgram = {
  status: { not: ProgramStatus.ARCHIVED },
  publishedAt: { not: null },
  organization: { verificationStatus: OrganizationVerificationStatus.APPROVED },
} satisfies Prisma.ProgramWhereInput

/**
 * Programs listed on Jobs: published PUBLIC ones, plus published ORGANIZATION ones of organizations the
 * viewer is an active member of. UNLISTED and PRIVATE programs are never listed.
 */
function listableWhere(userId: string | null): Prisma.ProgramWhereInput {
  return {
    ...liveProgram,
    OR: [
      { visibility: ProgramVisibility.PUBLIC },
      ...(userId
        ? [
            {
              visibility: ProgramVisibility.ORGANIZATION,
              organization: { members: { some: { userId, status: OrganizationMemberStatus.ACTIVE } } },
            },
          ]
        : []),
    ],
  }
}

const NOBODY = '__anonymous__'

const viewerInclude = (userId: string | null) => {
  const uid = userId ?? NOBODY
  return {
    organization: {
      select: {
        id: true,
        name: true,
        type: true,
        verificationStatus: true,
        members: { where: { userId: uid }, select: { role: true, status: true } },
      },
    },
    _count: { select: { participants: true } },
    participants: { where: { userId: uid }, select: { id: true } },
    managers: { where: { userId: uid }, select: { id: true } },
    applications: {
      where: { userId: uid },
      select: {
        id: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        reviewNote: true,
        reviewedAt: true,
        offerExpiresAt: true,
        respondedAt: true,
        waitlistedAt: true,
        answers: { select: { fieldId: true, value: true } },
        files: { select: { id: true, fieldId: true, originalName: true, sizeBytes: true, mimeType: true } },
      },
    },
  } satisfies Prisma.ProgramInclude
}

type ViewerRow = Prisma.ProgramGetPayload<{ include: ReturnType<typeof viewerInclude> }>

function viewerOf(program: ViewerRow) {
  const membership = program.organization.members[0]
  const activeMember = membership?.status === OrganizationMemberStatus.ACTIVE
  const approved = program.organization.verificationStatus === OrganizationVerificationStatus.APPROVED
  const isManager = approved && activeMember && program.managers.length > 0
  const isOrgAdmin = approved && activeMember && hasOrgRole(membership.role, OrganizationRole.ADMIN)
  return {
    activeMember,
    isStaff: isManager || isOrgAdmin,
    isManager,
    isParticipant: program.participants.length > 0,
    application: program.applications[0] ?? null,
  }
}

/** Staff can preview anything; participants and applicants keep access; everyone else follows visibility. */
function canView(program: ViewerRow, shareToken: string | undefined) {
  const viewer = viewerOf(program)
  if (viewer.isStaff || viewer.isParticipant || viewer.application) return true
  const live =
    program.publishedAt !== null &&
    program.status !== ProgramStatus.ARCHIVED &&
    program.organization.verificationStatus === OrganizationVerificationStatus.APPROVED
  if (!live) return false
  switch (program.visibility) {
    case ProgramVisibility.PUBLIC:
      return true
    case ProgramVisibility.UNLISTED:
      return Boolean(shareToken && program.shareToken && shareToken === program.shareToken)
    case ProgramVisibility.ORGANIZATION:
      return viewer.activeMember
    default:
      return false
  }
}

function serializeDiscoverable(program: ViewerRow, options: { detail: boolean; fields?: Parameters<typeof serializeApplicationField>[0][] }) {
  const viewer = viewerOf(program)
  const application = viewer.application
  return {
    id: program.id,
    title: program.title,
    description: program.description,
    term: program.term,
    status: program.status.toLowerCase(),
    startDate: program.startDate,
    endDate: program.endDate,
    visibility: program.visibility.toLowerCase(),
    publishedAt: program.publishedAt,
    organization: { id: program.organization.id, name: program.organization.name, type: program.organization.type.toLowerCase() },
    recruitment: serializeRecruitment(program, program._count.participants),
    participantCount: program._count.participants,
    myStatus: {
      isParticipant: viewer.isParticipant,
      isManager: viewer.isStaff,
      application: application
        ? {
            id: application.id,
            status: application.status.toLowerCase(),
            createdAt: application.createdAt,
            submittedAt: application.submittedAt,
            reviewedAt: application.reviewedAt,
            reviewNote: application.status === ProgramApplicationStatus.REJECTED ? application.reviewNote : null,
            ...offerFields(application),
            ...(options.detail
              ? {
                  answers: Object.fromEntries(application.answers.map((answer) => [answer.fieldId, answer.value])),
                  files: application.files,
                }
              : {}),
          }
        : null,
    },
    ...(options.detail ? { applicationFields: options.fields?.map(serializeApplicationField) ?? [] } : {}),
  }
}

async function findViewable(programId: string, userId: string | null, shareToken: string | undefined) {
  const program = await prisma.program.findUnique({ where: { id: programId }, include: viewerInclude(userId) })
  if (!program || !canView(program, shareToken)) throw new HttpError(404, '프로그램을 찾을 수 없습니다.')
  return program
}

const activeFields = (programId: string) =>
  prisma.programApplicationField.findMany({ where: { programId, archivedAt: null }, orderBy: { position: 'asc' } })

/** Managers of the program, or the organization's admins when nobody is assigned. */
async function applicationReviewerIds(programId: string, organizationId: string) {
  const managers = await programStaffIds(prisma, programId)
  if (managers.length > 0) return managers
  const admins = await prisma.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } },
    select: { userId: true },
  })
  return admins.map((row) => row.userId)
}

const applicationInclude = {
  user: { select: { ...userBriefSelect, profile: { select: { headline: true } } } },
  reviewedBy: { select: { id: true, name: true } },
  answers: { select: { fieldId: true, label: true, value: true, field: { select: { position: true, type: true, archivedAt: true } } } },
  files: {
    select: { id: true, fieldId: true, originalName: true, sizeBytes: true, mimeType: true, field: { select: { label: true, position: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ProgramApplicationInclude

type ApplicationRow = Prisma.ProgramApplicationGetPayload<{ include: typeof applicationInclude }>

function serializeApplication(application: ApplicationRow) {
  const { profile, ...user } = application.user
  return {
    id: application.id,
    status: application.status.toLowerCase(),
    message: application.message,
    reviewNote: application.reviewNote,
    reviewedAt: application.reviewedAt,
    reviewedBy: application.reviewedBy,
    createdAt: application.createdAt,
    submittedAt: application.submittedAt,
    ...offerFields(application),
    user: { ...user, headline: profile?.headline ?? null },
    answers: [...application.answers]
      .sort((a, b) => a.field.position - b.field.position)
      .map((answer) => ({
        fieldId: answer.fieldId,
        label: answer.label,
        type: answer.field.type.toLowerCase(),
        archived: Boolean(answer.field.archivedAt),
        value: answer.value,
      })),
    files: [...application.files]
      .sort((a, b) => a.field.position - b.field.position)
      .map(({ field, ...file }) => ({ ...file, fieldLabel: field.label })),
  }
}

function assertCanApply(program: ViewerRow, state: RecruitmentState, options: { submitting: boolean }) {
  if (!takesApplications(program)) throw new HttpError(409, '지원서를 받지 않는 프로그램입니다.')
  if (state === 'draft') throw new HttpError(409, '아직 게시되지 않은 프로그램입니다.')
  if (state === 'closed' || state === 'selected') throw new HttpError(409, '모집이 마감되었습니다.')
  if (state === 'scheduled' && options.submitting) throw new HttpError(409, '아직 모집 기간이 아닙니다. 임시저장 후 모집이 시작되면 제출해 주세요.')
  const viewer = viewerOf(program)
  if (viewer.isParticipant) throw new HttpError(409, '이미 이 프로그램의 참여자입니다.')
  const existing = viewer.application
  if (existing?.status === ProgramApplicationStatus.PENDING || existing?.status === ProgramApplicationStatus.WAITLISTED) {
    throw new HttpError(409, '이미 제출한 지원서는 수정할 수 없습니다. 지원을 취소한 뒤 다시 제출해 주세요.')
  }
  if (existing?.status === ProgramApplicationStatus.ACCEPTED || existing?.status === ProgramApplicationStatus.CONFIRMED) {
    throw new HttpError(409, '이미 선발되었습니다.')
  }
  if (existing?.status === ProgramApplicationStatus.REJECTED || existing?.status === ProgramApplicationStatus.DECLINED) {
    throw new HttpError(409, '이번 모집에서는 다시 지원할 수 없습니다.')
  }
}

const offerFields = (application: { status: ProgramApplicationStatus; offerExpiresAt: Date | null; respondedAt: Date | null; waitlistedAt: Date | null }) => ({
  offerExpiresAt: application.status === ProgramApplicationStatus.ACCEPTED ? application.offerExpiresAt : null,
  respondedAt: application.respondedAt,
  waitlistedAt: application.status === ProgramApplicationStatus.WAITLISTED ? application.waitlistedAt : null,
  lapsed: application.status === ProgramApplicationStatus.DECLINED && !application.respondedAt,
})

export function registerProgramRecruitmentRoutes(router: ExpressRouter) {
  router.get('/discover', optionalAuthenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload | undefined
      const userId = authUser?.id ?? null
      const query = discoverProgramsSchema.parse(req.query)
      const search: Prisma.ProgramWhereInput[] = []
      if (query.q) {
        search.push({
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
            { targetAudience: { contains: query.q, mode: 'insensitive' } },
            { organization: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        })
      }
      if (query.category) search.push({ category: query.category.toUpperCase() as ProgramCategory })
      const rows = await prisma.program.findMany({
        where: { ...listableWhere(userId), ...(search.length ? { AND: search } : {}) },
        include: viewerInclude(userId),
        orderBy: { publishedAt: 'desc' },
        take: DISCOVER_POOL_SIZE,
      })

      const now = new Date()
      const ranked = rows
        .map((program) => ({ program, state: recruitmentState(program, now) }))
        .filter((row) => !query.openOnly || row.state === 'open')
        .sort((a, b) => {
          const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state]
          if (byState !== 0) return byState
          if (a.state === 'open' || a.state === 'scheduled') {
            const key = a.state === 'open' ? 'applyEndAt' : 'applyStartAt'
            return (a.program[key]?.getTime() ?? Infinity) - (b.program[key]?.getTime() ?? Infinity)
          }
          return (b.program.publishedAt?.getTime() ?? 0) - (a.program.publishedAt?.getTime() ?? 0)
        })

      const total = ranked.length
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
      const page = Math.min(query.page, totalPages)
      const slice = ranked.slice((page - 1) * query.pageSize, page * query.pageSize)
      res.status(200).json({
        programs: slice.map(({ program }) => serializeDiscoverable(program, { detail: false })),
        page,
        pageSize: query.pageSize,
        total,
        totalPages,
        openCount: rows.filter((program) => recruitmentState(program, now) === 'open').length,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/discover/:programId', optionalAuthenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload | undefined
      const { t } = programViewQuerySchema.parse(req.query)
      const program = await findViewable(String(req.params.programId), authUser?.id ?? null, t)
      const fields = takesApplications(program) ? await activeFields(program.id) : []
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json({ program: serializeDiscoverable(program, { detail: true, fields }) })
    } catch (error) {
      next(error)
    }
  })

  /** Programs the caller takes part in, whether or not they belong to the organization running them. */
  router.get('/participating', authenticate, async (_req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const rows = await prisma.programParticipant.findMany({
        where: {
          userId: authUser.id,
          program: {
            organization: { members: { none: { userId: authUser.id, status: OrganizationMemberStatus.SUSPENDED } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          program: {
            select: {
              id: true,
              title: true,
              term: true,
              status: true,
              startDate: true,
              endDate: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  members: { where: { userId: authUser.id, status: OrganizationMemberStatus.ACTIVE }, select: { id: true } },
                },
              },
            },
          },
        },
      })
      res.status(200).json({
        programs: rows.map(({ program, createdAt }) => ({
          id: program.id,
          title: program.title,
          term: program.term,
          status: program.status.toLowerCase(),
          startDate: program.startDate,
          endDate: program.endDate,
          joinedAt: createdAt,
          organization: { id: program.organization.id, name: program.organization.name },
          isOrgMember: program.organization.members.length > 0,
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/applications/me', authenticate, async (_req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const applications = await prisma.programApplication.findMany({
        where: { userId: authUser.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          program: {
            select: {
              id: true,
              title: true,
              organizationId: true,
              applyEndAt: true,
              organization: { select: { name: true } },
              participants: { where: { userId: authUser.id }, select: { id: true } },
            },
          },
        },
      })
      res.status(200).json({
        applications: applications.map((application) => ({
          id: application.id,
          status: application.status.toLowerCase(),
          message: application.message,
          reviewNote: application.status === ProgramApplicationStatus.REJECTED ? application.reviewNote : null,
          createdAt: application.createdAt,
          submittedAt: application.submittedAt,
          updatedAt: application.updatedAt,
          reviewedAt: application.reviewedAt,
          ...offerFields(application),
          program: {
            id: application.program.id,
            title: application.program.title,
            organizationId: application.program.organizationId,
            organizationName: application.program.organization.name,
            applyEndAt: application.program.applyEndAt,
            isParticipant: application.program.participants.length > 0,
          },
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  /** Saves a draft (submit=false) or submits the application (submit=true, required answers enforced). */
  router.put('/:programId/applications/me', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const input = saveApplicationSchema.parse(req.body ?? {})
      const program = await findViewable(String(req.params.programId), authUser.id, input.shareToken)
      const state = recruitmentState(program)
      assertCanApply(program, state, { submitting: input.submit })

      const existing = viewerOf(program).application
      const fields = await activeFields(program.id)
      const fileCounts = new Map<string, number>()
      for (const file of existing?.files ?? []) fileCounts.set(file.fieldId, (fileCounts.get(file.fieldId) ?? 0) + 1)
      const answers = normaliseAnswers(fields, input.answers, { requireComplete: input.submit, fileCounts })

      const now = new Date()
      const status = input.submit ? ProgramApplicationStatus.PENDING : ProgramApplicationStatus.DRAFT
      const application = await prisma.$transaction(async (tx) => {
        const saved = await tx.programApplication.upsert({
          where: { programId_userId: { programId: program.id, userId: authUser.id } },
          create: { programId: program.id, userId: authUser.id, status, submittedAt: input.submit ? now : null },
          update: {
            status,
            submittedAt: input.submit ? now : null,
            reviewNote: null,
            reviewedAt: null,
            reviewedById: null,
          },
        })
        await tx.programApplicationAnswer.deleteMany({
          where: { applicationId: saved.id, fieldId: { notIn: answers.map((answer) => answer.field.id) } },
        })
        for (const answer of answers) {
          await tx.programApplicationAnswer.upsert({
            where: { applicationId_fieldId: { applicationId: saved.id, fieldId: answer.field.id } },
            create: { applicationId: saved.id, fieldId: answer.field.id, label: answer.field.label, value: answer.value },
            update: { label: answer.field.label, value: answer.value },
          })
        }
        return saved
      })

      if (input.submit) {
        await notifyUsers(
          await applicationReviewerIds(program.id, program.organizationId),
          authUser.id,
          '새 프로그램 지원자가 있습니다',
          `${program.organization.name} · ${program.title}`,
          `/org/${program.organizationId}/programs/${program.id}?tab=applications`,
        )
      }
      res.status(200).json({ application: { id: application.id, status: application.status.toLowerCase() } })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:programId/applications/me/files', authenticate, limits.upload, acceptFile, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const file = req.file
      if (!file) throw new FileRejectedError('첨부할 파일을 선택해 주세요.')
      const fieldId = typeof req.body?.fieldId === 'string' ? req.body.fieldId : ''
      const shareToken = typeof req.body?.shareToken === 'string' ? req.body.shareToken : undefined
      const program = await findViewable(String(req.params.programId), authUser.id, shareToken)
      assertCanApply(program, recruitmentState(program), { submitting: false })

      const field = await prisma.programApplicationField.findFirst({ where: { id: fieldId, programId: program.id, archivedAt: null, type: 'FILE' } })
      if (!field) throw new HttpError(400, '파일을 첨부할 질문을 찾을 수 없습니다.')
      const existing = viewerOf(program).application
      if ((existing?.files.filter((item) => item.fieldId === field.id).length ?? 0) >= MAX_FILES_PER_FIELD) {
        throw new HttpError(400, `'${field.label}'에는 파일을 ${MAX_FILES_PER_FIELD}개까지 첨부할 수 있습니다.`)
      }
      const validated = await validateUpload(file)
      await assertOrgCapacity(program.organizationId, 'storageGb', bytesToGb(validated.sizeBytes))

      const application =
        existing ??
        (await prisma.programApplication.create({
          data: { programId: program.id, userId: authUser.id, status: ProgramApplicationStatus.DRAFT },
          select: { id: true },
        }))
      if (existing && existing.status === ProgramApplicationStatus.WITHDRAWN) {
        await prisma.programApplication.update({ where: { id: existing.id }, data: { status: ProgramApplicationStatus.DRAFT, submittedAt: null } })
      }
      const key = buildStorageKey(`program-applications/${application.id}`, validated.extension)
      await storage.put(key, validated.buffer, validated.mimeType)
      const stored = await prisma.programApplicationFile
        .create({
          data: {
            applicationId: application.id,
            fieldId: field.id,
            originalName: validated.originalName,
            storageKey: key,
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
            sha256: validated.sha256,
            scanStatus: validated.scanStatus,
          },
          select: { id: true, fieldId: true, originalName: true, sizeBytes: true, mimeType: true },
        })
        .catch(async (error) => {
          await storage.remove(key).catch(() => undefined)
          throw error
        })
      res.status(201).json({ file: stored })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:programId/applications/me/files/:fileId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const file = await prisma.programApplicationFile.findFirst({
        where: { id: String(req.params.fileId), application: { programId: String(req.params.programId), userId: authUser.id } },
        select: { id: true, storageKey: true, application: { select: { status: true } } },
      })
      if (!file) throw new HttpError(404, '파일을 찾을 수 없습니다.')
      if (file.application.status !== ProgramApplicationStatus.DRAFT && file.application.status !== ProgramApplicationStatus.WITHDRAWN) {
        throw new HttpError(409, '제출한 지원서의 파일은 삭제할 수 없습니다.')
      }
      await prisma.programApplicationFile.delete({ where: { id: file.id } })
      await storage.remove(file.storageKey).catch((error) => console.error('Application file removal failed:', error))
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  /** A submitted application is withdrawn (kept for the record); a draft is discarded with its files. */
  router.delete('/:programId/applications/me', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const application = await prisma.programApplication.findUnique({
        where: { programId_userId: { programId: String(req.params.programId), userId: authUser.id } },
        select: { id: true, status: true, files: { select: { storageKey: true } } },
      })
      if (application?.status === ProgramApplicationStatus.DRAFT) {
        await prisma.programApplication.delete({ where: { id: application.id } })
        await Promise.allSettled(application.files.map((file) => storage.remove(file.storageKey)))
        res.status(204).send()
        return
      }
      const withdrawable: ProgramApplicationStatus[] = [ProgramApplicationStatus.PENDING, ProgramApplicationStatus.WAITLISTED]
      if (!application || !withdrawable.includes(application.status)) throw new HttpError(409, '철회할 수 있는 지원 내역이 없습니다.')
      const withdrawn = await prisma.programApplication.updateMany({
        where: { id: application.id, status: { in: withdrawable } },
        data: { status: ProgramApplicationStatus.WITHDRAWN, waitlistedAt: null },
      })
      if (withdrawn.count === 0) throw new HttpError(409, '철회할 수 있는 지원 내역이 없습니다.')
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  /** The applicant accepts an offer: the seat it held becomes a participant registration. */
  router.post('/:programId/applications/me/confirm', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const programId = String(req.params.programId)
      const application = await prisma.programApplication.findUnique({
        where: { programId_userId: { programId, userId: authUser.id } },
        select: {
          id: true,
          status: true,
          offerExpiresAt: true,
          program: { select: { title: true, status: true, organizationId: true, organization: { select: { name: true } } } },
        },
      })
      if (!application || application.status !== ProgramApplicationStatus.ACCEPTED) throw new HttpError(409, '확정할 수 있는 합격 내역이 없습니다.')
      if (application.offerExpiresAt && application.offerExpiresAt <= new Date()) {
        throw new HttpError(409, '응답 기한이 지나 확정할 수 없습니다. 운영 기관에 문의해 주세요.')
      }
      assertProgramWritable(application.program.status)
      const { organizationId } = application.program
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: authUser.id } },
        select: { status: true },
      })
      if (membership?.status === OrganizationMemberStatus.SUSPENDED) throw new HttpError(403, '이 조직에서 이용이 정지된 계정입니다.')
      await assertParticipantSeats(organizationId, [authUser.id])

      await prisma.$transaction(async (tx) => {
        await lockProgramSeats(tx, programId)
        const confirmed = await tx.programApplication.updateMany({
          where: { id: application.id, ...liveOfferWhere(new Date()) },
          data: { status: ProgramApplicationStatus.CONFIRMED, respondedAt: new Date() },
        })
        if (confirmed.count === 0) throw new HttpError(409, '응답 기한이 지났거나 이미 처리된 합격입니다.')
        await tx.programParticipant.upsert({
          where: { programId_userId: { programId, userId: authUser.id } },
          create: { programId, userId: authUser.id },
          update: {},
        })
      })
      await audit(req, res, {
        action: 'program.application_confirm',
        organizationId,
        targetType: 'program',
        targetId: programId,
        metadata: { applicationId: application.id },
      })
      await notifyUsers(
        await applicationReviewerIds(programId, organizationId),
        authUser.id,
        '합격자가 참여를 확정했습니다',
        `${application.program.organization.name} · ${application.program.title}`,
        `/org/${organizationId}/programs/${programId}?tab=applications`,
      )
      res.status(200).json({ application: { id: application.id, status: 'confirmed' } })
    } catch (error) {
      next(error)
    }
  })

  /** The applicant turns an offer down; the seat goes to the next waitlisted applicant. */
  router.post('/:programId/applications/me/decline', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const programId = String(req.params.programId)
      const application = await prisma.programApplication.findUnique({
        where: { programId_userId: { programId, userId: authUser.id } },
        select: { id: true, program: { select: { title: true, organizationId: true, organization: { select: { name: true } } } } },
      })
      const declined = application
        ? await prisma.programApplication.updateMany({
            where: { id: application.id, status: ProgramApplicationStatus.ACCEPTED },
            data: { status: ProgramApplicationStatus.DECLINED, respondedAt: new Date() },
          })
        : { count: 0 }
      if (!application || declined.count === 0) throw new HttpError(409, '포기할 수 있는 합격 내역이 없습니다.')
      const { organizationId } = application.program
      await audit(req, res, {
        action: 'program.application_decline',
        organizationId,
        targetType: 'program',
        targetId: programId,
        metadata: { applicationId: application.id },
      })
      const refill = await refillProgram(programId, null)
      await notifyUsers(
        await applicationReviewerIds(programId, organizationId),
        authUser.id,
        refill.offered ? '합격자가 참여를 포기해 대기자에게 합격을 제안했습니다' : '합격자가 참여를 포기했습니다',
        `${application.program.organization.name} · ${application.program.title}`,
        `/org/${organizationId}/programs/${programId}?tab=applications`,
      )
      res.status(200).json({ application: { id: application.id, status: 'declined' }, refill })
    } catch (error) {
      next(error)
    }
  })

  /** Temporary URL for an application attachment: only the applicant and the program's staff. */
  router.get('/application-files/:fileId/url', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const file = await prisma.programApplicationFile.findUnique({
        where: { id: String(req.params.fileId) },
        select: {
          id: true,
          storageKey: true,
          mimeType: true,
          originalName: true,
          application: { select: { id: true, userId: true, programId: true, status: true } },
        },
      })
      if (!file) throw new HttpError(404, '파일을 찾을 수 없습니다.')
      const isApplicant = file.application.userId === authUser.id
      if (!isApplicant) {
        if (file.application.status === ProgramApplicationStatus.DRAFT) throw new HttpError(404, '파일을 찾을 수 없습니다.')
        const access = await requireProgramAccess(file.application.programId, authUser.id, 'staff').catch(() => {
          throw new HttpError(404, '파일을 찾을 수 없습니다.')
        })
        await audit(req, res, {
          action: 'program.application_file_view',
          organizationId: access.organization.id,
          targetType: 'program_application',
          targetId: file.application.id,
          metadata: { fileId: file.id },
        })
      }
      const download = req.query.download === '1'
      const signed = await storage.signedUrl(file.storageKey, { contentType: file.mimeType, fileName: file.originalName, inline: !download })
      res.setHeader('Cache-Control', 'no-store')
      res.status(200).json(signed)
    } catch (error) {
      next(error)
    }
  })

  router.get('/:programId/applications', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
      const query = programApplicationQuerySchema.parse(req.query)
      const submitted = { status: { not: ProgramApplicationStatus.DRAFT } } satisfies Prisma.ProgramApplicationWhereInput
      const now = new Date()
      const [applications, counts, participantCount, openOffers] = await Promise.all([
        prisma.programApplication.findMany({
          where: {
            programId: access.program.id,
            ...(query.status === 'all' ? submitted : { status: query.status.toUpperCase() as ProgramApplicationStatus }),
          },
          include: applicationInclude,
          orderBy:
            query.status === 'waitlisted'
              ? [{ waitlistedAt: 'asc' }, { submittedAt: 'asc' }]
              : [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
          take: 300,
        }),
        prisma.programApplication.groupBy({ by: ['status'], where: { programId: access.program.id, ...submitted }, _count: { _all: true } }),
        prisma.programParticipant.count({ where: { programId: access.program.id } }),
        prisma.programApplication.count({ where: { programId: access.program.id, ...liveOfferWhere(now) } }),
      ])
      res.status(200).json({
        applications: applications.map(serializeApplication),
        counts: Object.fromEntries(counts.map((row) => [row.status.toLowerCase(), row._count._all])),
        capacity: access.program.capacity,
        participantCount,
        openOffers,
      })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:programId/applications/:applicationId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
      assertProgramWritable(access.program.status)
      const input = decideProgramApplicationSchema.parse(req.body)
      const application = await prisma.programApplication.findFirst({
        where: { id: String(req.params.applicationId), programId: access.program.id },
      })
      if (!application || application.status === ProgramApplicationStatus.DRAFT) throw new HttpError(404, '지원서를 찾을 수 없습니다.')
      const undecided: ProgramApplicationStatus[] = [ProgramApplicationStatus.PENDING, ProgramApplicationStatus.WAITLISTED]
      if (!undecided.includes(application.status)) throw new HttpError(409, '이미 처리된 지원서입니다.')
      if (input.decision === 'waitlist' && application.status === ProgramApplicationStatus.WAITLISTED) {
        throw new HttpError(409, '이미 대기자로 등록된 지원서입니다.')
      }

      const organizationId = access.organization.id
      const label = `${access.organization.name} · ${access.program.title}`
      const now = new Date()
      const claim = async (tx: Prisma.TransactionClient, data: Prisma.ProgramApplicationUpdateManyMutationInput) => {
        const claimed = await tx.programApplication.updateMany({
          where: { id: application.id, status: { in: undecided } },
          data: { reviewNote: input.note ?? null, reviewedById: authUser.id, reviewedAt: now, ...data },
        })
        if (claimed.count === 0) throw new HttpError(409, '이미 처리된 지원서입니다.')
      }
      const reload = (tx: Prisma.TransactionClient) => tx.programApplication.findUniqueOrThrow({ where: { id: application.id }, include: applicationInclude })
      const record = (action: string, metadata: Record<string, unknown> = {}) =>
        audit(req, res, {
          action,
          organizationId,
          targetType: 'program',
          targetId: access.program.id,
          metadata: { applicationId: application.id, userId: application.userId, ...metadata },
        })

      if (input.decision === 'reject' || input.decision === 'waitlist') {
        const waitlist = input.decision === 'waitlist'
        const updated = await prisma.$transaction(async (tx) => {
          await claim(tx, waitlist ? { status: ProgramApplicationStatus.WAITLISTED, waitlistedAt: now } : { status: ProgramApplicationStatus.REJECTED, waitlistedAt: null })
          return reload(tx)
        })
        await record(waitlist ? 'program.application_waitlist' : 'program.application_reject')
        await notifyUsers(
          [application.userId],
          authUser.id,
          waitlist ? '프로그램 대기자로 등록되었습니다' : '프로그램 지원 결과가 등록되었습니다',
          waitlist ? `${label} · 빈자리가 생기면 순서대로 합격을 제안합니다` : label,
          '/opportunities?tab=my',
        )
        res.status(200).json({ application: serializeApplication(updated) })
        return
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: application.userId } },
        select: { status: true },
      })
      if (membership?.status === OrganizationMemberStatus.SUSPENDED) {
        throw new HttpError(409, '조직에서 이용이 정지된 사용자는 선발할 수 없습니다.')
      }
      await assertParticipantSeats(organizationId, [application.userId])

      // An offer holds a seat until the applicant confirms (→ participant) or declines / lets it lapse (→ next waitlisted).
      const offerExpiresAt = offerDeadline(now, input.responseDays)
      const updated = await prisma.$transaction(async (tx) => {
        await lockProgramSeats(tx, access.program.id)
        const { capacity } = await tx.program.findUniqueOrThrow({ where: { id: access.program.id }, select: { capacity: true } })
        if (capacity && (await heldSeats(tx, access.program.id, now)) >= capacity) {
          throw new HttpError(409, `정원(${capacity}명)이 모두 찼습니다(참여자와 응답 대기 중인 합격자 포함). 대기자로 두거나 정원을 늘려 주세요.`)
        }
        await claim(tx, { status: ProgramApplicationStatus.ACCEPTED, offerExpiresAt, waitlistedAt: null })
        return reload(tx)
      })
      await record('program.application_accept', { offerExpiresAt: offerExpiresAt.toISOString() })
      await notifyUsers(
        [application.userId],
        authUser.id,
        '프로그램에 합격했습니다',
        `${label} · ${offerExpiresAt.toLocaleDateString('ko-KR')}까지 참여 여부를 알려 주세요`,
        '/opportunities?tab=my',
      )
      res.status(200).json({ application: serializeApplication(updated) })
    } catch (error) {
      next(error)
    }
  })

  /** Lapses expired offers and offers the free seats to waitlisted applicants in order. */
  router.post('/:programId/applications/refill', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
      assertProgramWritable(access.program.status)
      const result = await refillProgram(access.program.id, authUser.id)
      await audit(req, res, {
        action: 'program.application_refill',
        organizationId: access.organization.id,
        targetType: 'program',
        targetId: access.program.id,
        metadata: result,
      })
      res.status(200).json(result)
    } catch (error) {
      next(error)
    }
  })
}
