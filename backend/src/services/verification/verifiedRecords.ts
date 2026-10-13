import { createHash } from 'node:crypto'
import { Prisma, VerifiedRecordEventAction, VerifiedRecordStatus } from '@prisma/client'

export const SNAPSHOT_VERSION = 1

export type VerifiedSnapshot = {
  v: number
  evidence: { id: string; title: string; description: string | null; category: string; activityDate: string }
  project: { id: string; title: string; teamName: string | null }
  program: { id: string; title: string; term: string | null } | null
  organization: { id: string; name: string } | null
  role: string
  files: { name: string; mimeType: string; sha256: string }[]
  approvedBy: { id: string; name: string } | null
  approvedAt: string
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function hashSnapshot(snapshot: VerifiedSnapshot) {
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex')
}

export function readSnapshot(value: Prisma.JsonValue | null): VerifiedSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const snapshot = value as unknown as VerifiedSnapshot
  return snapshot.v && snapshot.evidence ? snapshot : null
}

export type RecordIntegrity = 'intact' | 'tampered' | 'legacy'

/** Detects rows whose frozen snapshot no longer matches the hash written at issue time. */
export function recordIntegrity(record: { snapshot: Prisma.JsonValue | null; contentHash: string | null }): RecordIntegrity {
  const snapshot = readSnapshot(record.snapshot)
  if (!snapshot || !record.contentHash) return 'legacy'
  return hashSnapshot(snapshot) === record.contentHash ? 'intact' : 'tampered'
}

type Tx = Prisma.TransactionClient

/** Records that count as verified anywhere in the product (profile, portfolio, matching). */
export const trustedRecordWhere = {
  status: VerifiedRecordStatus.VERIFIED,
  contentHash: { not: null },
} satisfies Prisma.VerifiedRecordWhereInput

/**
 * Issues (or reissues after a revoke) the verified record for an approved evidence item.
 * Must run inside the same transaction that flips the evidence to APPROVED.
 */
export async function issueVerifiedRecord(
  tx: Tx,
  input: { evidenceId: string; approverId: string; approvedAt: Date; backfill?: boolean },
) {
  const evidence = await tx.projectEvidence.findUniqueOrThrow({
    where: { id: input.evidenceId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      activityDate: true,
      authorId: true,
      files: { select: { originalName: true, mimeType: true, sha256: true }, orderBy: { createdAt: 'asc' } },
      project: {
        select: {
          id: true,
          title: true,
          teamName: true,
          program: {
            select: { id: true, title: true, term: true, organization: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })
  const [approver, member] = await Promise.all([
    tx.user.findUnique({ where: { id: input.approverId }, select: { id: true, name: true } }),
    tx.projectMember.findUnique({
      where: { projectId_userId: { projectId: evidence.project.id, userId: evidence.authorId } },
      select: { role: true, projectRole: { select: { name: true } } },
    }),
  ])
  const program = evidence.project.program
  const role = member?.role ?? member?.projectRole?.name ?? '참여자'

  const snapshot: VerifiedSnapshot = {
    v: SNAPSHOT_VERSION,
    evidence: {
      id: evidence.id,
      title: evidence.title,
      description: evidence.description,
      category: evidence.category,
      activityDate: evidence.activityDate.toISOString(),
    },
    project: { id: evidence.project.id, title: evidence.project.title, teamName: evidence.project.teamName },
    program: program ? { id: program.id, title: program.title, term: program.term } : null,
    organization: program ? { id: program.organization.id, name: program.organization.name } : null,
    role,
    files: evidence.files.map((file) => ({ name: file.originalName, mimeType: file.mimeType, sha256: file.sha256 })),
    approvedBy: approver,
    approvedAt: input.approvedAt.toISOString(),
  }
  const contentHash = hashSnapshot(snapshot)
  const summary = [evidence.title, evidence.description].filter(Boolean).join(' — ').slice(0, 600)
  const data = {
    userId: evidence.authorId,
    projectId: evidence.project.id,
    role,
    contributionSummary: program ? `[${program.organization.name} · ${program.title}] ${summary}` : summary,
    trustScore: 90,
    status: VerifiedRecordStatus.VERIFIED,
    issuedAt: input.approvedAt,
    organizationId: program?.organization.id ?? null,
    programId: program?.id ?? null,
    verifiedById: input.approverId,
    verifiedAt: input.approvedAt,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    snapshot: snapshot as unknown as Prisma.InputJsonValue,
    contentHash,
  }

  const existing = await tx.verifiedRecord.findUnique({ where: { evidenceId: evidence.id }, select: { id: true } })
  const record = existing
    ? await tx.verifiedRecord.update({ where: { id: existing.id }, data })
    : await tx.verifiedRecord.create({ data: { ...data, evidenceId: evidence.id } })

  await tx.verifiedRecordEvent.create({
    data: {
      recordId: record.id,
      action: existing && !input.backfill ? VerifiedRecordEventAction.REISSUED : VerifiedRecordEventAction.ISSUED,
      actorId: input.approverId,
      reason: input.backfill ? '기존 검증 기록에 승인 시점 스냅샷 보강' : null,
      contentHash,
    },
  })
  return record
}

export async function revokeVerifiedRecord(tx: Tx, input: { evidenceId: string; actorId: string; reason: string }) {
  const record = await tx.verifiedRecord.findUnique({
    where: { evidenceId: input.evidenceId },
    select: { id: true, status: true, contentHash: true },
  })
  if (!record || record.status !== VerifiedRecordStatus.VERIFIED) return null
  const now = new Date()
  const updated = await tx.verifiedRecord.update({
    where: { id: record.id },
    data: { status: VerifiedRecordStatus.REVOKED, revokedAt: now, revokedById: input.actorId, revokeReason: input.reason },
  })
  await tx.verifiedRecordEvent.create({
    data: {
      recordId: record.id,
      action: VerifiedRecordEventAction.REVOKED,
      actorId: input.actorId,
      reason: input.reason,
      contentHash: record.contentHash,
    },
  })
  return updated
}
