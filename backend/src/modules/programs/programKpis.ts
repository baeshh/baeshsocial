import { EvidenceStatus, ProjectStatus, VerifiedRecordKind, VerifiedRecordStatus, type Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { computeProjectProgress } from './programs.routes.js'

/* ------------------------------ Definitions ------------------------------ */

export const RATE_KPI_KEYS = [
  'projectCompletionRate',
  'participationRate',
  'submissionRate',
  'approvalRate',
  'averageProgress',
] as const
export const COUNT_KPI_KEYS = ['approvedEvidenceCount'] as const
export type RateKpiKey = (typeof RATE_KPI_KEYS)[number]
export type CountKpiKey = (typeof COUNT_KPI_KEYS)[number]
export type KpiKey = RateKpiKey | CountKpiKey | 'goalAchievementRate'

/** Shown verbatim in the dashboard and the PDF report so every number has an explicit basis. */
export const KPI_DEFINITIONS: Record<KpiKey, { label: string; numerator: string; denominator: string; basis: string }> = {
  projectCompletionRate: {
    label: '프로젝트 완료율',
    numerator: '완료(COMPLETED) 상태 프로젝트 수',
    denominator: '운영 프로젝트 수(보관 제외)',
    basis: '집계 시점의 프로젝트 상태 기준',
  },
  participationRate: {
    label: '참여율',
    numerator: '기간 내 프로젝트 활동 기록 또는 증빙 작성이 1건 이상 있는 등록 참여자 수',
    denominator: '프로그램 등록 참여자 수',
    basis: '프로그램별 등록 인원 기준(여러 프로그램 등록 시 프로그램마다 집계)',
  },
  submissionRate: {
    label: '활동 제출률',
    numerator: '기간 내 증빙을 1건 이상 제출한 등록 참여자 수',
    denominator: '프로그램 등록 참여자 수',
    basis: '제출 시각(submittedAt)이 기간 안에 있는 증빙 기준',
  },
  approvalRate: {
    label: '증빙 승인율',
    numerator: '기간 내 검토가 끝난 증빙 중 승인 상태인 증빙 수',
    denominator: '기간 내 검토가 끝난 증빙 수(승인 + 반려)',
    basis: '마지막 검토 시각(reviewedAt) 기준, 검토 대기 건 제외',
  },
  averageProgress: {
    label: '평균 진행률',
    numerator: '운영 프로젝트 진행률의 합',
    denominator: '운영 프로젝트 수(보관 제외)',
    basis: '태스크가 있으면 완료 태스크 비율, 없으면 팀이 입력한 진행률',
  },
  approvedEvidenceCount: {
    label: '승인 증빙 수',
    numerator: '기간 내 승인된 증빙 수',
    denominator: '-',
    basis: '마지막 검토 시각(reviewedAt) 기준',
  },
  goalAchievementRate: {
    label: '프로그램 목표 달성률',
    numerator: '목표치 이상을 달성한 KPI 수',
    denominator: '목표가 설정된 KPI 수',
    basis: '담당자가 설정한 KPI 목표 기준, 목표 미설정 시 산출하지 않음',
  },
}

export const kpiTargetsSchema = z
  .object({
    projectCompletionRate: z.number().int().min(0).max(100).nullable().optional(),
    participationRate: z.number().int().min(0).max(100).nullable().optional(),
    submissionRate: z.number().int().min(0).max(100).nullable().optional(),
    approvalRate: z.number().int().min(0).max(100).nullable().optional(),
    averageProgress: z.number().int().min(0).max(100).nullable().optional(),
    approvedEvidenceCount: z.number().int().min(0).max(100000).nullable().optional(),
  })
  .strict()
export type KpiTargets = z.infer<typeof kpiTargetsSchema>

export function readTargets(value: Prisma.JsonValue | null): KpiTargets {
  const parsed = kpiTargetsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : {}
}

/* -------------------------------- Period -------------------------------- */

const DAY = 24 * 60 * 60 * 1000
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식이어야 합니다.')
  .optional()
export const periodQuerySchema = z.object({ from: dateParam, to: dateParam })

export type Period = { from: Date; to: Date }

/** `to` is inclusive (end of that day, KST-agnostic UTC day). Ranges are capped at 3 years. */
export function resolvePeriod(query: unknown, fallback: { from: Date; to: Date }): Period {
  const { from, to } = periodQuerySchema.parse(query)
  const start = from ? new Date(`${from}T00:00:00.000Z`) : fallback.from
  const end = to ? new Date(`${to}T23:59:59.999Z`) : fallback.to
  if (start > end) throw new HttpError(400, '시작일이 종료일보다 늦습니다.')
  if (end.getTime() - start.getTime() > 3 * 366 * DAY) throw new HttpError(400, '집계 기간은 최대 3년입니다.')
  return { from: start, to: end }
}

export function defaultPeriod(programs: { startDate: Date | null; createdAt: Date }[]): Period {
  const now = new Date()
  const starts = programs.map((p) => (p.startDate ?? p.createdAt).getTime())
  const from = starts.length ? new Date(Math.min(...starts)) : new Date(now.getTime() - 90 * DAY)
  return { from: from > now ? new Date(now.getTime() - 90 * DAY) : from, to: now }
}

/* ------------------------------- Compute -------------------------------- */

export type Metric = {
  value: number | null
  numerator: number
  denominator: number
  target: number | null
  met: boolean | null
}

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10)
const within = (date: Date | null, period: Period) => Boolean(date && date >= period.from && date <= period.to)

function metric(numerator: number, denominator: number, target: number | null | undefined, value?: number | null): Metric {
  const v = value !== undefined ? value : pct(numerator, denominator)
  const t = target ?? null
  return { value: v, numerator, denominator, target: t, met: t === null || v === null ? null : v >= t }
}

type Bucket = { start: string; submissions: number; approvals: number; activeStudents: number }

function bucketKey(date: Date, granularity: 'week' | 'month') {
  if (granularity === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = (day.getUTCDay() + 6) % 7
  day.setUTCDate(day.getUTCDate() - weekday)
  return day.toISOString().slice(0, 10)
}

function buildBuckets(period: Period) {
  const spanDays = (period.to.getTime() - period.from.getTime()) / DAY
  const granularity: 'week' | 'month' = spanDays > 26 * 7 ? 'month' : 'week'
  const buckets = new Map<string, Bucket & { students: Set<string> }>()
  const cursor = new Date(bucketKey(period.from, granularity))
  while (cursor <= period.to) {
    const key = cursor.toISOString().slice(0, 10)
    buckets.set(key, { start: key, submissions: 0, approvals: 0, activeStudents: 0, students: new Set() })
    if (granularity === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setUTCDate(cursor.getUTCDate() + 7)
  }
  return { granularity, buckets }
}

/**
 * Computes every KPI for the given programs over one period with a fixed number of queries,
 * regardless of program count. All numbers come straight from PostgreSQL rows.
 */
export async function computeProgramKpis(programIds: string[], period: Period) {
  const [programs, projects, participants, activities, evidence, issuedRecords] = await Promise.all([
    prisma.program.findMany({
      where: { id: { in: programIds } },
      select: {
        id: true,
        title: true,
        term: true,
        status: true,
        startDate: true,
        endDate: true,
        kpiTargets: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.project.findMany({
      where: { programId: { in: programIds } },
      select: {
        id: true,
        title: true,
        teamName: true,
        status: true,
        progress: true,
        programId: true,
        startDate: true,
        endDate: true,
        tasks: { select: { status: true } },
        _count: { select: { members: true } },
      },
    }),
    prisma.programParticipant.findMany({
      where: { programId: { in: programIds } },
      select: { programId: true, userId: true },
    }),
    prisma.projectActivity.findMany({
      where: { project: { programId: { in: programIds } }, createdAt: { gte: period.from, lte: period.to } },
      select: { projectId: true, userId: true, createdAt: true },
    }),
    prisma.projectEvidence.findMany({
      where: { project: { programId: { in: programIds } } },
      select: {
        id: true,
        projectId: true,
        authorId: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        reviewedAt: true,
      },
    }),
    prisma.verifiedRecord.count({
      where: {
        programId: { in: programIds },
        kind: VerifiedRecordKind.EVIDENCE,
        status: VerifiedRecordStatus.VERIFIED,
        verifiedAt: { gte: period.from, lte: period.to },
      },
    }),
  ])

  const projectProgram = new Map(projects.map((project) => [project.id, project.programId!]))
  const enrolled = new Set(participants.map((p) => `${p.programId}:${p.userId}`))
  const active = new Set<string>()
  const submitted = new Set<string>()
  const { granularity, buckets } = buildBuckets(period)

  const perProject = new Map<string, { activities: number; submitted: number; approved: number; rejected: number; pending: number; contributors: Set<string> }>()
  const projectStats = (id: string) => {
    let stats = perProject.get(id)
    if (!stats) {
      stats = { activities: 0, submitted: 0, approved: 0, rejected: 0, pending: 0, contributors: new Set() }
      perProject.set(id, stats)
    }
    return stats
  }

  for (const row of activities) {
    const programId = projectProgram.get(row.projectId)!
    const key = `${programId}:${row.userId}`
    projectStats(row.projectId).activities += 1
    if (!enrolled.has(key)) continue
    active.add(key)
    projectStats(row.projectId).contributors.add(row.userId)
    buckets.get(bucketKey(row.createdAt, granularity))?.students.add(key)
  }

  const reviewed = new Map<string, { approved: number; rejected: number }>()
  for (const item of evidence) {
    const programId = projectProgram.get(item.projectId)!
    const key = `${programId}:${item.authorId}`
    const stats = projectStats(item.projectId)
    if (item.status === EvidenceStatus.SUBMITTED) stats.pending += 1
    if (enrolled.has(key) && within(item.createdAt, period)) {
      active.add(key)
      stats.contributors.add(item.authorId)
    }
    if (item.status !== EvidenceStatus.DRAFT && within(item.submittedAt, period)) {
      stats.submitted += 1
      if (enrolled.has(key)) submitted.add(key)
      buckets.get(bucketKey(item.submittedAt!, granularity))!.submissions += 1
      if (enrolled.has(key)) buckets.get(bucketKey(item.submittedAt!, granularity))!.students.add(key)
    }
    const isReviewed = item.status === EvidenceStatus.APPROVED || item.status === EvidenceStatus.REJECTED
    if (isReviewed && within(item.reviewedAt, period)) {
      const bucket = reviewed.get(programId) ?? { approved: 0, rejected: 0 }
      if (item.status === EvidenceStatus.APPROVED) {
        bucket.approved += 1
        stats.approved += 1
        buckets.get(bucketKey(item.reviewedAt!, granularity))!.approvals += 1
      } else {
        bucket.rejected += 1
        stats.rejected += 1
      }
      reviewed.set(programId, bucket)
    }
  }

  const projectRows = projects.map((project) => {
    const stats = projectStats(project.id)
    return {
      id: project.id,
      title: project.title,
      teamName: project.teamName,
      programId: project.programId!,
      status: project.status.toLowerCase(),
      progress: computeProjectProgress(project),
      memberCount: project._count.members,
      tasks: { total: project.tasks.length, done: project.tasks.filter((t) => t.status === 'DONE').length },
      activitiesInPeriod: stats.activities,
      activeContributors: stats.contributors.size,
      evidence: { submitted: stats.submitted, approved: stats.approved, rejected: stats.rejected, pending: stats.pending },
    }
  })

  const summarize = (scopeIds: string[], targets: KpiTargets) => {
    const scope = new Set(scopeIds)
    const operating = projectRows.filter((p) => scope.has(p.programId) && p.status !== 'archived')
    const completed = operating.filter((p) => p.status === ProjectStatus.COMPLETED.toLowerCase()).length
    const enrollments = participants.filter((p) => scope.has(p.programId))
    const enrollmentKeys = enrollments.map((p) => `${p.programId}:${p.userId}`)
    const activeCount = enrollmentKeys.filter((key) => active.has(key)).length
    const submittedCount = enrollmentKeys.filter((key) => submitted.has(key)).length
    let approved = 0
    let rejected = 0
    for (const id of scopeIds) {
      approved += reviewed.get(id)?.approved ?? 0
      rejected += reviewed.get(id)?.rejected ?? 0
    }
    const progressSum = operating.reduce((sum, p) => sum + p.progress, 0)
    const averageProgress = operating.length ? Math.round((progressSum / operating.length) * 10) / 10 : null

    const metrics: Record<Exclude<KpiKey, 'goalAchievementRate'>, Metric> = {
      projectCompletionRate: metric(completed, operating.length, targets.projectCompletionRate),
      participationRate: metric(activeCount, enrollments.length, targets.participationRate),
      submissionRate: metric(submittedCount, enrollments.length, targets.submissionRate),
      approvalRate: metric(approved, approved + rejected, targets.approvalRate),
      averageProgress: metric(progressSum, operating.length, targets.averageProgress, averageProgress),
      approvedEvidenceCount: metric(approved, 0, targets.approvedEvidenceCount, approved),
    }
    const withTargets = Object.values(metrics).filter((m) => m.target !== null)
    const met = withTargets.filter((m) => m.met).length
    return {
      metrics: {
        ...metrics,
        goalAchievementRate: metric(met, withTargets.length, null),
      },
      counts: {
        programs: scopeIds.length,
        projects: operating.length,
        completedProjects: completed,
        enrollments: enrollments.length,
        uniqueStudents: new Set(enrollments.map((p) => p.userId)).size,
        activeStudents: activeCount,
        submittedStudents: submittedCount,
        approvedEvidence: approved,
        rejectedEvidence: rejected,
        pendingEvidence: operating.reduce((sum, p) => sum + p.evidence.pending, 0),
      },
    }
  }

  const programRows = programs.map((program) => {
    const targets = readTargets(program.kpiTargets)
    return {
      id: program.id,
      title: program.title,
      term: program.term,
      status: program.status.toLowerCase(),
      startDate: program.startDate,
      endDate: program.endDate,
      organization: program.organization,
      targets,
      ...summarize([program.id], targets),
    }
  })

  // Totals sum per-program goal checks so "목표 달성률" stays "targets met / targets set".
  const totals = summarize(programIds, {})
  const goalChecks = programRows.reduce(
    (acc, row) => ({
      met: acc.met + row.metrics.goalAchievementRate.numerator,
      set: acc.set + row.metrics.goalAchievementRate.denominator,
    }),
    { met: 0, set: 0 },
  )
  totals.metrics.goalAchievementRate = metric(goalChecks.met, goalChecks.set, null)

  return {
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    generatedAt: new Date().toISOString(),
    definitions: KPI_DEFINITIONS,
    programs: programRows,
    totals: { ...totals, verifiedRecordsIssued: issuedRecords },
    projects: projectRows.sort(
      (a, b) => (a.teamName ?? a.title).localeCompare(b.teamName ?? b.title, 'ko') || a.title.localeCompare(b.title, 'ko'),
    ),
    trend: {
      granularity,
      buckets: [...buckets.values()].map(({ students, ...bucket }) => ({ ...bucket, activeStudents: students.size })),
    },
  }
}

export type ProgramKpiResult = Awaited<ReturnType<typeof computeProgramKpis>>
