import {
  InvoiceStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  SubscriptionStatus,
} from '@prisma/client'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { pruneSessions } from '../auth/sessions.js'
import { computeOrgUsage } from '../billing/entitlements.js'
import { currentOrgSubscription, daysLeft } from '../billing/subscriptions.js'
import { sendMail } from '../mail/mail.js'
import { sendAlert } from '../ops/alerts.js'
import { flushRequestMetrics } from '../ops/metrics.js'
import { expireProgramOffers } from '../programs/applicationOffers.js'
import { backupFreshness } from '../ops/opsRuns.js'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const EXPIRY_NOTICE_DAYS = [30, 14, 7, 1]

const RETENTION = {
  requestMetricsDays: 14,
  auditLogDays: 3 * 365,
  resolvedErrorDays: 90,
}

async function orgAdmins(organizationId: string) {
  return prisma.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } },
    select: { userId: true, user: { select: { email: true } } },
  })
}

/** Notification + mail to org admins, at most once per `dedupeKey` (tracked in the audit log). */
async function noticeOnce(organizationId: string, dedupeKey: string, title: string, body: string) {
  const exists = await prisma.auditLog.count({ where: { action: 'system.notice', organizationId, targetId: dedupeKey } })
  if (exists) return false
  const admins = await orgAdmins(organizationId)
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.userId,
        fromPlatform: true,
        type: 'SYSTEM' as const,
        title,
        body,
        link: `/org/${organizationId}?tab=billing`,
      })),
    })
    for (const admin of admins) {
      await sendMail({ to: admin.user.email, subject: `[BAESH] ${title}`, text: body }).catch(() => undefined)
    }
  }
  await prisma.auditLog.create({
    data: { action: 'system.notice', organizationId, targetType: 'notice', targetId: dedupeKey, metadata: { title, recipients: admins.length } },
  })
  return true
}

/** Expiry/grace transitions and advance notices. Data is never deleted, only made read-only. */
export async function runSubscriptionLifecycle(now = new Date()) {
  const result = { expired: 0, notices: 0 }
  const candidates = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      endsAt: { not: null, lte: now },
    },
    select: { id: true, endsAt: true, graceDays: true },
  })
  for (const sub of candidates) {
    if (sub.endsAt!.getTime() + sub.graceDays * DAY <= now.getTime()) {
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: SubscriptionStatus.EXPIRED } })
      result.expired += 1
    }
  }

  const orgs = await prisma.organization.findMany({
    where: { verificationStatus: OrganizationVerificationStatus.APPROVED },
    select: { id: true, name: true },
  })
  for (const org of orgs) {
    const sub = await currentOrgSubscription(org.id)
    if (!sub?.endsAt) continue
    const left = daysLeft(sub, now)
    if (left === null) continue
    const graceEnd = new Date(sub.endsAt.getTime() + sub.graceDays * DAY)
    if (left > 0 && EXPIRY_NOTICE_DAYS.includes(left)) {
      const sent = await noticeOnce(
        org.id,
        `expiry:${sub.id}:${left}`,
        `이용 기간 만료 ${left}일 전입니다`,
        `${org.name}의 ${sub.plan.name} 이용 기간이 ${sub.endsAt.toISOString().slice(0, 10)}에 끝납니다. 종료 후 ${sub.graceDays}일 동안은 조회·다운로드만 가능합니다. 갱신은 BAESH 운영팀에 문의해 주세요.`,
      )
      if (sent) result.notices += 1
    } else if (left <= 0 && now < graceEnd) {
      const sent = await noticeOnce(
        org.id,
        `grace:${sub.id}`,
        '이용 기간이 끝나 유예 기간이 시작되었습니다',
        `${org.name}: ${graceEnd.toISOString().slice(0, 10)}까지 기존 자료 조회·다운로드만 가능하며 새 프로그램·증빙·보고서는 만들 수 없습니다. 데이터는 삭제되지 않습니다.`,
      )
      if (sent) result.notices += 1
    } else if (now >= graceEnd) {
      const sent = await noticeOnce(
        org.id,
        `expired:${sub.id}`,
        '이용 기간과 유예 기간이 모두 끝났습니다',
        `${org.name}은(는) 읽기 전용 상태입니다. 데이터는 그대로 보관되며, 계약을 갱신하면 즉시 이어서 사용할 수 있습니다.`,
      )
      if (sent) result.notices += 1
    }
  }
  return result
}

/** ISSUED invoices past their due date become OVERDUE and their subscription PAST_DUE. */
export async function runInvoiceLifecycle(now = new Date()) {
  const overdue = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.ISSUED, dueAt: { lt: now } },
    select: { id: true, invoiceNo: true, organizationId: true, subscriptionId: true, totalKrw: true, dueAt: true },
  })
  for (const invoice of overdue) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: InvoiceStatus.OVERDUE } })
    if (invoice.subscriptionId) {
      await prisma.subscription.updateMany({
        where: { id: invoice.subscriptionId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] } },
        data: { status: SubscriptionStatus.PAST_DUE },
      })
    }
    if (invoice.organizationId) {
      await noticeOnce(
        invoice.organizationId,
        `overdue:${invoice.id}`,
        '납부 기한이 지난 청구서가 있습니다',
        `${invoice.invoiceNo} · ${invoice.totalKrw.toLocaleString('ko-KR')}원 (기한 ${invoice.dueAt?.toISOString().slice(0, 10)}). 서비스는 계속 이용할 수 있으며, 입금 확인 시 자동으로 정상 상태로 돌아갑니다.`,
      )
    }
  }
  if (overdue.length) {
    await sendAlert('warning', `연체 청구서 ${overdue.length}건`, overdue.map((invoice) => invoice.invoiceNo).join(', '), `overdue:${now.toISOString().slice(0, 10)}`)
  }
  return { overdue: overdue.length }
}

/** Daily usage snapshot per organization (latest value of the day wins). */
export async function snapshotUsage(now = new Date()) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const orgs = await prisma.organization.findMany({
    where: { verificationStatus: OrganizationVerificationStatus.APPROVED },
    select: { id: true },
  })
  let rows = 0
  for (const org of orgs) {
    const sub = await currentOrgSubscription(org.id)
    const usage = await computeOrgUsage(org.id, sub)
    const values: Record<string, number> = {
      members: usage.members,
      activePrograms: usage.activePrograms,
      projects: usage.projects,
      storageMb: Math.round(usage.storageGb * 1024),
      reportsPerPeriod: usage.reportsPerPeriod,
      talentSearchesPerMonth: usage.talentSearchesPerMonth,
      aiCallsPerDay: usage.aiCallsPerDay,
    }
    for (const [metric, value] of Object.entries(values)) {
      await prisma.usageRecord.upsert({
        where: { organizationId_metric_day: { organizationId: org.id, metric, day } },
        create: { organizationId: org.id, subscriptionId: sub?.id ?? null, metric, value: BigInt(value), day },
        update: { value: BigInt(value), subscriptionId: sub?.id ?? null, recordedAt: new Date() },
      })
      rows += 1
    }
  }
  return { rows }
}

export async function runRetention(now = new Date()) {
  const [sessions, metrics, audits, errors] = await Promise.all([
    pruneSessions(),
    prisma.requestMetric.deleteMany({ where: { bucket: { lt: new Date(now.getTime() - RETENTION.requestMetricsDays * DAY) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION.auditLogDays * DAY) } } }),
    prisma.errorEvent.deleteMany({ where: { resolvedAt: { lt: new Date(now.getTime() - RETENTION.resolvedErrorDays * DAY) } } }),
  ])
  return { sessions, requestMetrics: metrics.count, auditLogs: audits.count, errorEvents: errors.count }
}

export async function runOpsChecks(now = new Date()) {
  const findings: string[] = []
  if (env.AI_DAILY_COST_ALERT_USD) {
    const spent = await prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: new Date(now.getTime() - DAY) } }, _sum: { costUsd: true } })
    const cost = Number(spent._sum.costUsd ?? 0)
    if (cost >= env.AI_DAILY_COST_ALERT_USD) {
      findings.push('ai_cost')
      await sendAlert('warning', `AI 비용이 24시간 기준 $${cost.toFixed(2)}입니다`, `알림 기준 $${env.AI_DAILY_COST_ALERT_USD}`, `ai-cost:${now.toISOString().slice(0, 10)}`)
    }
  }
  if (env.APP_ENV === 'production') {
    const freshness = await backupFreshness()
    if (!freshness.backupFresh) {
      findings.push('backup_stale')
      await sendAlert('critical', '최근 26시간 안에 성공한 DB 백업이 없습니다', '백업 타이머와 S3 업로드 로그를 확인하세요.', 'backup-stale')
    }
    if (!freshness.restoreDrillFresh) {
      findings.push('restore_drill_stale')
      await sendAlert('warning', '최근 35일 안에 복원 훈련 기록이 없습니다', 'deploy/scripts/restore-drill.sh 를 실행해 주세요.', 'restore-drill-stale')
    }
  }
  return { findings }
}

/** 5xx rate over the last 10 minutes. */
export async function checkErrorRate(now = new Date()) {
  const [row] = await prisma.$queryRaw<{ requests: bigint | null; errors: bigint | null }[]>`
    SELECT SUM("count")::bigint AS requests, SUM("errorCount")::bigint AS errors
    FROM "RequestMetric" WHERE "bucket" >= ${new Date(now.getTime() - 10 * MINUTE)}`
  const requests = Number(row?.requests ?? 0)
  const errors = Number(row?.errors ?? 0)
  if (requests >= 50 && errors / requests >= 0.05) {
    await sendAlert('critical', `5xx 오류율 ${((errors / requests) * 100).toFixed(1)}% (최근 10분)`, `${errors}/${requests} 요청 실패`, 'error-rate')
    return true
  }
  return false
}

export async function runHourlyJobs(now = new Date()) {
  const steps = {
    subscriptions: () => runSubscriptionLifecycle(now),
    invoices: () => runInvoiceLifecycle(now),
    usage: () => snapshotUsage(now),
    programOffers: () => expireProgramOffers(now),
    retention: () => runRetention(now),
    ops: () => runOpsChecks(now),
  }
  const report: Record<string, unknown> = {}
  for (const [name, step] of Object.entries(steps)) {
    try {
      report[name] = await step()
    } catch (error) {
      report[name] = { error: error instanceof Error ? error.message : String(error) }
      console.error(`[jobs] ${name} failed:`, error)
      await sendAlert('warning', `정기 작업 실패: ${name}`, error instanceof Error ? error.message : String(error), `job:${name}`)
    }
  }
  return report
}

let timers: NodeJS.Timeout[] = []

/**
 * In-process scheduler. Enable it on exactly one instance per environment (JOBS_ENABLED=true);
 * request metrics are flushed on every instance.
 */
export function startScheduler() {
  let minute = 0
  const schedule = (timer: NodeJS.Timeout) => {
    timer.unref()
    timers.push(timer)
  }
  schedule(
    setInterval(() => {
      minute += 1
      void flushRequestMetrics()
        .then(() => (env.JOBS_ENABLED && minute % 5 === 0 ? checkErrorRate() : undefined))
        .catch(() => undefined)
    }, MINUTE),
  )
  if (!env.JOBS_ENABLED) return
  const hourly = () => void runHourlyJobs().catch((error) => console.error('[jobs] hourly failed', error))
  schedule(setTimeout(hourly, 30_000))
  schedule(setInterval(hourly, HOUR))
}

export async function stopScheduler() {
  for (const timer of timers) clearInterval(timer)
  timers = []
  await flushRequestMetrics()
}
