import { timingSafeEqual } from 'node:crypto'
import os from 'node:os'
import { OpsRunKind, Prisma, UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { sendAlert } from '../../services/ops/alerts.js'
import { backupFreshness, serializeRun } from '../../services/ops/opsRuns.js'
import { HttpError } from '../../utils/httpError.js'

/** Machine endpoint for backup/deploy scripts (authenticated with `X-Ops-Token`). */
export const opsIngestRouter = Router()
/** Operator console data. */
export const opsAdminRouter = Router()

const HOUR = 3_600_000
const DAY = 24 * HOUR

function tokenMatches(provided: string | undefined) {
  if (!env.OPS_INGEST_TOKEN || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(env.OPS_INGEST_TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

const runSchema = z.object({
  id: z.string().max(64).optional(),
  kind: z.enum(['db_backup', 'restore_drill', 'file_backup_check', 'deploy', 'rollback', 'incident_drill']),
  status: z.enum(['started', 'success', 'failure']),
  environment: z.string().max(40).optional(),
  startedAt: z.coerce.date().optional(),
  finishedAt: z.coerce.date().optional(),
  sizeBytes: z.coerce.number().int().min(0).optional(),
  location: z.string().max(500).optional(),
  message: z.string().max(2000).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

const KIND_LABEL: Record<string, string> = {
  DB_BACKUP: 'DB 백업',
  RESTORE_DRILL: '복원 훈련',
  FILE_BACKUP_CHECK: '파일 백업 점검',
  DEPLOY: '배포',
  ROLLBACK: '롤백',
  INCIDENT_DRILL: '장애 대응 훈련',
}

opsIngestRouter.post('/runs', async (req, res, next) => {
  try {
    if (!env.OPS_INGEST_TOKEN) throw new HttpError(503, 'OPS_INGEST_TOKEN is not configured')
    if (!tokenMatches(req.header('x-ops-token') ?? undefined)) throw new HttpError(401, 'Invalid ops token')
    const input = runSchema.parse(req.body)
    const kind = input.kind.toUpperCase() as OpsRunKind
    const data = {
      kind,
      status: input.status,
      environment: input.environment ?? env.APP_ENV,
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      finishedAt: input.finishedAt ?? (input.status === 'started' ? null : new Date()),
      sizeBytes: input.sizeBytes !== undefined ? BigInt(input.sizeBytes) : null,
      location: input.location ?? null,
      message: input.message ?? null,
      details: (input.details ?? Prisma.DbNull) as Prisma.InputJsonValue,
    }
    const run = input.id
      ? await prisma.opsRun.update({ where: { id: input.id }, data })
      : await prisma.opsRun.create({ data })
    if (input.status === 'failure') {
      await sendAlert('critical', `${KIND_LABEL[kind]} 실패`, `${data.environment} · ${input.message ?? ''}`, `opsrun:${kind}:${data.environment}`)
    } else if (kind === OpsRunKind.ROLLBACK && input.status === 'success') {
      await sendAlert('warning', '배포가 롤백되었습니다', `${data.environment} · ${input.message ?? ''}`, `opsrun:rollback:${run.id}`)
    }
    res.status(input.id ? 200 : 201).json({ id: run.id })
  } catch (error) {
    next(error)
  }
})

/* ------------------------------------------------------------------ */

opsAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

type MetricTotals = { requests: bigint | null; errors: bigint | null; client_errors: bigint | null; total_ms: bigint | null; p95: number | null }

async function metricTotals(since: Date, routeFilter?: Prisma.Sql) {
  const [row] = await prisma.$queryRaw<MetricTotals[]>`
    SELECT SUM("count")::bigint AS requests, SUM("errorCount")::bigint AS errors, SUM("clientErrorCount")::bigint AS client_errors,
           SUM("totalMs")::bigint AS total_ms, MAX("p95Ms") AS p95
    FROM "RequestMetric" WHERE "bucket" >= ${since} ${routeFilter ?? Prisma.empty}`
  const requests = Number(row?.requests ?? 0)
  const errors = Number(row?.errors ?? 0)
  const clientErrors = Number(row?.client_errors ?? 0)
  return {
    requests,
    errors,
    clientErrors,
    errorRate: requests ? errors / requests : 0,
    avgMs: requests ? Math.round(Number(row?.total_ms ?? 0) / requests) : 0,
    p95Ms: row?.p95 ?? 0,
  }
}

opsAdminRouter.get('/overview', async (_req, res, next) => {
  try {
    const now = Date.now()
    const dbStarted = Date.now()
    let db: Record<string, unknown>
    try {
      const [[size], connections, [maxConn]] = await Promise.all([
        prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`,
        prisma.$queryRaw<{ state: string | null; count: bigint }[]>`
          SELECT state, COUNT(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`,
        prisma.$queryRaw<{ max_connections: string }[]>`SHOW max_connections`,
      ])
      db = {
        ok: true,
        latencyMs: Date.now() - dbStarted,
        sizeBytes: Number(size.bytes),
        connections: Object.fromEntries(connections.map((row) => [row.state ?? 'unknown', Number(row.count)])),
        maxConnections: Number(maxConn.max_connections),
      }
    } catch (error) {
      db = { ok: false, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }
    }

    const uploadRoutes = Prisma.sql`AND "method" = 'POST' AND ("route" LIKE '/api/media%' OR "route" LIKE '/api/evidence/%/files' OR "route" LIKE '/api/projects/:id/evidence%')`
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [lastHour, last24h, uploads, openErrors, aiToday, aiMonth, activeUsers, backups] = await Promise.all([
      metricTotals(new Date(now - HOUR)),
      metricTotals(new Date(now - DAY)),
      metricTotals(new Date(now - DAY), uploadRoutes),
      prisma.errorEvent.count({ where: { resolvedAt: null } }),
      prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: new Date(now - DAY) } }, _sum: { costUsd: true }, _count: { _all: true } }),
      prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
      prisma.session.findMany({ where: { lastSeenAt: { gte: new Date(now - DAY) } }, distinct: ['userId'], select: { userId: true } }),
      backupFreshness(),
    ])
    const memory = process.memoryUsage()
    res.status(200).json({
      app: {
        version: env.APP_VERSION,
        environment: env.APP_ENV,
        node: process.version,
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal },
        sentry: Boolean(env.SENTRY_DSN),
        alertsConfigured: Boolean(env.ALERT_WEBHOOK_URL),
        jobsEnabled: env.JOBS_ENABLED,
      },
      host: {
        hostname: os.hostname(),
        loadAvg: os.loadavg(),
        cpus: os.cpus().length,
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
      },
      db,
      traffic: { lastHour, last24h },
      uploads: { ...uploads, failureRate: uploads.requests ? (uploads.errors + uploads.clientErrors) / uploads.requests : 0 },
      errors: { open: openErrors },
      ai: {
        callsToday: aiToday._count._all,
        costTodayUsd: Number(aiToday._sum.costUsd ?? 0),
        costMonthUsd: Number(aiMonth._sum.costUsd ?? 0),
        monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD ?? null,
        dailyAlertUsd: env.AI_DAILY_COST_ALERT_USD ?? null,
      },
      users: { active24h: activeUsers.length },
      backups,
    })
  } catch (error) {
    next(error)
  }
})

opsAdminRouter.get('/metrics', async (req, res, next) => {
  try {
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(336).default(24) }).parse(req.query)
    const since = new Date(Date.now() - hours * HOUR)
    const unit = hours <= 6 ? 'minute' : 'hour'
    const series = await prisma.$queryRaw<
      { t: Date; requests: bigint; errors: bigint; client_errors: bigint; total_ms: bigint; p95: number }[]
    >`
      SELECT date_trunc(${unit}, "bucket") AS t, SUM("count")::bigint AS requests, SUM("errorCount")::bigint AS errors,
             SUM("clientErrorCount")::bigint AS client_errors, SUM("totalMs")::bigint AS total_ms, MAX("p95Ms") AS p95
      FROM "RequestMetric" WHERE "bucket" >= ${since} GROUP BY 1 ORDER BY 1`
    const routes = await prisma.$queryRaw<
      { method: string; route: string; requests: bigint; errors: bigint; client_errors: bigint; total_ms: bigint; p95: number; max_ms: number }[]
    >`
      SELECT "method", "route", SUM("count")::bigint AS requests, SUM("errorCount")::bigint AS errors,
             SUM("clientErrorCount")::bigint AS client_errors, SUM("totalMs")::bigint AS total_ms, MAX("p95Ms") AS p95, MAX("maxMs") AS max_ms
      FROM "RequestMetric" WHERE "bucket" >= ${since} GROUP BY 1, 2 ORDER BY requests DESC LIMIT 30`
    res.status(200).json({
      unit,
      series: series.map((row) => ({
        t: row.t,
        requests: Number(row.requests),
        errors: Number(row.errors),
        clientErrors: Number(row.client_errors),
        avgMs: Number(row.requests) ? Math.round(Number(row.total_ms) / Number(row.requests)) : 0,
        p95Ms: row.p95,
      })),
      routes: routes.map((row) => ({
        method: row.method,
        route: row.route,
        requests: Number(row.requests),
        errors: Number(row.errors),
        clientErrors: Number(row.client_errors),
        avgMs: Number(row.requests) ? Math.round(Number(row.total_ms) / Number(row.requests)) : 0,
        p95Ms: row.p95,
        maxMs: row.max_ms,
      })),
    })
  } catch (error) {
    next(error)
  }
})

opsAdminRouter.get('/errors', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['open', 'resolved', 'all']).default('open') }).parse(req.query)
    const errors = await prisma.errorEvent.findMany({
      where: status === 'all' ? {} : status === 'open' ? { resolvedAt: null } : { resolvedAt: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
    })
    res.status(200).json({ errors })
  } catch (error) {
    next(error)
  }
})

opsAdminRouter.post('/errors/:errorId/resolve', async (req, res, next) => {
  try {
    const error = await prisma.errorEvent.update({ where: { id: String(req.params.errorId) }, data: { resolvedAt: new Date() } })
    await audit(req, res, { action: 'ops.error_resolve', targetType: 'error_event', targetId: error.id })
    res.status(200).json({ error })
  } catch (error) {
    next(error)
  }
})

opsAdminRouter.get('/runs', async (req, res, next) => {
  try {
    const { kind } = z
      .object({ kind: z.enum(['all', 'db_backup', 'restore_drill', 'file_backup_check', 'deploy', 'rollback', 'incident_drill']).default('all') })
      .parse(req.query)
    const runs = await prisma.opsRun.findMany({
      where: kind === 'all' ? {} : { kind: kind.toUpperCase() as OpsRunKind },
      orderBy: { startedAt: 'desc' },
      take: 100,
    })
    res.status(200).json({ runs: runs.map(serializeRun), freshness: await backupFreshness() })
  } catch (error) {
    next(error)
  }
})

/** Incident drill: sends a test alert through the real webhook and records the outcome. */
opsAdminRouter.post('/drills/alert', async (req, res, next) => {
  try {
    const started = new Date()
    const delivered = await sendAlert('info', '장애 알림 훈련', `운영자 콘솔에서 보낸 테스트 알림입니다 (${started.toISOString()}).`, `drill:${started.getTime()}`)
    const run = await prisma.opsRun.create({
      data: {
        kind: OpsRunKind.INCIDENT_DRILL,
        status: delivered ? 'success' : env.ALERT_WEBHOOK_URL ? 'failure' : 'logged',
        environment: env.APP_ENV,
        startedAt: started,
        finishedAt: new Date(),
        message: delivered ? '알림 웹훅 전달 확인' : env.ALERT_WEBHOOK_URL ? '웹훅 전달 실패' : 'ALERT_WEBHOOK_URL 미설정 — 서버 로그에만 기록',
      },
    })
    await audit(req, res, { action: 'ops.alert_drill', targetType: 'ops_run', targetId: run.id, metadata: { delivered } })
    res.status(201).json({ run: serializeRun(run), delivered })
  } catch (error) {
    next(error)
  }
})

opsAdminRouter.get('/usage', async (_req, res, next) => {
  try {
    const now = Date.now()
    const activeSince = async (ms: number) =>
      (await prisma.session.findMany({ where: { lastSeenAt: { gte: new Date(now - ms) } }, distinct: ['userId'], select: { userId: true } })).length
    const [dau, wau, mau, signups, aiDaily, orgActivity] = await Promise.all([
      activeSince(DAY),
      activeSince(7 * DAY),
      activeSince(30 * DAY),
      prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count FROM "User"
        WHERE "createdAt" >= ${new Date(now - 30 * DAY)} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ day: Date; calls: bigint; cost: Prisma.Decimal | null }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS calls, SUM("costUsd") AS cost FROM "AIUsageLog"
        WHERE "createdAt" >= ${new Date(now - 30 * DAY)} GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ id: string; name: string; evidence: bigint; ai_calls: bigint }[]>`
        SELECT o."id", o."name",
               (SELECT COUNT(*) FROM "ProjectEvidence" e JOIN "Project" p ON p."id" = e."projectId" JOIN "Program" g ON g."id" = p."programId"
                 WHERE g."organizationId" = o."id" AND e."createdAt" >= ${new Date(now - 7 * DAY)})::bigint AS evidence,
               (SELECT COUNT(*) FROM "AIUsageLog" a WHERE a."organizationId" = o."id" AND a."createdAt" >= ${new Date(now - 7 * DAY)})::bigint AS ai_calls
        FROM "Organization" o WHERE o."verificationStatus" = 'APPROVED'
        ORDER BY evidence DESC, ai_calls DESC LIMIT 20`,
    ])
    res.status(200).json({
      activeUsers: { dau, wau, mau },
      signups: signups.map((row) => ({ day: row.day, count: Number(row.count) })),
      ai: aiDaily.map((row) => ({ day: row.day, calls: Number(row.calls), costUsd: Number(row.cost ?? 0) })),
      organizations: orgActivity.map((row) => ({ id: row.id, name: row.name, evidence7d: Number(row.evidence), aiCalls7d: Number(row.ai_calls) })),
    })
  } catch (error) {
    next(error)
  }
})
