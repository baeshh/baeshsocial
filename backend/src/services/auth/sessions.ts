import type { Request } from 'express'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { signAccessToken } from '../../utils/auth.js'

const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export function clientIp(req: Request) {
  return (req.ip ?? req.socket.remoteAddress ?? '').replace(/^::ffff:/, '').slice(0, 64) || null
}

export function clientUserAgent(req: Request) {
  return req.get('user-agent')?.slice(0, 300) ?? null
}

/** Creates a revocable session and the JWT that points to it. */
export async function startSession(userId: string, req: Request) {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000)
  const session = await prisma.session.create({
    data: { userId, expiresAt, ip: clientIp(req), userAgent: clientUserAgent(req) },
    select: { id: true },
  })
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })
  return { sessionId: session.id, token: signAccessToken(userId, session.id, expiresAt), expiresAt }
}

export type SessionCheck =
  | { ok: true; user: { id: string; email: string; name: string; role: import('@prisma/client').UserRole } }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' | 'idle' | 'suspended' }

/** Validates the session behind a token and returns the current DB identity. */
export async function checkSession(userId: string, sessionId: string): Promise<SessionCheck> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      lastSeenAt: true,
      user: { select: { id: true, email: true, name: true, role: true, status: true } },
    },
  })
  if (!session || session.userId !== userId) return { ok: false, reason: 'not_found' }
  if (session.revokedAt) return { ok: false, reason: 'revoked' }
  const now = Date.now()
  if (session.expiresAt.getTime() <= now) return { ok: false, reason: 'expired' }
  if (now - session.lastSeenAt.getTime() > env.SESSION_IDLE_HOURS * 60 * 60 * 1000) {
    await revokeSession(sessionId, 'idle_timeout')
    return { ok: false, reason: 'idle' }
  }
  if (session.user.status !== 'ACTIVE') return { ok: false, reason: 'suspended' }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    void prisma.session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } }).catch(() => undefined)
  }
  const { status: _status, ...user } = session.user
  return { ok: true, user }
}

export async function revokeSession(sessionId: string, reason: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokeReason: reason },
  })
}

/** Signs a user out everywhere (optionally keeping the caller's current session). */
export async function revokeUserSessions(userId: string, reason: string, exceptSessionId?: string) {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokeReason: reason },
  })
  return result.count
}

/** Housekeeping: drop sessions that ended more than 30 days ago. */
export async function pruneSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const result = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  })
  return result.count
}
