import { randomUUID } from 'node:crypto'
import type { Request, RequestHandler } from 'express'
import { prisma } from '../../config/prisma.js'

const MINUTE = 60 * 1000
const MAX_SAMPLES = 500

type Bucket = {
  bucket: Date
  method: string
  route: string
  count: number
  errorCount: number
  clientErrorCount: number
  totalMs: number
  maxMs: number
  samples: number[]
}

const buckets = new Map<string, Bucket>()

const ID_SEGMENT = /^(?:[0-9]+|[0-9a-f]{8}-[0-9a-f-]{27}|c[a-z0-9]{20,32}|[A-Za-z0-9_-]{32,})$/

/** Collapses ids so `/api/programs/cmv6.../projects` and its siblings share one series. */
export function normalizeRoute(req: Request) {
  const path =
    req.route?.path && typeof req.route.path === 'string'
      ? `${req.baseUrl}${req.route.path}`
      : (req.originalUrl || req.url).split('?')[0]
  return path
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 200)
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id')
  const id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID()
  res.locals.requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}

/** Aggregates latency and status per minute/route in memory; `flushRequestMetrics` persists. */
export const requestMetrics: RequestHandler = (req, res, next) => {
  if (!req.originalUrl.startsWith('/api')) {
    next()
    return
  }
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    const route = res.statusCode === 404 && !req.route ? '(unmatched)' : normalizeRoute(req)
    const bucket = new Date(Math.floor(Date.now() / MINUTE) * MINUTE)
    const key = `${bucket.getTime()}|${req.method}|${route}`
    let entry = buckets.get(key)
    if (!entry) {
      entry = { bucket, method: req.method, route, count: 0, errorCount: 0, clientErrorCount: 0, totalMs: 0, maxMs: 0, samples: [] }
      buckets.set(key, entry)
    }
    entry.count += 1
    if (res.statusCode >= 500) entry.errorCount += 1
    else if (res.statusCode >= 400) entry.clientErrorCount += 1
    entry.totalMs += ms
    entry.maxMs = Math.max(entry.maxMs, ms)
    if (entry.samples.length < MAX_SAMPLES) entry.samples.push(ms)
  })
  next()
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

/**
 * Writes the in-memory buckets with an upsert that adds counts; percentiles of a re-flushed bucket
 * keep the larger value (good enough for alerting, exact enough for dashboards).
 */
export async function flushRequestMetrics() {
  if (buckets.size === 0) return 0
  const entries = [...buckets.values()]
  buckets.clear()
  for (const entry of entries) {
    const sorted = [...entry.samples].sort((a, b) => a - b)
    const p50 = Math.round(percentile(sorted, 50))
    const p95 = Math.round(percentile(sorted, 95))
    try {
      await prisma.$executeRaw`
        INSERT INTO "RequestMetric" ("id", "bucket", "method", "route", "count", "errorCount", "clientErrorCount", "totalMs", "p50Ms", "p95Ms", "maxMs")
        VALUES (${randomUUID()}, ${entry.bucket}, ${entry.method}, ${entry.route}, ${entry.count}, ${entry.errorCount},
                ${entry.clientErrorCount}, ${Math.round(entry.totalMs)}, ${p50}, ${p95}, ${Math.round(entry.maxMs)})
        ON CONFLICT ("bucket", "method", "route") DO UPDATE SET
          "count" = "RequestMetric"."count" + EXCLUDED."count",
          "errorCount" = "RequestMetric"."errorCount" + EXCLUDED."errorCount",
          "clientErrorCount" = "RequestMetric"."clientErrorCount" + EXCLUDED."clientErrorCount",
          "totalMs" = "RequestMetric"."totalMs" + EXCLUDED."totalMs",
          "p50Ms" = GREATEST("RequestMetric"."p50Ms", EXCLUDED."p50Ms"),
          "p95Ms" = GREATEST("RequestMetric"."p95Ms", EXCLUDED."p95Ms"),
          "maxMs" = GREATEST("RequestMetric"."maxMs", EXCLUDED."maxMs")`
    } catch (error) {
      console.error('[metrics] flush failed:', error instanceof Error ? error.message : error)
    }
  }
  return entries.length
}
