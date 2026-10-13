import { EvidenceFileKind, EvidenceStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { computeProgramKpis, type Period, type ProgramKpiResult } from '../programs/programKpis.js'

export const REPORT_SNAPSHOT_VERSION = 1
const MAX_EVIDENCE = 200
const MAX_ACTIVITIES = 300
const MAX_PHOTOS = 8
const MAX_PHOTO_BYTES = 3 * 1024 * 1024
const PHOTO_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const CATEGORY_LABEL: Record<string, string> = {
  DEVELOPMENT: '개발',
  MEETING: '회의',
  PRESENTATION: '발표',
  RESEARCH: '조사·연구',
  FIELDWORK: '현장 활동',
  REPORT: '보고서',
  OTHER: '기타',
}

export type ReportSnapshot = {
  v: number
  organization: { id: string; name: string; type: string }
  period: { from: string; to: string }
  generatedAt: string
  kpis: ProgramKpiResult
  programs: {
    id: string
    title: string
    term: string | null
    description: string | null
    status: string
    startDate: string | null
    endDate: string | null
    managers: string[]
  }[]
  evidence: {
    id: string
    title: string
    description: string | null
    category: string
    activityDate: string
    reviewedAt: string | null
    author: string
    reviewer: string | null
    project: { id: string; title: string; teamName: string | null; programId: string }
    files: { id: string; name: string; kind: string; mimeType: string; sha256: string; photo: boolean }[]
  }[]
  evidenceTruncated: boolean
  activities: {
    title: string
    description: string | null
    type: string
    createdAt: string
    author: string
    project: { title: string; teamName: string | null; programId: string }
  }[]
  activitiesTruncated: boolean
  /** File ids embedded as photos on page 4 (approved evidence only). */
  photoFileIds: string[]
}

/**
 * Freezes everything a report shows. Statistics come only from `computeProgramKpis`; the evidence
 * and activity lists are raw rows. Only APPROVED evidence appears as proof.
 */
export async function buildReportSnapshot(organization: { id: string; name: string; type: string }, programIds: string[], period: Period) {
  const range = { gte: period.from, lte: period.to }
  const [kpis, programs, evidence, activities] = await Promise.all([
    computeProgramKpis(programIds, period),
    prisma.program.findMany({
      where: { id: { in: programIds }, organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        term: true,
        description: true,
        status: true,
        startDate: true,
        endDate: true,
        managers: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.projectEvidence.findMany({
      where: { project: { programId: { in: programIds } }, status: EvidenceStatus.APPROVED, reviewedAt: range },
      orderBy: { reviewedAt: 'desc' },
      take: MAX_EVIDENCE + 1,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        activityDate: true,
        reviewedAt: true,
        author: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        project: { select: { id: true, title: true, teamName: true, programId: true } },
        files: { select: { id: true, originalName: true, kind: true, mimeType: true, sha256: true, sizeBytes: true } },
      },
    }),
    prisma.projectActivity.findMany({
      where: { project: { programId: { in: programIds } }, createdAt: range },
      orderBy: { createdAt: 'desc' },
      take: MAX_ACTIVITIES + 1,
      select: {
        title: true,
        description: true,
        type: true,
        createdAt: true,
        user: { select: { name: true } },
        project: { select: { title: true, teamName: true, programId: true } },
      },
    }),
  ])

  const photoFileIds: string[] = []
  const evidenceRows = evidence.slice(0, MAX_EVIDENCE).map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: CATEGORY_LABEL[item.category] ?? item.category,
    activityDate: item.activityDate.toISOString(),
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    author: item.author.name,
    reviewer: item.reviewedBy?.name ?? null,
    project: { id: item.project.id, title: item.project.title, teamName: item.project.teamName, programId: item.project.programId! },
    files: item.files.map((file) => {
      const photo =
        file.kind === EvidenceFileKind.IMAGE && PHOTO_MIME.has(file.mimeType) && file.sizeBytes <= MAX_PHOTO_BYTES && photoFileIds.length < MAX_PHOTOS
      if (photo) photoFileIds.push(file.id)
      return { id: file.id, name: file.originalName, kind: file.kind, mimeType: file.mimeType, sha256: file.sha256, photo }
    }),
  }))

  const snapshot: ReportSnapshot = {
    v: REPORT_SNAPSHOT_VERSION,
    organization,
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    generatedAt: new Date().toISOString(),
    kpis,
    programs: programs.map((program) => ({
      id: program.id,
      title: program.title,
      term: program.term,
      description: program.description,
      status: program.status.toLowerCase(),
      startDate: program.startDate?.toISOString() ?? null,
      endDate: program.endDate?.toISOString() ?? null,
      managers: program.managers.map((manager) => manager.user.name),
    })),
    evidence: evidenceRows,
    evidenceTruncated: evidence.length > MAX_EVIDENCE,
    activities: activities.slice(0, MAX_ACTIVITIES).map((activity) => ({
      title: activity.title,
      description: activity.description,
      type: activity.type,
      createdAt: activity.createdAt.toISOString(),
      author: activity.user.name,
      project: { title: activity.project.title, teamName: activity.project.teamName, programId: activity.project.programId! },
    })),
    activitiesTruncated: activities.length > MAX_ACTIVITIES,
    photoFileIds,
  }
  return snapshot
}
