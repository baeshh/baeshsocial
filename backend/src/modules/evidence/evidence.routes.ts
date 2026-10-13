import {
  EvidenceCategory,
  EvidenceReviewAction,
  EvidenceStatus,
  ProgramStatus,
  ProjectActivityType,
} from '@prisma/client'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { limits } from '../../middlewares/rateLimit.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity, bytesToGb } from '../../services/billing/entitlements.js'
import { UPLOAD_LIMITS, validateUpload, type ValidatedFile } from '../../services/storage/fileValidation.js'
import {
  buildStorageKey,
  localDownloadHeaders,
  readLocalFile,
  storage,
  verifyLocalFileToken,
} from '../../services/storage/storage.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { getProgramAccess } from '../../utils/programAccess.js'
import { issueVerifiedRecord, revokeVerifiedRecord } from '../../services/verification/verifiedRecords.js'
import {
  createEvidenceSchema,
  reviewEvidenceSchema,
  revokeEvidenceSchema,
  updateEvidenceSchema,
} from '../../validators/program.validator.js'
import { evidenceInclude, serializeEvidence } from '../programs/program.serializers.js'

export const projectEvidenceRouter = Router({ mergeParams: true })
export const evidenceRouter = Router()
export const evidenceFilesRouter = Router()
export const localFilesRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.maxFileBytes, files: UPLOAD_LIMITS.maxFilesPerRequest, fields: 20 },
})

const acceptFiles: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    next()
    return
  }
  upload.array('files', UPLOAD_LIMITS.maxFilesPerRequest)(req, res, next)
}

const EDITABLE_STATUSES: EvidenceStatus[] = [EvidenceStatus.DRAFT, EvidenceStatus.REJECTED]

const toCategory = (value: string) => value.toUpperCase() as EvidenceCategory

function uploadedFiles(req: Express.Request) {
  return (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[]
}

/* ------------------------------ Access ------------------------------ */

async function loadProjectContext(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      programId: true,
      program: { select: { id: true, title: true, status: true } },
      members: { where: { userId }, select: { role: true, projectRole: { select: { slug: true } } } },
    },
  })
  if (!project) throw new HttpError(404, '프로젝트를 찾을 수 없습니다.')
  if (!project.programId || !project.program) {
    throw new HttpError(400, '활동 증빙은 기관 프로그램 프로젝트에서만 사용할 수 있습니다.')
  }
  const access = await getProgramAccess(project.programId, userId)
  const isTeamMember = project.members.length > 0
  if (!access?.membership || (!access.isStaff && !isTeamMember)) {
    throw new HttpError(404, '프로젝트를 찾을 수 없습니다.')
  }
  return { project, program: project.program, access, isTeamMember, isStaff: access.isStaff }
}

/**
 * Drafts are private to their author; submitted/reviewed evidence is visible to the author's team
 * and program staff. Everyone else gets 404.
 */
async function loadEvidenceContext(evidenceId: string, userId: string) {
  const evidence = await prisma.projectEvidence.findUnique({ where: { id: evidenceId }, include: evidenceInclude })
  if (!evidence) throw new HttpError(404, '증빙을 찾을 수 없습니다.')
  const context = await loadProjectContext(evidence.projectId, userId).catch(() => {
    throw new HttpError(404, '증빙을 찾을 수 없습니다.')
  })
  const isAuthor = evidence.authorId === userId
  const visible = isAuthor || (evidence.status !== EvidenceStatus.DRAFT && (context.isStaff || context.isTeamMember))
  if (!visible) throw new HttpError(404, '증빙을 찾을 수 없습니다.')
  return { ...context, evidence, isAuthor }
}

function assertAuthorCanEdit(context: { isAuthor: boolean; evidence: { status: EvidenceStatus } }) {
  if (!context.isAuthor) throw new HttpError(403, '작성자만 수정할 수 있습니다.')
  if (!EDITABLE_STATUSES.includes(context.evidence.status)) {
    throw new HttpError(409, '제출되었거나 승인된 증빙은 수정할 수 없습니다.')
  }
}

function assertProgramAcceptsSubmissions(status: ProgramStatus) {
  if (status !== ProgramStatus.ACTIVE) {
    throw new HttpError(409, '진행 중인 프로그램에서만 증빙을 작성·제출할 수 있습니다.')
  }
}

/* ------------------------------ Storage ----------------------------- */

async function storeFiles(evidenceId: string, uploaderId: string, files: ValidatedFile[]) {
  const stored: string[] = []
  try {
    const rows = []
    for (const file of files) {
      const key = buildStorageKey(`evidence/${evidenceId}`, file.extension)
      await storage.put(key, file.buffer, file.mimeType)
      stored.push(key)
      rows.push({
        evidenceId,
        uploaderId,
        originalName: file.originalName,
        storageKey: key,
        mimeType: file.mimeType,
        kind: file.kind,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        scanStatus: file.scanStatus,
      })
    }
    await prisma.evidenceFile.createMany({ data: rows })
  } catch (error) {
    await Promise.allSettled(stored.map((key) => storage.remove(key)))
    throw error
  }
}

/** Uploads count against the organization's storage allowance. */
async function assertStorageFor(organizationId: string, files: Express.Multer.File[]) {
  const bytes = files.reduce((sum, file) => sum + file.size, 0)
  if (bytes > 0) await assertOrgCapacity(organizationId, 'storageGb', bytesToGb(bytes))
}

async function validateAll(files: Express.Multer.File[]) {
  const validated: ValidatedFile[] = []
  for (const file of files) validated.push(await validateUpload(file))
  return validated
}

async function notify(userIds: string[], actorId: string, title: string, body: string, link: string) {
  const recipients = [...new Set(userIds)].filter((id) => id !== actorId)
  if (recipients.length === 0) return
  try {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({ userId, actorId, title, body, link, type: 'SYSTEM' as const })),
    })
  } catch (error) {
    console.error('Evidence notification failed:', error)
  }
}

async function reloadEvidence(evidenceId: string) {
  const evidence = await prisma.projectEvidence.findUniqueOrThrow({ where: { id: evidenceId }, include: evidenceInclude })
  return serializeEvidence(evidence)
}

/* ------------------------------------------------------------------ */
/* /api/projects/:projectId/evidence                                   */
/* ------------------------------------------------------------------ */

projectEvidenceRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { project, isStaff, isTeamMember, program } = await loadProjectContext(
      String(req.params.projectId),
      authUser.id,
    )
    const evidence = await prisma.projectEvidence.findMany({
      where: {
        projectId: project.id,
        OR: [
          { authorId: authUser.id },
          ...(isStaff || isTeamMember ? [{ status: { not: EvidenceStatus.DRAFT } }] : []),
        ],
      },
      include: evidenceInclude,
      orderBy: [{ activityDate: 'desc' }, { createdAt: 'desc' }],
    })
    res.status(200).json({
      evidence: evidence.map(serializeEvidence),
      program: { id: program.id, title: program.title, status: program.status.toLowerCase() },
      canCreate: isTeamMember && program.status === ProgramStatus.ACTIVE,
      canReview: isStaff,
      limits: {
        maxFilesPerEvidence: UPLOAD_LIMITS.maxFilesPerEvidence,
        image: '15MB · JPG/PNG/WEBP',
        video: '100MB · MP4/MOV/WEBM',
        pdf: '25MB · PDF',
      },
    })
  } catch (error) {
    next(error)
  }
})

projectEvidenceRouter.post('/', authenticate, limits.upload, acceptFiles, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { project, program, isTeamMember, access } = await loadProjectContext(String(req.params.projectId), authUser.id)
    if (!isTeamMember) throw new HttpError(403, '팀원만 활동 증빙을 작성할 수 있습니다.')
    assertProgramAcceptsSubmissions(program.status)

    const input = createEvidenceSchema.parse(req.body)
    const files = uploadedFiles(req)
    if (files.length > UPLOAD_LIMITS.maxFilesPerEvidence) {
      throw new HttpError(400, `파일은 최대 ${UPLOAD_LIMITS.maxFilesPerEvidence}개까지 올릴 수 있습니다.`)
    }
    await assertStorageFor(access.organization.id, files)
    const validated = await validateAll(files)

    const evidence = await prisma.projectEvidence.create({
      data: {
        projectId: project.id,
        authorId: authUser.id,
        title: input.title,
        description: input.description ?? null,
        category: toCategory(input.category),
        activityDate: input.activityDate,
      },
    })
    try {
      if (validated.length) await storeFiles(evidence.id, authUser.id, validated)
    } catch (error) {
      await prisma.projectEvidence.delete({ where: { id: evidence.id } })
      throw error
    }

    res.status(201).json({ evidence: await reloadEvidence(evidence.id) })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------------------------------------------ */
/* /api/evidence/:evidenceId                                           */
/* ------------------------------------------------------------------ */

evidenceRouter.get('/:evidenceId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { evidence } = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    res.status(200).json({ evidence: serializeEvidence(evidence) })
  } catch (error) {
    next(error)
  }
})

evidenceRouter.patch('/:evidenceId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    assertAuthorCanEdit(context)
    const input = updateEvidenceSchema.parse(req.body)
    await prisma.projectEvidence.update({
      where: { id: context.evidence.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: toCategory(input.category) } : {}),
        ...(input.activityDate !== undefined ? { activityDate: input.activityDate } : {}),
      },
    })
    res.status(200).json({ evidence: await reloadEvidence(context.evidence.id) })
  } catch (error) {
    next(error)
  }
})

evidenceRouter.delete('/:evidenceId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    if (!context.isAuthor) throw new HttpError(403, '작성자만 삭제할 수 있습니다.')
    if (context.evidence.status !== EvidenceStatus.DRAFT) {
      throw new HttpError(409, '제출 이력이 있는 증빙은 삭제할 수 없습니다.')
    }
    const keys = context.evidence.files.map((file) => file.storageKey)
    await prisma.projectEvidence.delete({ where: { id: context.evidence.id } })
    await Promise.allSettled(keys.map((key) => storage.remove(key)))
    await audit(req, res, {
      action: 'evidence.delete',
      organizationId: context.access.organization.id,
      targetType: 'evidence',
      targetId: context.evidence.id,
      metadata: { files: keys.length },
    })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

evidenceRouter.post('/:evidenceId/files', authenticate, limits.upload, acceptFiles, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    assertAuthorCanEdit(context)
    assertProgramAcceptsSubmissions(context.program.status)
    const files = uploadedFiles(req)
    if (files.length === 0) throw new HttpError(400, '업로드할 파일을 선택해 주세요.')
    if (context.evidence.files.length + files.length > UPLOAD_LIMITS.maxFilesPerEvidence) {
      throw new HttpError(400, `증빙 하나에 파일은 최대 ${UPLOAD_LIMITS.maxFilesPerEvidence}개까지 첨부할 수 있습니다.`)
    }
    await assertStorageFor(context.access.organization.id, files)
    await storeFiles(context.evidence.id, authUser.id, await validateAll(files))
    res.status(201).json({ evidence: await reloadEvidence(context.evidence.id) })
  } catch (error) {
    next(error)
  }
})

evidenceRouter.delete('/:evidenceId/files/:fileId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    assertAuthorCanEdit(context)
    const file = context.evidence.files.find((item) => item.id === String(req.params.fileId))
    if (!file) throw new HttpError(404, '파일을 찾을 수 없습니다.')
    await prisma.evidenceFile.delete({ where: { id: file.id } })
    await storage.remove(file.storageKey).catch((error) => console.error('Evidence file removal failed:', error))
    await audit(req, res, {
      action: 'evidence.file_delete',
      organizationId: context.access.organization.id,
      targetType: 'evidence_file',
      targetId: file.id,
      metadata: { evidenceId: context.evidence.id },
    })
    res.status(200).json({ evidence: await reloadEvidence(context.evidence.id) })
  } catch (error) {
    next(error)
  }
})

evidenceRouter.post('/:evidenceId/submit', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    assertAuthorCanEdit(context)
    assertProgramAcceptsSubmissions(context.program.status)
    if (!context.isTeamMember) throw new HttpError(403, '현재 팀원만 제출할 수 있습니다.')
    if (context.evidence.files.length === 0) {
      throw new HttpError(400, '사진·영상·PDF 중 최소 1개의 파일을 첨부해야 제출할 수 있습니다.')
    }

    const isResubmission = context.evidence.status === EvidenceStatus.REJECTED
    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectEvidence.updateMany({
        where: { id: context.evidence.id, status: context.evidence.status },
        data: {
          status: EvidenceStatus.SUBMITTED,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
        },
      })
      if (updated.count === 0) throw new HttpError(409, '증빙 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
      await tx.evidenceReview.create({
        data: {
          evidenceId: context.evidence.id,
          actorId: authUser.id,
          action: isResubmission ? EvidenceReviewAction.RESUBMITTED : EvidenceReviewAction.SUBMITTED,
        },
      })
    })

    const staff = await prisma.programManager.findMany({
      where: { programId: context.program.id },
      select: { userId: true },
    })
    await notify(
      staff.map((row) => row.userId),
      authUser.id,
      isResubmission ? '활동 증빙이 재제출되었습니다' : '새 활동 증빙이 제출되었습니다',
      `${context.program.title} · ${context.project.title} · ${context.evidence.title}`,
      `/org/${context.access.organization.id}/programs/${context.program.id}?tab=review`,
    )

    res.status(200).json({ evidence: await reloadEvidence(context.evidence.id) })
  } catch (error) {
    next(error)
  }
})

evidenceRouter.post('/:evidenceId/review', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    if (!context.isStaff) throw new HttpError(403, '프로그램 담당자만 검토할 수 있습니다.')
    if (context.isAuthor) throw new HttpError(403, '본인이 작성한 증빙은 검토할 수 없습니다.')
    if (context.program.status === ProgramStatus.ARCHIVED) {
      throw new HttpError(409, '보관된 프로그램의 증빙은 검토할 수 없습니다.')
    }
    if (context.evidence.status !== EvidenceStatus.SUBMITTED) {
      throw new HttpError(409, '제출 상태의 증빙만 검토할 수 있습니다.')
    }

    const input = reviewEvidenceSchema.parse(req.body)
    const approve = input.decision === 'approve'
    const { evidence, project, program, access } = context

    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectEvidence.updateMany({
        where: { id: evidence.id, status: EvidenceStatus.SUBMITTED },
        data: {
          status: approve ? EvidenceStatus.APPROVED : EvidenceStatus.REJECTED,
          reviewedById: authUser.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
        },
      })
      if (updated.count === 0) throw new HttpError(409, '이미 검토된 증빙입니다.')

      await tx.evidenceReview.create({
        data: {
          evidenceId: evidence.id,
          actorId: authUser.id,
          action: approve ? EvidenceReviewAction.APPROVED : EvidenceReviewAction.REJECTED,
          note: input.note ?? null,
        },
      })

      if (approve) {
        await issueVerifiedRecord(tx, { evidenceId: evidence.id, approverId: authUser.id, approvedAt: new Date() })
        await tx.projectActivity.create({
          data: {
            projectId: project.id,
            userId: authUser.id,
            type: ProjectActivityType.MILESTONE,
            title: 'Evidence approved',
            description: `'${evidence.title}' 활동 증빙이 기관 검토를 통과했습니다.`,
          },
        })
      }
    })

    await audit(req, res, {
      action: approve ? 'evidence.approve' : 'evidence.reject',
      organizationId: access.organization.id,
      targetType: 'evidence',
      targetId: evidence.id,
      metadata: { programId: program.id, projectId: project.id, authorId: evidence.authorId },
    })
    await notify(
      [evidence.authorId],
      authUser.id,
      approve ? '활동 증빙이 승인되었습니다' : '활동 증빙이 반려되었습니다',
      approve
        ? `${program.title} · ${evidence.title} — 프로필에 검증 기록으로 추가되었습니다.`
        : `${evidence.title} — 사유: ${input.note}`,
      `/projects/${project.id}?tab=evidence`,
    )

    res.status(200).json({ evidence: await reloadEvidence(evidence.id) })
  } catch (error) {
    next(error)
  }
})

/**
 * Withdraws an approval. The verified record turns REVOKED (kept for audit) and the evidence goes
 * back to REJECTED so the author can correct and resubmit; a later approval reissues the record.
 */
evidenceRouter.post('/:evidenceId/revoke', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const context = await loadEvidenceContext(String(req.params.evidenceId), authUser.id)
    if (!context.isStaff) throw new HttpError(403, '프로그램 담당자만 승인을 취소할 수 있습니다.')
    if (context.evidence.status !== EvidenceStatus.APPROVED) {
      throw new HttpError(409, '승인된 증빙만 승인 취소할 수 있습니다.')
    }
    const { reason } = revokeEvidenceSchema.parse(req.body)
    const { evidence, project, program } = context

    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectEvidence.updateMany({
        where: { id: evidence.id, status: EvidenceStatus.APPROVED },
        data: {
          status: EvidenceStatus.REJECTED,
          reviewedById: authUser.id,
          reviewedAt: new Date(),
          reviewNote: `승인 취소: ${reason}`,
        },
      })
      if (updated.count === 0) throw new HttpError(409, '증빙 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.')
      await tx.evidenceReview.create({
        data: { evidenceId: evidence.id, actorId: authUser.id, action: EvidenceReviewAction.REVOKED, note: reason },
      })
      await revokeVerifiedRecord(tx, { evidenceId: evidence.id, actorId: authUser.id, reason })
    })

    await audit(req, res, {
      action: 'evidence.revoke',
      organizationId: context.access.organization.id,
      targetType: 'evidence',
      targetId: evidence.id,
      metadata: { reason, programId: program.id, authorId: evidence.authorId },
    })
    await notify(
      [evidence.authorId],
      authUser.id,
      '활동 증빙 승인이 취소되었습니다',
      `${program.title} · ${evidence.title} — 사유: ${reason}`,
      `/projects/${project.id}?tab=evidence`,
    )
    res.status(200).json({ evidence: await reloadEvidence(evidence.id) })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------------------------------------------ */
/* Temporary file URLs                                                 */
/* ------------------------------------------------------------------ */

evidenceFilesRouter.get('/:fileId/url', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const file = await prisma.evidenceFile.findUnique({
      where: { id: String(req.params.fileId) },
      select: { evidenceId: true, storageKey: true, mimeType: true, originalName: true },
    })
    if (!file) throw new HttpError(404, '파일을 찾을 수 없습니다.')
    const context = await loadEvidenceContext(file.evidenceId, authUser.id).catch(() => {
      throw new HttpError(404, '파일을 찾을 수 없습니다.')
    })
    const download = req.query.download === '1'
    if (download) {
      await audit(req, res, {
        action: 'evidence.file_download',
        organizationId: context.access.organization.id,
        targetType: 'evidence_file',
        targetId: String(req.params.fileId),
        metadata: { evidenceId: file.evidenceId },
      })
    }
    const signed = await storage.signedUrl(file.storageKey, {
      contentType: file.mimeType,
      fileName: file.originalName,
      inline: !download,
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(signed)
  } catch (error) {
    next(error)
  }
})

localFilesRouter.get('/local/:token', async (req, res, next) => {
  try {
    const payload = verifyLocalFileToken(String(req.params.token))
    if (!payload) {
      res.status(403).json({ message: '링크가 만료되었거나 올바르지 않습니다.' })
      return
    }
    const body = await readLocalFile(payload.k).catch(() => null)
    if (!body) {
      res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
      return
    }
    res.set(localDownloadHeaders(payload)).status(200).send(body)
  } catch (error) {
    next(error)
  }
})
