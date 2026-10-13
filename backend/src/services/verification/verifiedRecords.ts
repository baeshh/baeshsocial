import { createHash } from 'node:crypto'
import {
  EvidenceStatus,
  Prisma,
  RecordDisclosure,
  VerifiedRecordEventAction,
  VerifiedRecordKind,
  VerifiedRecordStatus,
} from '@prisma/client'

export const SNAPSHOT_VERSION = 1
export const CONTRIBUTION_SNAPSHOT_VERSION = 2

/** A member's verified role and contribution in a project whose outcome the institution signed off. */
export type ContributionSnapshot = {
  v: number
  kind: 'contribution'
  projectVerificationId: string
  project: { id: string; title: string; teamName: string | null }
  program: { id: string; title: string; term: string | null }
  organization: { id: string; name: string }
  member: { id: string; name: string }
  role: string
  contribution: string
  period: { start: string | null; end: string | null }
  /** The approved evidence the contribution statement rests on. */
  approvedEvidence: { id: string; title: string; category: string; activityDate: string }[]
  projectOutcome: string
  approvedBy: { id: string; name: string } | null
  approvedAt: string
}

export type ProjectVerificationSnapshot = {
  v: number
  project: { id: string; title: string; teamName: string | null; startDate: string | null; endDate: string | null }
  program: { id: string; title: string; term: string | null }
  organization: { id: string; name: string }
  outcomeSummary: string
  approvedEvidenceCount: number
  members: { id: string; name: string; role: string }[]
  approvedBy: { id: string; name: string } | null
  approvedAt: string
}

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

export function hashSnapshot(snapshot: VerifiedSnapshot | ContributionSnapshot | ProjectVerificationSnapshot) {
  return createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex')
}

function asObject(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** Evidence snapshots only; contribution snapshots are read with readContributionSnapshot. */
export function readSnapshot(value: Prisma.JsonValue | null): VerifiedSnapshot | null {
  const object = asObject(value)
  if (!object || object.kind === 'contribution') return null
  const snapshot = object as unknown as VerifiedSnapshot
  return snapshot.v && snapshot.evidence && !Array.isArray(snapshot.evidence) ? snapshot : null
}

export function readContributionSnapshot(value: Prisma.JsonValue | null): ContributionSnapshot | null {
  const object = asObject(value)
  if (!object || object.kind !== 'contribution' || !object.v) return null
  return object as unknown as ContributionSnapshot
}

export type RecordIntegrity = 'intact' | 'tampered' | 'legacy'

/** Detects rows whose frozen snapshot no longer matches the hash written at issue time. */
export function recordIntegrity(record: { snapshot: Prisma.JsonValue | null; contentHash: string | null }): RecordIntegrity {
  const snapshot = readSnapshot(record.snapshot) ?? readContributionSnapshot(record.snapshot)
  if (!snapshot || !record.contentHash) return 'legacy'
  return hashSnapshot(snapshot) === record.contentHash ? 'intact' : 'tampered'
}

const DISCLOSURE_RANK: Record<RecordDisclosure, number> = { HIDDEN: 0, SUMMARY: 1, FULL: 2 }

/** What others may see of a record: the student's choice, never above what the program allows. */
export function effectiveDisclosure(record: RecordDisclosure, programCap: RecordDisclosure | null | undefined): RecordDisclosure {
  if (!programCap) return record
  return DISCLOSURE_RANK[record] <= DISCLOSURE_RANK[programCap] ? record : programCap
}

/** Prisma filter: records others may see at all (neither the student nor the program hid them). */
export const disclosedRecordWhere = {
  disclosure: { not: RecordDisclosure.HIDDEN },
  OR: [{ programId: null }, { program: { recordDisclosure: { not: RecordDisclosure.HIDDEN } } }],
} satisfies Prisma.VerifiedRecordWhereInput

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
  const record = await tx.verifiedRecord.findUnique({ where: { evidenceId: input.evidenceId }, select: { id: true } })
  if (!record) return null
  return revokeRecordById(tx, { recordId: record.id, actorId: input.actorId, reason: input.reason })
}

/**
 * Issues a member's CONTRIBUTION record under a project verification. The contribution text must be
 * backed by at least one approved, verified evidence item the member authored in that project.
 */
export async function issueContributionRecord(
  tx: Tx,
  input: {
    projectVerificationId: string
    userId: string
    role: string
    contribution: string
    startDate: Date | null
    endDate: Date | null
    approverId: string
    approvedAt: Date
  },
) {
  const verification = await tx.projectVerification.findUniqueOrThrow({
    where: { id: input.projectVerificationId },
    select: {
      id: true,
      outcomeSummary: true,
      project: { select: { id: true, title: true, teamName: true, startDate: true, endDate: true } },
      program: { select: { id: true, title: true, term: true } },
      organization: { select: { id: true, name: true } },
    },
  })
  const [member, approver, evidence] = await Promise.all([
    tx.projectMember.findUnique({
      where: { projectId_userId: { projectId: verification.project.id, userId: input.userId } },
      select: { joinedAt: true, user: { select: { id: true, name: true } } },
    }),
    tx.user.findUnique({ where: { id: input.approverId }, select: { id: true, name: true } }),
    tx.projectEvidence.findMany({
      where: {
        projectId: verification.project.id,
        authorId: input.userId,
        status: EvidenceStatus.APPROVED,
        verifiedRecord: { is: trustedRecordWhere },
      },
      select: { id: true, title: true, category: true, activityDate: true },
      orderBy: { activityDate: 'asc' },
    }),
  ])
  if (!member) throw new ContributionError(`${input.userId}: 현재 팀원이 아닙니다.`)
  if (evidence.length === 0) {
    throw new ContributionError(`${member.user.name}: 승인된 활동 증빙이 없어 기여를 인증할 수 없습니다.`)
  }

  const start = input.startDate ?? verification.project.startDate ?? member.joinedAt
  const end = input.endDate ?? verification.project.endDate ?? null
  const snapshot: ContributionSnapshot = {
    v: CONTRIBUTION_SNAPSHOT_VERSION,
    kind: 'contribution',
    projectVerificationId: verification.id,
    project: { id: verification.project.id, title: verification.project.title, teamName: verification.project.teamName },
    program: verification.program,
    organization: verification.organization,
    member: member.user,
    role: input.role,
    contribution: input.contribution,
    period: { start: start ? start.toISOString() : null, end: end ? end.toISOString() : null },
    approvedEvidence: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      activityDate: item.activityDate.toISOString(),
    })),
    projectOutcome: verification.outcomeSummary,
    approvedBy: approver,
    approvedAt: input.approvedAt.toISOString(),
  }
  const contentHash = hashSnapshot(snapshot)
  const record = await tx.verifiedRecord.create({
    data: {
      kind: VerifiedRecordKind.CONTRIBUTION,
      projectVerificationId: verification.id,
      userId: input.userId,
      projectId: verification.project.id,
      role: input.role,
      contributionSummary: `[${verification.organization.name} · ${verification.program.title}] ${input.contribution}`.slice(0, 2000),
      trustScore: 95,
      status: VerifiedRecordStatus.VERIFIED,
      issuedAt: input.approvedAt,
      organizationId: verification.organization.id,
      programId: verification.program.id,
      verifiedById: input.approverId,
      verifiedAt: input.approvedAt,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      contentHash,
    },
  })
  await tx.verifiedRecordEvent.create({
    data: { recordId: record.id, action: VerifiedRecordEventAction.ISSUED, actorId: input.approverId, contentHash },
  })
  return record
}

export class ContributionError extends Error {}

export async function revokeRecordById(tx: Tx, input: { recordId: string; actorId: string; reason: string }) {
  const record = await tx.verifiedRecord.findUnique({
    where: { id: input.recordId },
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
