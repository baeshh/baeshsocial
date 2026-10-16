import { app } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/prisma.js'
import { ensureDefaultPlans } from './services/billing/plans.js'
import { backfillTrialSubscriptions } from './services/billing/subscriptions.js'
import { startScheduler, stopScheduler } from './services/jobs/scheduler.js'
import { captureError, initErrorReporting } from './services/ops/errors.js'

await initErrorReporting()

try {
  await ensureDefaultPlans()
  const created = await backfillTrialSubscriptions()
  if (created) console.log(`[billing] created ${created} trial subscription(s) for approved organizations`)
} catch (error) {
  console.error('[billing] plan bootstrap failed:', error)
}

const server = app.listen(env.PORT, () => {
  console.log(`BAESH API ${env.APP_VERSION} (${env.APP_ENV}) listening on http://localhost:${env.PORT}`)
})
startScheduler()

process.on('unhandledRejection', (reason) => {
  void captureError(reason)
})

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[server] ${signal} received, draining connections`)
  const force = setTimeout(() => process.exit(1), 15_000)
  force.unref()
  server.close(async () => {
    await stopScheduler().catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
    process.exit(0)
  })
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
