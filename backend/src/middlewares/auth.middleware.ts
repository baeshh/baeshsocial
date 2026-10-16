import type { RequestHandler } from 'express'
import type { UserRole } from '@prisma/client'
import { checkSession } from '../services/auth/sessions.js'
import { verifyAccessToken, type AuthTokenPayload } from '../utils/auth.js'

const SESSION_MESSAGES = {
  not_found: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
  revoked: '로그아웃되었거나 다른 곳에서 세션이 종료되었습니다. 다시 로그인해 주세요.',
  expired: '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.',
  idle: '오랫동안 사용하지 않아 로그아웃되었습니다. 다시 로그인해 주세요.',
  suspended: '이용이 정지된 계정입니다. 운영자에게 문의해 주세요.',
} as const

/**
 * Every request re-validates the server-side session and reloads role/status from the DB, so
 * logouts, password changes, suspensions and role changes apply to already-issued tokens.
 */
export const authenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  let claims: { userId: string; sessionId: string }
  try {
    claims = verifyAccessToken(token)
  } catch {
    res.status(401).json({ message: 'Invalid or expired token', code: 'invalid_token' })
    return
  }

  try {
    const result = await checkSession(claims.userId, claims.sessionId)
    if (!result.ok) {
      res
        .status(result.reason === 'suspended' ? 403 : 401)
        .json({ message: SESSION_MESSAGES[result.reason], code: `session_${result.reason}` })
      return
    }
    res.locals.user = result.user satisfies AuthTokenPayload
    res.locals.sessionId = claims.sessionId
    next()
  } catch (error) {
    next(error)
  }
}

/** Anonymous requests pass through with no `res.locals.user`; a bad token is still rejected. */
export const optionalAuthenticate: RequestHandler = (req, res, next) => {
  if (!req.headers.authorization) {
    next()
    return
  }
  return authenticate(req, res, next)
}

export function requireRoles(roles: UserRole[]): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.user as AuthTokenPayload | undefined

    if (!user) {
      res.status(401).json({ message: 'Authentication required' })
      return
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ message: 'Insufficient role permission' })
      return
    }

    next()
  }
}
