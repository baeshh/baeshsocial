import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { updateMeSchema } from '../../validators/auth.validator.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { syncFollowNotification } from '../../utils/notifications.js'
import { serializeUser } from '../../utils/users.js'

export const usersRouter = Router()

usersRouter.get('/me', authenticate, async (_req, res, next) => {
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

usersRouter.post('/:id/follow', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const followingId = String(req.params.id)

    if (followingId === authUser.id) {
      res.status(400).json({ message: '자기 자신을 팔로우할 수 없습니다.' })
      return
    }

    const target = await prisma.user.findUnique({ where: { id: followingId } })
    if (!target) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const existingFollow = await prisma.userFollow.findUnique({
      where: {
        followerId_followingId: { followerId: authUser.id, followingId },
      },
    })

    if (!existingFollow) {
      await prisma.userFollow.create({
        data: { followerId: authUser.id, followingId },
      })
      try {
        await syncFollowNotification({
          userId: followingId,
          actorId: authUser.id,
          action: 'follow',
        })
      } catch (notificationError) {
        console.error('Follow notification failed:', notificationError)
      }
    }

    res.status(201).json({ ok: true })
  } catch (error) {
    next(error)
  }
})

usersRouter.delete('/:id/follow', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const followingId = String(req.params.id)

    const deleted = await prisma.userFollow.deleteMany({
      where: { followerId: authUser.id, followingId },
    })

    if (deleted.count > 0) {
      try {
        await syncFollowNotification({
          userId: followingId,
          actorId: authUser.id,
          action: 'unfollow',
        })
      } catch (notificationError) {
        console.error('Unfollow notification cleanup failed:', notificationError)
      }
    }

    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

usersRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = updateMeSchema.parse(req.body)
    const user = await prisma.user.update({
      where: { id: authUser.id },
      data: input,
    })

    res.status(200).json({ user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
})

const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  coverUrl: true,
  createdAt: true,
  updatedAt: true,
} as const

async function getViewerFollowingIds(viewerId: string) {
  const rows = await prisma.userFollow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  })
  return new Set(rows.map((row) => row.followingId))
}

usersRouter.get('/:id/followers', authenticate, async (req, res, next) => {
  try {
    const userId = String(req.params.id)
    const authUser = res.locals.user as AuthTokenPayload
    const viewerFollowingIds = await getViewerFollowingIds(authUser.id)

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const rows = await prisma.userFollow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      include: { follower: { select: userPublicSelect } },
    })

    res.status(200).json({
      users: rows.map((row) => ({
        ...serializeUser(row.follower),
        isFollowing: viewerFollowingIds.has(row.follower.id),
      })),
    })
  } catch (error) {
    next(error)
  }
})

usersRouter.get('/:id/following', authenticate, async (req, res, next) => {
  try {
    const userId = String(req.params.id)
    const authUser = res.locals.user as AuthTokenPayload
    const viewerFollowingIds = await getViewerFollowingIds(authUser.id)

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const rows = await prisma.userFollow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { following: { select: userPublicSelect } },
    })

    res.status(200).json({
      users: rows.map((row) => ({
        ...serializeUser(row.following),
        isFollowing: viewerFollowingIds.has(row.following.id),
      })),
    })
  } catch (error) {
    next(error)
  }
})

usersRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = String(req.params.id)
    const user = await prisma.user.findUnique({
      where: { id: userId },
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
