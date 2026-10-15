import { createHash } from 'node:crypto'
import {
  EvidenceStatus,
  ProgramProjectRecordEventAction,
  ProgramProjectRecordStatus,
  ProgramStatus,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'

type Db = PrismaClient | Prisma.TransactionClient

export const REDACTED_NAME = '비식별 처리된 참여자'

type Person = { id: string; name: string | null } | null

export type RecordParticipant = {
  userId: string
  name: string | null
  role: string | null
  joinedAt: string | null
  /** False once the person left the team; their part in the program stays on record. */
  onTeam: boolean
}

export type RecordCorrection = { at: string; by: Person; reason: string; note: string | null }

export type RecordSnapshot = {
  v: 1
  organization: { id: string; name: string; type: string }
  program: { id: string; title: string; term: string | null; startDate: string | null; endDate: string | null; status: string }
  project: { id: string; title: string; teamName: string | null; startDate: string | null; endDate: string | null; status: string }
  participants: RecordParticipant[]
  registration: { status: string; source: string; reviewedAt: string | null; reviewer: Person } | null
  verification: {
    status: string
    outcomeSummary: string
    verifiedAt: string
    verifier: Person
    revokedAt: string | null
    revokeReason: string | null
    contentHash: string
  } | null
  evidence: {
    id: string
    title: string
    category: string
    activityDate: string
    status: string
    authorId: string
    submittedAt: string | null
    reviewedAt: string | null
    reviewer: Person
    files: { name: string; sha256: string }[]
  }[]
  records: {
    id: string
    userId: string
    kind: string
    status: string
    role: string
    verifiedAt: string | null
    revokedAt: string | null
    contentHash: string | null
  }[]
  reviews: { kind: string; status: string | null; createdAt: string }[]
  corrections: RecordCorrection[]
  /** People removed from every version on request; later captures keep them hidden. */
  redactedUserIds: string[]
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)
const person = (user: { id: string; name: string } | null | undefined): Person => (user ? { id: user.id, name: user.name } : null)

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function hashSnapshot(snapshot: RecordSnapshot) {
  return createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex')
}

/** Stable per record: the n-th person redacted from a record is `redacted:n` in every version of it. */
export const pseudonymOf = (userIds: string[], userId: string) => `redacted:${userIds.indexOf(userId) + 1}`

/** Free-text fields a name can be typed into; enums, dates and hashes are never rewritten. */
const TEXT_KEYS = new Set(['title', 'name', 'teamName', 'outcomeSummary', 'revokeReason', 'reason', 'note'])

function replaceNames(text: string, names: string[]) {
  return names.reduce((value, name) => (name.length >= 2 ? value.split(name).join(REDACTED_NAME) : value), text)
}

/**
 * Removes the given people from a snapshot: their user ids become the record's pseudonyms, their name and team
 * role are blanked, and their names are replaced inside free text (titles, file names, summaries, reasons).
 * `userIds` is the record's full ordered list so pseudonyms match across versions. The raw ids stay only in
 * `redactedUserIds`, which later captures need and which is never returned by the API.
 */
export function redactSnapshot(snapshot: RecordSnapshot, userIds: string[], names: string[] = []): RecordSnapshot {
  if (userIds.length === 0) return snapshot
  const hidden = new Set(userIds)
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === 'string') {
      if (hidden.has(value)) return pseudonymOf(userIds, value)
      return key && TEXT_KEYS.has(key) ? replaceNames(value, names) : value
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, key))
    if (!value || typeof value !== 'object') return value
    const original = value as Record<string, unknown>
    const object = Object.fromEntries(Object.entries(original).map(([childKey, child]) => [childKey, walk(child, childKey)])) as Record<string, unknown>
    const owner = typeof original.userId === 'string' ? original.userId : typeof original.id === 'string' ? original.id : null
    if (owner && hidden.has(owner) && 'name' in object) {
      object.name = REDACTED_NAME
      if ('role' in object && 'userId' in object) object.role = null
    }
    return object
  }
  const { redactedUserIds: _previous, ...rest } = snapshot
  return { ...(walk(rest) as Omit<RecordSnapshot, 'redactedUserIds'>), redactedUserIds: userIds }
}

/** Names to replace in free text: the person's current account name and the names earlier versions recorded. */
async function namesOf(db: Db, userIds: string[], snapshots: RecordSnapshot[] = []) {
  if (userIds.length === 0) return []
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { name: true } })
  const recorded = snapshots.flatMap((snapshot) =>
    snapshot.participants.filter((participant) => userIds.includes(participant.userId)).map((participant) => participant.name),
  )
  return [...new Set([...users.map((user) => user.name), ...recorded].filter((name): name is string => Boolean(name && name.length >= 2)))].sort(
    (a, b) => b.length - a.length,
  )
}

/**
 * What the API may return. Redacted people appear only as pseudonyms: the internal list of their ids is dropped,
 * and so are the ids of their evidence and records, which would lead back to them through the live tables.
 */
export function publicSnapshot(snapshot: RecordSnapshot) {
  const { redactedUserIds = [], ...rest } = snapshot
  const pseudonyms = new Set(redactedUserIds.map((userId) => pseudonymOf(redactedUserIds, userId)))
  return {
    ...rest,
    evidence: rest.evidence.map((item) => (pseudonyms.has(item.authorId) ? { ...item, id: null } : item)),
    records: rest.records.map((record) => (pseudonyms.has(record.userId) ? { ...record, id: null, contentHash: null } : record)),
    redactedCount: redactedUserIds.length,
  }
}

/** Event actor as the API shows it: a redacted person is never named or identified. */
export function publicActor(actor: { id: string; name: string } | null, redactedUserIds: string[] = []) {
  if (!actor || !redactedUserIds.includes(actor.id)) return actor
  return { id: pseudonymOf(redactedUserIds, actor.id), name: REDACTED_NAME }
}

/**
 * Reads the live rows into a snapshot. While the project is in the program the team comes from the project;
 * people who were on an earlier version but left stay listed with `onTeam: false`. A finalized record keeps
 * its team and only takes evidence submitted before it was finalized.
 */
async function buildSnapshot(
  db: Db,
  input: { programId: string; projectId: string; previous: RecordSnapshot | null; finalizedAt: Date | null },
): Promise<RecordSnapshot | null> {
  const [program, project] = await Promise.all([
    db.program.findUnique({
      where: { id: input.programId },
      select: {
        id: true,
        title: true,
        term: true,
        startDate: true,
        endDate: true,
        status: true,
        organization: { select: { id: true, name: true, type: true } },
      },
    }),
    db.project.findUnique({
      where: { id: input.projectId },
      select: {
        id: true,
        title: true,
        teamName: true,
        startDate: true,
        endDate: true,
        status: true,
        programId: true,
        members: { select: { userId: true, role: true, joinedAt: true, user: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } },
      },
    }),
  ])
  if (!program || !project) return null

  const linked = project.programId === program.id
  const [registration, verification, evidence, records, reviews] = await Promise.all([
    db.programProjectRegistration.findFirst({
      where: { programId: program.id, projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, source: true, reviewedAt: true, reviewedBy: { select: { id: true, name: true } } },
    }),
    db.projectVerification.findFirst({
      where: { programId: program.id, projectId: project.id },
      orderBy: { verifiedAt: 'desc' },
      select: {
        status: true,
        outcomeSummary: true,
        verifiedAt: true,
        revokedAt: true,
        revokeReason: true,
        contentHash: true,
        verifiedBy: { select: { id: true, name: true } },
      },
    }),
    db.projectEvidence.findMany({
      where: {
        projectId: project.id,
        status: { not: EvidenceStatus.DRAFT },
        ...(input.finalizedAt ? { submittedAt: { lte: input.finalizedAt } } : {}),
      },
      orderBy: [{ activityDate: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        category: true,
        activityDate: true,
        status: true,
        authorId: true,
        submittedAt: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
        files: { select: { originalName: true, sha256: true }, orderBy: { createdAt: 'asc' } },
      },
    }),
    db.verifiedRecord.findMany({
      where: { projectId: project.id, programId: program.id },
      orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, userId: true, kind: true, status: true, role: true, verifiedAt: true, revokedAt: true, contentHash: true },
    }),
    db.projectReview.findMany({
      where: { projectId: project.id, programId: program.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { kind: true, status: true, createdAt: true },
    }),
  ])

  const previousTeam = input.previous?.participants ?? []
  let participants: RecordParticipant[]
  if (linked && !input.finalizedAt) {
    const current = project.members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      role: member.role,
      joinedAt: iso(member.joinedAt),
      onTeam: true,
    }))
    const currentIds = new Set(current.map((member) => member.userId))
    participants = [...current, ...previousTeam.filter((member) => !currentIds.has(member.userId)).map((member) => ({ ...member, onTeam: false }))]
  } else {
    participants = previousTeam.length
      ? previousTeam
      : project.members.map((member) => ({
          userId: member.userId,
          name: member.user.name,
          role: member.role,
          joinedAt: iso(member.joinedAt),
          onTeam: linked,
        }))
  }
  const listed = new Set(participants.map((member) => member.userId))
  for (const record of records) {
    if (!listed.has(record.userId)) {
      participants.push({ userId: record.userId, name: null, role: record.role, joinedAt: null, onTeam: false })
      listed.add(record.userId)
    }
  }

  const snapshot: RecordSnapshot = {
    v: 1,
    organization: { id: program.organization.id, name: program.organization.name, type: program.organization.type },
    program: {
      id: program.id,
      title: program.title,
      term: program.term,
      startDate: iso(program.startDate),
      endDate: iso(program.endDate),
      status: program.status,
    },
    project: {
      id: project.id,
      title: project.title,
      teamName: project.teamName,
      startDate: iso(project.startDate),
      endDate: iso(project.endDate),
      status: project.status,
    },
    participants,
    registration: registration
      ? { status: registration.status, source: registration.source, reviewedAt: iso(registration.reviewedAt), reviewer: person(registration.reviewedBy) }
      : null,
    verification: verification
      ? {
          status: verification.status,
          outcomeSummary: verification.outcomeSummary,
          verifiedAt: verification.verifiedAt.toISOString(),
          verifier: person(verification.verifiedBy),
          revokedAt: iso(verification.revokedAt),
          revokeReason: verification.revokeReason,
          contentHash: verification.contentHash,
        }
      : null,
    evidence: evidence.map((item) => ({
      id: item.id,
      title: item.title,
      category: item.category,
      activityDate: item.activityDate.toISOString(),
      status: item.status,
      authorId: item.authorId,
      submittedAt: iso(item.submittedAt),
      reviewedAt: iso(item.reviewedAt),
      reviewer: person(item.reviewedBy),
      files: item.files.map((file) => ({ name: file.originalName, sha256: file.sha256 })),
    })),
    records: records.map((record) => ({
      id: record.id,
      userId: record.userId,
      kind: record.kind,
      status: record.status,
      role: record.role,
      verifiedAt: iso(record.verifiedAt),
      revokedAt: iso(record.revokedAt),
      contentHash: record.contentHash,
    })),
    reviews: reviews.map((review) => ({ kind: review.kind, status: review.status, createdAt: review.createdAt.toISOString() })),
    corrections: input.previous?.corrections ?? [],
    redactedUserIds: input.previous?.redactedUserIds ?? [],
  }
  return redactSnapshot(snapshot, snapshot.redactedUserIds, await namesOf(db, snapshot.redactedUserIds))
}

async function retentionFor(db: Db, organizationId: string, finalizedAt: Date) {
  const policy = await db.recordRetentionPolicy.findFirst({
    where: { organizationId, retiredAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, retentionMonths: true },
  })
  if (!policy) return { retentionPolicyId: null, retainUntil: null }
  if (policy.retentionMonths == null) return { retentionPolicyId: policy.id, retainUntil: null }
  const until = new Date(finalizedAt)
  until.setUTCMonth(until.getUTCMonth() + policy.retentionMonths)
  return { retentionPolicyId: policy.id, retainUntil: until }
}

export type CaptureInput = {
  programId: string
  projectId: string
  /** What happened, e.g. `registration.approved`, `evidence.approved`, `program.completed`. */
  trigger: string
  actorId?: string | null
  /** Close the record: the program ended or the project left it. */
  finalize?: boolean
  /** The project was (re)linked to the program: a finalized record opens again. */
  link?: boolean
  reason?: string | null
}

/**
 * Brings the official record of one program project up to date and appends a version when it changed.
 * Idempotent: the same content never creates a second version. Locks the project row so concurrent
 * actions on one project produce consecutive versions.
 */
export async function captureProgramProjectRecord(db: Prisma.TransactionClient, input: CaptureInput) {
  await db.$queryRaw`SELECT id FROM "Project" WHERE id = ${input.projectId} FOR UPDATE`
  const existing = await db.programProjectRecord.findUnique({
    where: { programId_projectId: { programId: input.programId, projectId: input.projectId } },
  })
  const previous = (existing?.snapshot as RecordSnapshot | undefined) ?? null
  const reopening = Boolean(existing && existing.status === ProgramProjectRecordStatus.FINAL && input.link)
  const staysFinal = existing?.status === ProgramProjectRecordStatus.FINAL && !reopening
  const snapshot = await buildSnapshot(db, {
    programId: input.programId,
    projectId: input.projectId,
    previous,
    finalizedAt: staysFinal ? existing!.finalizedAt : null,
  })
  if (!snapshot) return null
  const contentHash = hashSnapshot(snapshot)
  const now = new Date()
  const labels = {
    organizationName: snapshot.organization.name,
    programTitle: snapshot.program.title,
    programTerm: snapshot.program.term,
    projectTitle: snapshot.project.title,
  }

  if (!existing) {
    const final = Boolean(input.finalize)
    const retention = final ? await retentionFor(db, snapshot.organization.id, now) : { retentionPolicyId: null, retainUntil: null }
    return db.programProjectRecord.create({
      data: {
        organizationId: snapshot.organization.id,
        programId: input.programId,
        projectId: input.projectId,
        ...labels,
        status: final ? ProgramProjectRecordStatus.FINAL : ProgramProjectRecordStatus.ACTIVE,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        version: 1,
        finalizedAt: final ? now : null,
        ...retention,
        events: {
          create: {
            version: 1,
            action: final ? ProgramProjectRecordEventAction.FINALIZED : ProgramProjectRecordEventAction.CAPTURED,
            trigger: input.trigger,
            actorId: input.actorId ?? null,
            reason: input.reason ?? null,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            contentHash,
            previousHash: null,
          },
        },
      },
    })
  }

  let action: ProgramProjectRecordEventAction
  let statusChange: Prisma.ProgramProjectRecordUpdateInput = {}
  if (reopening) {
    action = ProgramProjectRecordEventAction.REOPENED
    statusChange = { status: ProgramProjectRecordStatus.ACTIVE, finalizedAt: null, retainUntil: null, retentionPolicy: { disconnect: true } }
  } else if (existing.status === ProgramProjectRecordStatus.ACTIVE && input.finalize) {
    action = ProgramProjectRecordEventAction.FINALIZED
    const retention = await retentionFor(db, existing.organizationId, now)
    statusChange = {
      status: ProgramProjectRecordStatus.FINAL,
      finalizedAt: now,
      retainUntil: retention.retainUntil,
      ...(retention.retentionPolicyId ? { retentionPolicy: { connect: { id: retention.retentionPolicyId } } } : {}),
    }
  } else if (contentHash === existing.contentHash) {
    return existing
  } else {
    action = staysFinal ? ProgramProjectRecordEventAction.CORRECTED : ProgramProjectRecordEventAction.UPDATED
  }

  const version = existing.version + 1
  const [updated] = await Promise.all([
    db.programProjectRecord.update({
      where: { id: existing.id },
      data: { ...labels, ...statusChange, snapshot: snapshot as unknown as Prisma.InputJsonValue, contentHash, version },
    }),
    db.programProjectRecordEvent.create({
      data: {
        recordId: existing.id,
        version,
        action,
        trigger: input.trigger,
        actorId: input.actorId ?? null,
        reason: input.reason ?? null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        previousHash: existing.contentHash,
      },
    }),
  ])
  return updated
}

/** Captures the record for whichever program the project is in now; no-op for personal projects. */
export async function captureForProject(db: Prisma.TransactionClient, projectId: string, input: Omit<CaptureInput, 'programId' | 'projectId'>) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { programId: true } })
  if (!project?.programId) return null
  return captureProgramProjectRecord(db, { ...input, programId: project.programId, projectId })
}

/**
 * Same as `captureProgramProjectRecord` but outside a caller's transaction and never failing the request:
 * the action already happened, so a capture error is logged and left to the backfill to repair.
 */
export async function captureSafely(input: CaptureInput) {
  try {
    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, input))
  } catch (error) {
    console.error(`[records] capture ${input.trigger} ${input.programId}/${input.projectId} failed`, error instanceof Error ? error.message : error)
  }
}

/** Finalizes every record of a program: the projects in it now and any record still open. */
export async function finalizeProgramRecords(db: Prisma.TransactionClient, programId: string, trigger: string, actorId: string | null) {
  const [projects, open] = await Promise.all([
    db.project.findMany({ where: { programId }, select: { id: true } }),
    db.programProjectRecord.findMany({
      where: { programId, status: ProgramProjectRecordStatus.ACTIVE, projectId: { not: null } },
      select: { projectId: true },
    }),
  ])
  const ids = [...new Set([...projects.map((project) => project.id), ...open.map((record) => record.projectId!)])].sort()
  for (const projectId of ids) await captureProgramProjectRecord(db, { programId, projectId, trigger, actorId, finalize: true })
  return ids.length
}

/** A completed program is running again: the records of the projects still in it open again. */
export async function reopenProgramRecords(db: Prisma.TransactionClient, programId: string, trigger: string, actorId: string | null) {
  const projects = await db.project.findMany({ where: { programId }, select: { id: true }, orderBy: { id: 'asc' } })
  for (const project of projects) await captureProgramProjectRecord(db, { programId, projectId: project.id, trigger, actorId, link: true })
}

export const ENDED_PROGRAM_STATUSES: ProgramStatus[] = [ProgramStatus.COMPLETED, ProgramStatus.ARCHIVED]

/**
 * Staff correction: re-reads the source when it still exists and appends the reason to the record. The record
 * keeps its status; the previous version stays in the history.
 */
export async function correctRecord(
  recordId: string,
  input: { actor: { id: string; name: string }; reason: string; note: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProgramProjectRecord" WHERE id = ${recordId} FOR UPDATE`
    if (locked.length === 0) throw new HttpError(404, '기록을 찾을 수 없습니다.')
    const record = await tx.programProjectRecord.findUniqueOrThrow({ where: { id: recordId } })
    const previous = record.snapshot as unknown as RecordSnapshot
    const fresh =
      record.programId && record.projectId
        ? await buildSnapshot(tx, {
            programId: record.programId,
            projectId: record.projectId,
            previous,
            finalizedAt: record.status === ProgramProjectRecordStatus.FINAL ? record.finalizedAt : null,
          })
        : null
    const base = fresh ?? previous
    const snapshot: RecordSnapshot = {
      ...base,
      corrections: [...previous.corrections, { at: new Date().toISOString(), by: { id: input.actor.id, name: input.actor.name }, reason: input.reason, note: input.note }],
    }
    const contentHash = hashSnapshot(snapshot)
    const version = record.version + 1
    await tx.programProjectRecordEvent.create({
      data: {
        recordId,
        version,
        action: ProgramProjectRecordEventAction.CORRECTED,
        trigger: 'correction',
        actorId: input.actor.id,
        reason: input.reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        previousHash: record.contentHash,
      },
    })
    return tx.programProjectRecord.update({
      where: { id: recordId },
      data: { snapshot: snapshot as unknown as Prisma.InputJsonValue, contentHash, version, projectTitle: snapshot.project.title },
    })
  })
}

/**
 * Removes a person from the record and from every earlier version, on a deletion request: ids become a pseudonym,
 * name and role are blanked, and their name is replaced in free text. The only change ever made to past versions;
 * hashes and the previous-hash chain are recomputed and the REDACTED event keeps who did it and why.
 */
export async function redactParticipant(recordId: string, input: { userId: string; actorId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ProgramProjectRecord" WHERE id = ${recordId} FOR UPDATE`
    if (locked.length === 0) throw new HttpError(404, '기록을 찾을 수 없습니다.')
    const record = await tx.programProjectRecord.findUniqueOrThrow({ where: { id: recordId }, include: { events: true } })
    const current = record.snapshot as unknown as RecordSnapshot
    const already = current.redactedUserIds ?? []
    if (already.includes(input.userId)) throw new HttpError(409, '이미 비식별 처리된 참여자입니다.')
    const { redactedUserIds: _ids, ...visible } = current
    if (!JSON.stringify(visible).includes(JSON.stringify(input.userId))) throw new HttpError(404, '이 기록의 참여자가 아닙니다.')

    const userIds = [...already, input.userId]
    const events = [...record.events].sort((a, b) => a.version - b.version)
    const names = await namesOf(tx, [input.userId], [current, ...events.map((event) => event.snapshot as unknown as RecordSnapshot)])
    let previousHash: string | null = null
    for (const event of events) {
      const redacted = redactSnapshot(event.snapshot as unknown as RecordSnapshot, userIds, names)
      const eventHash = hashSnapshot(redacted)
      await tx.programProjectRecordEvent.update({
        where: { id: event.id },
        data: {
          snapshot: redacted as unknown as Prisma.InputJsonValue,
          contentHash: eventHash,
          previousHash,
          reason: event.reason ? replaceNames(event.reason, names) : event.reason,
        },
      })
      previousHash = eventHash
    }
    const snapshot = redactSnapshot(current, userIds, names)
    const contentHash = hashSnapshot(snapshot)
    const version = record.version + 1
    await tx.programProjectRecordEvent.create({
      data: {
        recordId,
        version,
        action: ProgramProjectRecordEventAction.REDACTED,
        trigger: 'redaction',
        actorId: input.actorId,
        reason: replaceNames(input.reason, names),
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        previousHash,
      },
    })
    return tx.programProjectRecord.update({
      where: { id: recordId },
      data: {
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        version,
        projectTitle: replaceNames(record.projectTitle, names),
      },
    })
  })
}
