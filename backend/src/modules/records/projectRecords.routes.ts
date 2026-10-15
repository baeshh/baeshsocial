import { OrganizationRole, ProgramProjectRecordStatus, RetentionBasis, type Prisma } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { correctRecord, redactParticipant, type RecordSnapshot } from '../../services/records/programProjectRecords.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'
import {
  projectRecordQuerySchema,
  recordCorrectionSchema,
  recordRedactionSchema,
  retentionPolicySchema,
} from '../../validators/records.validator.js'

/**
 * The organization's official records of its program projects. Only staff of an approved organization:
 * owners and admins see every record, managers only those of programs assigned to them. Nothing here
 * feeds talent search, whatever kind of organization ran the program.
 */
export const organizationProjectRecordsRouter = Router({ mergeParams: true })

const staffOnly = requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true })
const adminOnly = requireOrgAccess({ minRole: OrganizationRole.ADMIN, requireApproved: true })

async function recordScope(res: { locals: Record<string, unknown> }): Promise<{ where: Prisma.ProgramProjectRecordWhereInput; isOrgAdmin: boolean }> {
  const { organization, membership } = res.locals.orgAccess as OrgAccess
  if (hasOrgRole(membership.role, OrganizationRole.ADMIN)) return { where: { organizationId: organization.id }, isOrgAdmin: true }
  const managed = await prisma.programManager.findMany({
    where: { userId: membership.userId, program: { organizationId: organization.id } },
    select: { programId: true },
  })
  return { where: { organizationId: organization.id, programId: { in: managed.map((row) => row.programId) } }, isOrgAdmin: false }
}

async function findScopedRecord(res: { locals: Record<string, unknown> }, recordId: string) {
  const { where } = await recordScope(res)
  const record = await prisma.programProjectRecord.findFirst({ where: { AND: [where, { id: recordId }] } })
  if (!record) throw new HttpError(404, '기록을 찾을 수 없습니다.')
  return record
}

type RecordRow = Prisma.ProgramProjectRecordGetPayload<{ include: { retentionPolicy: true } }>

function serializeSummary(record: RecordRow) {
  const snapshot = record.snapshot as unknown as RecordSnapshot
  return {
    id: record.id,
    programId: record.programId,
    projectId: record.projectId,
    organizationName: record.organizationName,
    programTitle: record.programTitle,
    programTerm: record.programTerm,
    projectTitle: record.projectTitle,
    status: record.status.toLowerCase(),
    version: record.version,
    contentHash: record.contentHash,
    capturedAt: record.capturedAt,
    finalizedAt: record.finalizedAt,
    retainUntil: record.retainUntil,
    retentionPolicy: record.retentionPolicy ? serializePolicy(record.retentionPolicy) : null,
    sourceDeleted: { program: record.programId === null, project: record.projectId === null },
    participants: snapshot.participants.length,
    verification: snapshot.verification?.status.toLowerCase() ?? null,
  }
}

function serializePolicy(policy: Prisma.RecordRetentionPolicyGetPayload<object>) {
  return {
    id: policy.id,
    basis: policy.basis.toLowerCase(),
    reference: policy.reference,
    retentionMonths: policy.retentionMonths,
    createdAt: policy.createdAt,
    retiredAt: policy.retiredAt,
  }
}

organizationProjectRecordsRouter.get('/', authenticate, staffOnly, async (req, res, next) => {
  try {
    const query = projectRecordQuerySchema.parse(req.query)
    const { where } = await recordScope(res)
    const rows = await prisma.programProjectRecord.findMany({
      where: {
        AND: [
          where,
          query.status === 'all' ? {} : { status: query.status.toUpperCase() as ProgramProjectRecordStatus },
          query.programId ? { programId: query.programId } : {},
        ],
      },
      include: { retentionPolicy: true },
      orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })
    const page = rows.slice(0, query.limit)
    res.status(200).json({ records: page.map(serializeSummary), nextCursor: rows.length > query.limit ? page[page.length - 1].id : null })
  } catch (error) {
    next(error)
  }
})

organizationProjectRecordsRouter.get('/retention-policy', authenticate, staffOnly, async (_req, res, next) => {
  try {
    const { organization } = res.locals.orgAccess as OrgAccess
    const policies = await prisma.recordRetentionPolicy.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const current = policies.find((policy) => policy.retiredAt === null) ?? null
    res.status(200).json({ current: current ? serializePolicy(current) : null, history: policies.map(serializePolicy) })
  } catch (error) {
    next(error)
  }
})

/** Replaces the active policy; the previous one is retired, not edited. Applies to records finalized from now on. */
organizationProjectRecordsRouter.put('/retention-policy', authenticate, adminOnly, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization } = res.locals.orgAccess as OrgAccess
    const input = retentionPolicySchema.parse(req.body)
    const policy = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organization.id} FOR UPDATE`
      await tx.recordRetentionPolicy.updateMany({
        where: { organizationId: organization.id, retiredAt: null },
        data: { retiredAt: new Date() },
      })
      return tx.recordRetentionPolicy.create({
        data: {
          organizationId: organization.id,
          basis: input.basis.toUpperCase() as RetentionBasis,
          reference: input.reference,
          retentionMonths: input.retentionMonths,
          createdById: authUser.id,
        },
      })
    })
    await audit(req, res, {
      action: 'records.retention_policy_set',
      organizationId: organization.id,
      targetType: 'retention_policy',
      targetId: policy.id,
      metadata: { basis: policy.basis, retentionMonths: policy.retentionMonths },
    })
    res.status(200).json({ policy: serializePolicy(policy) })
  } catch (error) {
    next(error)
  }
})

organizationProjectRecordsRouter.get('/:recordId', authenticate, staffOnly, async (req, res, next) => {
  try {
    const found = await findScopedRecord(res, String(req.params.recordId))
    const record = await prisma.programProjectRecord.findUniqueOrThrow({
      where: { id: found.id },
      include: {
        retentionPolicy: true,
        events: {
          orderBy: { version: 'asc' },
          select: {
            version: true,
            action: true,
            trigger: true,
            reason: true,
            contentHash: true,
            previousHash: true,
            createdAt: true,
            actor: { select: { id: true, name: true } },
          },
        },
      },
    })
    res.status(200).json({
      record: {
        ...serializeSummary(record),
        snapshot: record.snapshot,
        events: record.events.map((event) => ({ ...event, action: event.action.toLowerCase() })),
      },
    })
  } catch (error) {
    next(error)
  }
})

/** One earlier version exactly as it was recorded. */
organizationProjectRecordsRouter.get('/:recordId/versions/:version', authenticate, staffOnly, async (req, res, next) => {
  try {
    const record = await findScopedRecord(res, String(req.params.recordId))
    const version = Number(req.params.version)
    if (!Number.isInteger(version) || version < 1) throw new HttpError(400, '버전이 올바르지 않습니다.')
    const event = await prisma.programProjectRecordEvent.findUnique({
      where: { recordId_version: { recordId: record.id, version } },
      include: { actor: { select: { id: true, name: true } } },
    })
    if (!event) throw new HttpError(404, '해당 버전이 없습니다.')
    res.status(200).json({ version: { ...event, action: event.action.toLowerCase() } })
  } catch (error) {
    next(error)
  }
})

organizationProjectRecordsRouter.post('/:recordId/corrections', authenticate, staffOnly, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization } = res.locals.orgAccess as OrgAccess
    const record = await findScopedRecord(res, String(req.params.recordId))
    const input = recordCorrectionSchema.parse(req.body)
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id }, select: { id: true, name: true } })
    const updated = await correctRecord(record.id, { actor, reason: input.reason, note: input.note })
    await audit(req, res, {
      action: 'records.correct',
      organizationId: organization.id,
      targetType: 'program_project_record',
      targetId: record.id,
      metadata: { version: updated.version, reason: input.reason },
    })
    res.status(200).json({ record: { id: updated.id, version: updated.version, contentHash: updated.contentHash } })
  } catch (error) {
    next(error)
  }
})

/** Deletion request from a participant: their name is removed from every version. Owners and admins only. */
organizationProjectRecordsRouter.post('/:recordId/redactions', authenticate, adminOnly, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { organization } = res.locals.orgAccess as OrgAccess
    const record = await findScopedRecord(res, String(req.params.recordId))
    const input = recordRedactionSchema.parse(req.body)
    const updated = await redactParticipant(record.id, { userId: input.userId, actorId: authUser.id, reason: input.reason })
    await audit(req, res, {
      action: 'records.redact',
      organizationId: organization.id,
      targetType: 'program_project_record',
      targetId: record.id,
      metadata: { version: updated.version, userId: input.userId, reason: input.reason },
    })
    res.status(200).json({ record: { id: updated.id, version: updated.version, contentHash: updated.contentHash } })
  } catch (error) {
    next(error)
  }
})
