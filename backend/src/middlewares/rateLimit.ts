import type { Request, RequestHandler, Response } from 'express'
import { env } from '../config/env.js'
import { clientIp } from '../services/auth/sessions.js'
import type { AuthTokenPayload } from '../utils/auth.js'

type Bucket = { count: number; resetAt: number }

/**
 * In-memory fixed-window counters. The API runs as a single process per server (PM2 fork mode),
 * so counts are exact per server; behind several servers each one enforces its own window.
 */
const buckets = new Map<string, Bucket>()

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}, 60_000).unref()

export function resetRateLimits() {
  buckets.clear()
}

type RateLimitOptions = {
  name: string
  windowMs: number
  max: number
  key: (req: Request, res: Response) => string | null
  message?: string
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    if (!env.RATE_LIMIT_ENABLED) return next()
    const subject = options.key(req, res)
    if (!subject) return next()
    const key = `${options.name}:${subject}`
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    const remaining = Math.max(0, options.max - bucket.count)
    res.setHeader('RateLimit-Limit', String(options.max))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)))
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      res.status(429).json({ message: options.message ?? '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' })
      return
    }
    next()
  }
}

const MINUTE = 60_000
const byIp = (req: Request) => clientIp(req)
const byUser = (_req: Request, res: Response) => (res.locals.user as AuthTokenPayload | undefined)?.id ?? null

export const limits = {
  global: rateLimit({ name: 'global', windowMs: MINUTE, max: env.RATE_LIMIT_GLOBAL_PER_MIN, key: byIp }),
  loginIp: rateLimit({
    name: 'login-ip',
    windowMs: 15 * MINUTE,
    max: 30,
    key: byIp,
    message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.',
  }),
  loginAccount: rateLimit({
    name: 'login-account',
    windowMs: 15 * MINUTE,
    max: 10,
    key: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null
      return email ? `${clientIp(req)}|${email}` : null
    },
    message: '이 계정에 대한 로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.',
  }),
  register: rateLimit({
    name: 'register',
    windowMs: 60 * MINUTE,
    max: 5,
    key: byIp,
    message: '회원가입 요청이 너무 많습니다. 1시간 후 다시 시도해 주세요.',
  }),
  passwordChange: rateLimit({ name: 'password', windowMs: 15 * MINUTE, max: 5, key: byUser }),
  upload: rateLimit({
    name: 'upload',
    windowMs: 60 * MINUTE,
    max: 60,
    key: byUser,
    message: '파일 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  }),
  inviteAccept: rateLimit({ name: 'invite-accept', windowMs: 15 * MINUTE, max: 30, key: byIp }),
  bulkInvite: rateLimit({ name: 'bulk-invite', windowMs: 60 * MINUTE, max: 20, key: byUser }),
}
