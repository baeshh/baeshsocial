import { OrganizationMemberStatus, UserRole, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { limits } from '../../middlewares/rateLimit.js'
import { audit } from '../../services/audit/audit.js'
import { revokeSession, revokeUserSessions, startSession } from '../../services/auth/sessions.js'
import { acceptInviteToken } from '../../services/onboarding/invites.js'
import { changePasswordSchema, loginSchema, registerSchema } from '../../validators/auth.validator.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { serializeMember, serializeOrganization } from '../../utils/organizations.js'
import { serializeUser } from '../../utils/users.js'

export const authRouter = Router()

// Compared against when the email does not exist, so response time does not reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('baesh-timing-equalizer', 12)

authRouter.post('/register', limits.register, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body)
    const email = input.email.toLowerCase()
    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      res.status(409).json({ message: 'Email is already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(input.password, 12)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: input.name,
        // Platform roles are never taken from the client; elevated roles are granted by an admin.
        role: UserRole.USER,
        passwordChangedAt: new Date(),
        profile: { create: {} },
      },
    })

    const session = await startSession(user.id, req)
    res.locals.user = { id: user.id, email: user.email, name: user.name, role: user.role }
    await audit(req, res, { action: 'auth.register', targetType: 'user', targetId: user.id })

    let invite: Awaited<ReturnType<typeof acceptInviteToken>> | null = null
    if (input.inviteToken) {
      try {
        invite = await acceptInviteToken(input.inviteToken, { id: user.id, email: user.email, name: user.name }, req, res)
      } catch (error) {
        // The account is created either way; the invite problem is reported to the client.
        invite = null
        res.locals.inviteError = error instanceof HttpError ? error.message : '초대 수락에 실패했습니다.'
      }
    }

    res.status(201).json({
      token: session.token,
      user: serializeUser(user),
      ...(invite ? { invite } : {}),
      ...(res.locals.inviteError ? { inviteError: res.locals.inviteError } : {}),
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login', limits.loginIp, limits.loginAccount, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body)
    const email = input.email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email } })

    const passwordMatches = await bcrypt.compare(input.password, user?.password ?? DUMMY_HASH)
    if (!user || !passwordMatches) {
      await audit(req, res, {
        action: 'auth.login',
        outcome: 'failure',
        actor: { id: user?.id ?? null, email },
        metadata: { reason: user ? 'bad_password' : 'unknown_email' },
      })
      res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.', code: 'invalid_credentials' })
      return
    }

    if (user.status !== UserStatus.ACTIVE) {
      await audit(req, res, { action: 'auth.login', outcome: 'denied', actor: { id: user.id, email }, metadata: { reason: 'suspended' } })
      res.status(403).json({ message: '이용이 정지된 계정입니다. 운영자에게 문의해 주세요.', code: 'account_suspended' })
      return
    }

    const session = await startSession(user.id, req)
    await audit(req, res, { action: 'auth.login', actor: { id: user.id, email }, targetType: 'session', targetId: session.sessionId })

    res.status(200).json({ token: session.token, user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    const sessionId = res.locals.sessionId as string
    await revokeSession(sessionId, 'logout')
    await audit(req, res, { action: 'auth.logout', targetType: 'session', targetId: sessionId })
    res.status(200).json({ message: 'Logged out' })
  } catch (error) {
    next(error)
  }
})

/** Signs out every other device, keeping the current one. */
authRouter.post('/logout-others', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const count = await revokeUserSessions(authUser.id, 'logout_others', res.locals.sessionId as string)
    await audit(req, res, { action: 'auth.logout_others', targetType: 'user', targetId: authUser.id, metadata: { count } })
    res.status(200).json({ revoked: count })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/sessions', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const sessions = await prisma.session.findMany({
      where: { userId: authUser.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true },
      take: 50,
    })
    res.status(200).json({
      sessions: sessions.map((session) => ({ ...session, current: session.id === res.locals.sessionId })),
    })
  } catch (error) {
    next(error)
  }
})

authRouter.delete('/sessions/:sessionId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const result = await prisma.session.updateMany({
      where: { id: String(req.params.sessionId), userId: authUser.id, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'user_revoked' },
    })
    if (result.count === 0) throw new HttpError(404, '세션을 찾을 수 없습니다.')
    await audit(req, res, { action: 'auth.session_revoke', targetType: 'session', targetId: String(req.params.sessionId) })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

/** Changing the password signs out every other session. */
authRouter.post('/password', authenticate, limits.passwordChange, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = changePasswordSchema.parse(req.body)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id }, select: { password: true, email: true } })
    if (!(await bcrypt.compare(input.currentPassword, user.password))) {
      await audit(req, res, { action: 'auth.password_change', outcome: 'failure', targetType: 'user', targetId: authUser.id })
      throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.')
    }
    if (input.newPassword === input.currentPassword) throw new HttpError(400, '새 비밀번호가 현재 비밀번호와 같습니다.')
    if (input.newPassword.toLowerCase().includes(user.email.split('@')[0].toLowerCase())) {
      throw new HttpError(400, '비밀번호에 이메일 아이디를 포함할 수 없습니다.')
    }
    await prisma.user.update({
      where: { id: authUser.id },
      data: { password: await bcrypt.hash(input.newPassword, 12), passwordChangedAt: new Date() },
    })
    const revoked = await revokeUserSessions(authUser.id, 'password_changed', res.locals.sessionId as string)
    await audit(req, res, { action: 'auth.password_change', targetType: 'user', targetId: authUser.id, metadata: { revokedSessions: revoked } })
    res.status(200).json({ message: '비밀번호를 변경했습니다. 다른 기기의 로그인은 모두 종료되었습니다.', revokedSessions: revoked })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      include: {
        organizationMemberships: {
          where: { status: OrganizationMemberStatus.ACTIVE },
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.status(200).json({
      user: serializeUser(user),
      organizations: user.organizationMemberships.map((membership) => ({
        ...serializeMember(membership),
        organization: serializeOrganization(membership.organization, { viewerRole: membership.role }),
      })),
    })
  } catch (error) {
    next(error)
  }
})
