import jwt from 'jsonwebtoken'
import type { UserRole } from '@prisma/client'
import { env } from '../config/env.js'

/** Identity attached to `res.locals.user`; always re-read from the DB, never trusted from the token. */
export type AuthTokenPayload = {
  id: string
  email: string
  name: string
  role: UserRole
}

/** What the JWT itself carries: who, and which revocable server-side session. */
type AccessTokenClaims = { sub: string; sid: string }

export function signAccessToken(userId: string, sessionId: string, expiresAt: Date) {
  return jwt.sign({ sid: sessionId } satisfies Omit<AccessTokenClaims, 'sub'>, env.JWT_SECRET, {
    subject: userId,
    expiresIn: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    algorithm: 'HS256',
  })
}

export function verifyAccessToken(token: string): { userId: string; sessionId: string } {
  const claims = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as Partial<AccessTokenClaims>
  if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw new Error('Legacy or malformed token')
  return { userId: claims.sub, sessionId: claims.sid }
}
