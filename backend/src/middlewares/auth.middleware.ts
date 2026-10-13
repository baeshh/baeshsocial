import type { RequestHandler } from 'express'
import type { UserRole } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { verifyAccessToken, type AuthTokenPayload } from '../utils/auth.js'

export const authenticate: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({ message: 'Authentication required' })
    return
  }

  let payload: AuthTokenPayload
  try {
    payload = verifyAccessToken(token)
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
    return
  }

  try {
    // Role comes from the DB, never from the token, so demotions apply to already-issued JWTs.
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, name: true, role: true },
    })

    if (!user) {
      res.status(401).json({ message: 'Invalid or expired token' })
      return
    }

    res.locals.user = user satisfies AuthTokenPayload
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
