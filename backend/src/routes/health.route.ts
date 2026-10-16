import { Router } from 'express'
import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'

export const healthRouter = Router()

const startedAt = new Date()

/** Liveness: the process is up. Used by the load balancer and deploy health checks. */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'baesh-v2-api',
    version: env.APP_VERSION,
    environment: env.APP_ENV,
    startedAt: startedAt.toISOString(),
    timestamp: new Date().toISOString(),
  })
})

/** Readiness: the database answers. Returns 503 so deploys roll back and uptime checks alert. */
healthRouter.get('/health/ready', async (_req, res) => {
  const started = Date.now()
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 3000)),
    ])
    res.status(200).json({ status: 'ok', version: env.APP_VERSION, db: { ok: true, latencyMs: Date.now() - started } })
  } catch {
    res.status(503).json({ status: 'degraded', version: env.APP_VERSION, db: { ok: false } })
  }
})
