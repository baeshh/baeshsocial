/** Runs the hourly maintenance jobs once (subscriptions, invoices, usage snapshot, retention, ops checks). */
import 'dotenv/config'

const { runHourlyJobs } = await import('../src/services/jobs/scheduler.js')
const { prisma } = await import('../src/config/prisma.js')

const report = await runHourlyJobs()
console.log(JSON.stringify(report, null, 2))
await prisma.$disconnect()
