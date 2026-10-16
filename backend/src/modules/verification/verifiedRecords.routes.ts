import { RecordDisclosure, VerifiedRecordStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { refreshCandidateResultsSafely } from '../matching/resultPrivacy.js'
import {
  effectiveDisclosure,
  readContributionSnapshot,
  readSnapshot,
  recordIntegrity,
} from '../../services/verification/verifiedRecords.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'

export const verifiedRecordsRouter = Router()

const disclosureSchema = z.object({ disclosure: z.enum(['hidden', 'summary', 'full']) })

const recordSelect = {
  id: true,
  kind: true,
  status: true,
  role: true,
  disclosure: true,
  verifiedAt: true,
  issuedAt: true,
  snapshot: true,
  contentHash: true,
  project: { select: { id: true, title: true } },
  program: { select: { id: true, title: true, recordDisclosure: true } },
  organization: { select: { name: true } },
} as const

type RecordRow = Awaited<ReturnType<typeof loadOwn>>[number]

function loadOwn(userId: string) {
  return prisma.verifiedRecord.findMany({
    where: { userId, status: { in: [VerifiedRecordStatus.VERIFIED, VerifiedRecordStatus.REVOKED] } },
    select: recordSelect,
    orderBy: { issuedAt: 'desc' },
    take: 200,
  })
}

function serialize(row: RecordRow) {
  const evidence = readSnapshot(row.snapshot)
  const contribution = readContributionSnapshot(row.snapshot)
  const cap = row.program?.recordDisclosure ?? null
  return {
    id: row.id,
    kind: row.kind.toLowerCase(),
    status: row.status.toLowerCase(),
    integrity: recordIntegrity(row),
    title: contribution ? contribution.project.title : (evidence?.evidence.title ?? row.project.title),
    projectTitle: contribution?.project.title ?? evidence?.project.title ?? row.project.title,
    role: contribution?.role ?? evidence?.role ?? row.role,
    organizationName: contribution?.organization.name ?? evidence?.organization?.name ?? row.organization?.name ?? null,
    programTitle: contribution?.program.title ?? evidence?.program?.title ?? row.program?.title ?? null,
    verifiedAt: row.verifiedAt ?? row.issuedAt,
    disclosure: row.disclosure.toLowerCase(),
    programCap: cap ? cap.toLowerCase() : null,
    effectiveDisclosure: effectiveDisclosure(row.disclosure, cap).toLowerCase(),
  }
}

/** The signed-in student's own verified records with their disclosure settings. */
verifiedRecordsRouter.get('/mine', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const rows = await loadOwn(authUser.id)
    res.status(200).json({ records: rows.map(serialize) })
  } catch (error) {
    next(error)
  }
})

/**
 * Only the record's owner chooses how much others see. The verified content itself stays frozen;
 * this changes exposure, never what was verified.
 */
verifiedRecordsRouter.patch('/:recordId/visibility', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { disclosure } = disclosureSchema.parse(req.body)
    const record = await prisma.verifiedRecord.findFirst({
      where: { id: String(req.params.recordId), userId: authUser.id },
      select: { id: true, organizationId: true },
    })
    if (!record) throw new HttpError(404, '검증 기록을 찾을 수 없습니다.')
    const row = await prisma.verifiedRecord.update({
      where: { id: record.id },
      data: { disclosure: disclosure.toUpperCase() as RecordDisclosure },
      select: recordSelect,
    })
    await refreshCandidateResultsSafely([authUser.id])
    await audit(req, res, {
      action: 'verified_record.disclosure_change',
      organizationId: record.organizationId,
      targetType: 'verified_record',
      targetId: record.id,
      metadata: { disclosure },
    })
    res.status(200).json({ record: serialize(row) })
  } catch (error) {
    next(error)
  }
})
