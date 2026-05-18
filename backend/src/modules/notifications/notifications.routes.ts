import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  cleanupDuplicateFollowNotifications,
  dedupeFollowNotifications,
} from '../../utils/notifications.js'

export const notificationsRouter = Router()

const actorSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} as const

notificationsRouter.get('/', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload

    await cleanupDuplicateFollowNotifications(authUser.id)

    const notifications = dedupeFollowNotifications(
      await prisma.notification.findMany({
        where: { userId: authUser.id },
        include: { actor: { select: actorSelect } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    )

    res.status(200).json({ notifications })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.get('/unread-count', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload

    await cleanupDuplicateFollowNotifications(authUser.id)

    const count = await prisma.notification.count({
      where: { userId: authUser.id, read: false },
    })

    res.status(200).json({ count })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.patch('/read-all', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload

    await prisma.notification.updateMany({
      where: { userId: authUser.id, read: false },
      data: { read: true },
    })

    res.status(200).json({ ok: true })
  } catch (error) {
    next(error)
  }
})

notificationsRouter.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const notificationId = String(req.params.id)

    const existing = await prisma.notification.findFirst({
      where: { id: notificationId, userId: authUser.id },
    })

    if (!existing) {
      res.status(404).json({ message: 'Notification not found' })
      return
    }

    const notification = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
      include: { actor: { select: actorSelect } },
    })

    res.status(200).json({ notification })
  } catch (error) {
    next(error)
  }
})
