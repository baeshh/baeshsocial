import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { loginSchema, registerSchema } from '../../validators/auth.validator.js'
import { signAccessToken, type AuthTokenPayload } from '../../utils/auth.js'
import { toUserRole } from '../../utils/roles.js'
import { serializeUser } from '../../utils/users.js'

export const authRouter = Router()

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body)
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    })

    if (existingUser) {
      res.status(409).json({ message: 'Email is already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(input.password, 12)
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        password: hashedPassword,
        name: input.name,
        role: toUserRole(input.role),
        profile: {
          create: {},
        },
      },
    })

    const token = signAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })

    res.status(201).json({
      token,
      user: serializeUser(user),
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    })

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password)

    if (!passwordMatches) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    const token = signAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    })

    res.status(200).json({
      token,
      user: serializeUser(user),
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/logout', (_req, res) => {
  res.status(200).json({ message: 'Logged out' })
})

authRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    res.status(200).json({ user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
})
