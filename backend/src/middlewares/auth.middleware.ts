import type { RequestHandler } from 'express'
import type { UserRole } from '@prisma/client'
import { verifyAccessToken, type AuthTokenPayload } from '../utils/auth.js'

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  try {
    res.locals.user = verifyAccessToken(token)
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
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
