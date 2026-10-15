import { ProgramProjectRecordStatus, ProgramProjectRegistrationStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { captureProgramProjectRecord, ENDED_PROGRAM_STATUSES } from './programProjectRecords.js'

export const BACKFILL_REASON = '기존 데이터 백필: 팀 구성과 증빙은 백필 시점의 원본 기준'

export type BackfillCandidate = {
  programId: string
  projectId: string
  organizationId: string
  programTitle: string
  projectTitle: string
  /** The program ended or the project is no longer in it. */
  final: boolean
  existing: 'none' | 'active' | 'final'
}

/**
 * Every program/project pair the institution already has history for: projects in a program now, approved or
 * removed registrations, project verifications and program-issued verified records.
 */
export async function findBackfillCandidates(options: { organizationId?: string } = {}) {
  const programFilter = options.organizationId ? { program: { organizationId: options.organizationId } } : {}
  const [linked, registrations, verifications, records] = await Promise.all([
    prisma.project.findMany({
      where: { programId: { not: null }, ...programFilter },
      select: { id: true, programId: true },
    }),
    prisma.programProjectRegistration.findMany({
      where: {
        projectId: { not: null },
        status: { in: [ProgramProjectRegistrationStatus.APPROVED, ProgramProjectRegistrationStatus.REMOVED] },
        ...programFilter,
      },
      select: { programId: true, projectId: true },
    }),
    prisma.projectVerification.findMany({ where: programFilter, select: { programId: true, projectId: true } }),
    prisma.verifiedRecord.findMany({
      where: { programId: { not: null }, ...programFilter },
      select: { programId: true, projectId: true },
    }),
  ])
  const pairs = new Map<string, { programId: string; projectId: string }>()
  const add = (programId: string | null, projectId: string | null) => {
    if (programId && projectId) pairs.set(`${programId}:${projectId}`, { programId, projectId })
  }
  for (const row of linked) add(row.programId, row.id)
  for (const row of [...registrations, ...verifications, ...records]) add(row.programId, row.projectId)

  const programIds = [...new Set([...pairs.values()].map((pair) => pair.programId))]
  const projectIds = [...new Set([...pairs.values()].map((pair) => pair.projectId))]
  const [programs, projects, existing] = await Promise.all([
    prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true, status: true, organizationId: true } }),
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true, programId: true } }),
    prisma.programProjectRecord.findMany({
      where: { programId: { in: programIds }, projectId: { in: projectIds } },
      select: { programId: true, projectId: true, status: true },
    }),
  ])
  const programById = new Map(programs.map((program) => [program.id, program]))
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const existingByPair = new Map(existing.map((record) => [`${record.programId}:${record.projectId}`, record.status]))

  const candidates: BackfillCandidate[] = []
  for (const [key, pair] of [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const program = programById.get(pair.programId)
    const project = projectById.get(pair.projectId)
    if (!program || !project) continue
    const status = existingByPair.get(key)
    candidates.push({
      ...pair,
      organizationId: program.organizationId,
      programTitle: program.title,
      projectTitle: project.title,
      final: ENDED_PROGRAM_STATUSES.includes(program.status) || project.programId !== program.id,
      existing: status === ProgramProjectRecordStatus.FINAL ? 'final' : status === ProgramProjectRecordStatus.ACTIVE ? 'active' : 'none',
    })
  }
  return candidates
}

/** Creates missing records and finalizes the ones whose program ended. Safe to run again. */
export async function applyBackfill(candidates: BackfillCandidate[]) {
  let created = 0
  let finalized = 0
  for (const candidate of candidates) {
    if (candidate.existing === 'final' || (candidate.existing === 'active' && !candidate.final)) continue
    await prisma.$transaction((tx) =>
      captureProgramProjectRecord(tx, {
        programId: candidate.programId,
        projectId: candidate.projectId,
        trigger: 'backfill',
        actorId: null,
        finalize: candidate.final,
        reason: BACKFILL_REASON,
      }),
    )
    if (candidate.existing === 'none') created += 1
    else finalized += 1
  }
  return { created, finalized }
}
