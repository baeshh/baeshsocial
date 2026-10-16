import { AIUsageStatus, UserRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { getLlmProvider } from '../../services/ai/index.js'

/** Platform operator view of AI cost, quality, usage and errors. */
export const aiAdminRouter = Router()

aiAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

const usageQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(180).default(30) })

const num = (value: unknown) => Number(value ?? 0)

aiAdminRouter.get('/usage', async (req, res, next) => {
  try {
    const { days } = usageQuerySchema.parse(req.query)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
    const where = { createdAt: { gte: since } }

    const [byStatus, byFeature, byModel, daily, latency, monthCost, recentErrors, topUsers] = await Promise.all([
      prisma.aIUsageLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.aIUsageLog.groupBy({
        by: ['feature', 'status'],
        where,
        _count: { _all: true },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true, validationIssues: true },
        _avg: { latencyMs: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['provider', 'model'],
        where,
        _count: { _all: true },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      prisma.$queryRaw<{ day: Date; calls: bigint; errors: bigint; cost: unknown; issues: bigint | null }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               count(*) AS calls,
               count(*) FILTER (WHERE status <> 'SUCCESS') AS errors,
               coalesce(sum("costUsd"), 0) AS cost,
               coalesce(sum("validationIssues"), 0) AS issues
        FROM "AIUsageLog" WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      prisma.$queryRaw<{ p50: number | null; p95: number | null; avg: number | null }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95,
               avg("latencyMs") AS avg
        FROM "AIUsageLog" WHERE "createdAt" >= ${since} AND status = 'SUCCESS' AND "latencyMs" IS NOT NULL`,
      prisma.aIUsageLog.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
      prisma.aIUsageLog.findMany({
        where: { ...where, status: { not: AIUsageStatus.SUCCESS } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          feature: true,
          provider: true,
          model: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          attempts: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { _all: true },
        _sum: { costUsd: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
    ])

    const users = await prisma.user.findMany({
      where: { id: { in: topUsers.map((u) => u.userId!).filter(Boolean) } },
      select: { id: true, name: true, email: true },
    })
    const totalCalls = byStatus.reduce((sum, row) => sum + row._count._all, 0)
    const success = byStatus.find((row) => row.status === AIUsageStatus.SUCCESS)?._count._all ?? 0

    const features = new Map<
      string,
      { feature: string; calls: number; success: number; errors: number; costUsd: number; inputTokens: number; outputTokens: number; validationIssues: number; latencyWeighted: number }
    >()
    for (const row of byFeature) {
      const entry = features.get(row.feature) ?? {
        feature: row.feature,
        calls: 0,
        success: 0,
        errors: 0,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        validationIssues: 0,
        latencyWeighted: 0,
      }
      const count = row._count._all
      entry.calls += count
      if (row.status === AIUsageStatus.SUCCESS) {
        entry.success += count
        entry.validationIssues += num(row._sum.validationIssues)
        entry.latencyWeighted += num(row._avg.latencyMs) * count
      } else {
        entry.errors += count
      }
      entry.costUsd += num(row._sum.costUsd)
      entry.inputTokens += num(row._sum.inputTokens)
      entry.outputTokens += num(row._sum.outputTokens)
      features.set(row.feature, entry)
    }

    const provider = getLlmProvider()
    const featureRows = [...features.values()].map(({ latencyWeighted, ...row }) => ({
      ...row,
      successRate: row.calls ? Math.round((row.success / row.calls) * 1000) / 10 : null,
      avgLatencyMs: row.success ? Math.round(latencyWeighted / row.success) : null,
      issuesPerCall: row.success ? Math.round((row.validationIssues / row.success) * 100) / 100 : null,
    }))
    res.status(200).json({
      days,
      since: since.toISOString(),
      config: {
        provider: provider.name,
        model: provider.model,
        dailyLimitPerUser: env.AI_DAILY_LIMIT_PER_USER,
        monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD ?? null,
        monthToDateCostUsd: num(monthCost._sum.costUsd),
        timeoutMs: env.AI_TIMEOUT_MS,
        maxRetries: env.AI_MAX_RETRIES,
      },
      totals: {
        calls: totalCalls,
        success,
        successRate: totalCalls ? Math.round((success / totalCalls) * 1000) / 10 : null,
        costUsd: featureRows.reduce((sum, row) => sum + row.costUsd, 0),
        inputTokens: featureRows.reduce((sum, row) => sum + row.inputTokens, 0),
        outputTokens: featureRows.reduce((sum, row) => sum + row.outputTokens, 0),
        validationIssues: featureRows.reduce((sum, row) => sum + row.validationIssues, 0),
        latency: {
          p50: latency[0]?.p50 === null || latency[0]?.p50 === undefined ? null : Math.round(num(latency[0].p50)),
          p95: latency[0]?.p95 === null || latency[0]?.p95 === undefined ? null : Math.round(num(latency[0].p95)),
          avg: latency[0]?.avg === null || latency[0]?.avg === undefined ? null : Math.round(num(latency[0].avg)),
        },
      },
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status.toLowerCase(), row._count._all])),
      byFeature: featureRows.sort((a, b) => b.calls - a.calls),
      byModel: byModel.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: row._count._all,
        costUsd: num(row._sum.costUsd),
        inputTokens: num(row._sum.inputTokens),
        outputTokens: num(row._sum.outputTokens),
      })),
      daily: daily.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        calls: num(row.calls),
        errors: num(row.errors),
        costUsd: num(row.cost),
        validationIssues: num(row.issues),
      })),
      topUsers: topUsers.map((row) => {
        const user = users.find((u) => u.id === row.userId)
        return { userId: row.userId, name: user?.name ?? '(삭제됨)', email: user?.email ?? null, calls: row._count._all, costUsd: num(row._sum.costUsd) }
      }),
      recentErrors: recentErrors.map((row) => ({ ...row, status: row.status.toLowerCase() })),
    })
  } catch (error) {
    next(error)
  }
})
