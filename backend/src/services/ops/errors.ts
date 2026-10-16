import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { sendAlert } from './alerts.js'
import { normalizeRoute } from './metrics.js'

type SentryLike = {
  init: (options: Record<string, unknown>) => void
  captureException: (error: unknown, context?: Record<string, unknown>) => void
}

let sentry: SentryLike | null = null

export async function initErrorReporting() {
  if (!env.SENTRY_DSN) return
  try {
    const module = (await import('@sentry/node')) as unknown as SentryLike
    module.init({
      dsn: env.SENTRY_DSN,
      environment: env.APP_ENV,
      release: env.APP_VERSION,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    })
    sentry = module
  } catch (error) {
    console.error('[errors] Sentry init failed:', error instanceof Error ? error.message : error)
  }
}

const SECRET_PATTERN = /(bearer\s+)[a-z0-9._-]+|(password|token|secret|api[_-]?key)["'=:\s]+[^\s"',}]+/gi

function scrub(text: string) {
  return text.replace(SECRET_PATTERN, (_match, bearer: string | undefined, key: string | undefined) =>
    bearer ? `${bearer}[redacted]` : `${key}=[redacted]`,
  )
}

/** Same error at the same place groups together regardless of ids or numbers in the message. */
function fingerprintOf(error: Error, route: string | null) {
  const frame = (error.stack ?? '').split('\n').find((line) => line.includes('/src/')) ?? ''
  const message = error.message.replace(/[0-9a-f]{8,}|\d+/gi, '#').slice(0, 200)
  return createHash('sha256').update(`${error.name}|${message}|${frame.trim()}|${route ?? ''}`).digest('hex').slice(0, 40)
}

/** Records an unexpected (5xx) error. Never throws. */
export async function captureError(error: unknown, req?: Request, res?: Response) {
  const err = error instanceof Error ? error : new Error(String(error))
  const route = req ? normalizeRoute(req) : null
  const requestId = (res?.locals.requestId as string | undefined) ?? null
  const userId = (res?.locals.user as { id?: string } | undefined)?.id ?? null
  console.error(`[error] ${requestId ?? '-'} ${req?.method ?? ''} ${route ?? ''}`, err)

  sentry?.captureException(err, { tags: { route, requestId }, user: userId ? { id: userId } : undefined })

  try {
    const fingerprint = fingerprintOf(err, route)
    const now = new Date()
    const existing = await prisma.errorEvent.findUnique({ where: { fingerprint }, select: { id: true, resolvedAt: true } })
    const message = scrub(err.message).slice(0, 1000)
    const stack = err.stack ? scrub(err.stack).slice(0, 8000) : null
    if (existing) {
      await prisma.errorEvent.update({
        where: { fingerprint },
        data: { count: { increment: 1 }, lastSeenAt: now, lastUserId: userId, lastRequestId: requestId, message, stack, resolvedAt: null },
      })
    } else {
      await prisma.errorEvent.create({
        data: { fingerprint, message, stack, route, method: req?.method ?? null, lastUserId: userId, lastRequestId: requestId },
      })
    }
    if (!existing || existing.resolvedAt) {
      const sent = await sendAlert(
        'critical',
        existing ? '해결된 서버 오류가 다시 발생했습니다' : '새 서버 오류가 발생했습니다',
        `${req?.method ?? ''} ${route ?? ''}\n${message}\nrequestId=${requestId ?? '-'}`,
        `error:${fingerprint}`,
      )
      if (sent) await prisma.errorEvent.update({ where: { fingerprint }, data: { alertedAt: now } })
    }
  } catch (persistError) {
    console.error('[errors] could not record error event:', persistError instanceof Error ? persistError.message : persistError)
  }
}
