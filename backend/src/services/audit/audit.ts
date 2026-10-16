import type { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { prisma } from '../../config/prisma.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { clientIp, clientUserAgent } from '../auth/sessions.js'

export type AuditEntry = {
  action: string
  organizationId?: string | null
  targetType?: string
  targetId?: string | null
  outcome?: 'success' | 'denied' | 'failure'
  metadata?: Record<string, unknown>
  /** Overrides the actor taken from `res.locals.user` (e.g. failed logins have no session). */
  actor?: { id?: string | null; email?: string | null }
}

const SECRET_KEYS = /password|token|secret|apikey|api_key|authorization/i

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? '[redacted]' : scrub(item, depth + 1),
      ]),
    )
  }
  if (typeof value === 'string') return value.slice(0, 500)
  return value
}

/**
 * Records a security-relevant action. Never throws: an audit write failure must not break the
 * user's request, but it is logged so it shows up in error monitoring.
 */
export async function audit(req: Request, res: Response, entry: AuditEntry) {
  const user = res.locals.user as AuthTokenPayload | undefined
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actor ? (entry.actor.id ?? null) : (user?.id ?? null),
        actorEmail: entry.actor ? (entry.actor.email ?? null) : (user?.email ?? null),
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        outcome: entry.outcome ?? 'success',
        metadata: entry.metadata ? (scrub(entry.metadata) as Prisma.InputJsonValue) : undefined,
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
        requestId: (res.locals.requestId as string | undefined) ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] write failed', entry.action, error instanceof Error ? error.message : error)
  }
}
