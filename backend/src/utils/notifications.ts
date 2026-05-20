import type { NotificationType } from '@prisma/client'
import { prisma } from '../config/prisma.js'

type SocialNotificationType = Extract<
  NotificationType,
  'POST_LIKE' | 'POST_COMMENT' | 'COMMENT_REPLY' | 'FOLLOW'
>

function buildPostLink(postId: string, commentId?: string) {
  if (commentId) {
    return `/p/${postId}?comment=${commentId}`
  }
  return `/p/${postId}`
}

export async function createSocialNotification(params: {
  userId: string
  actorId: string
  type: SocialNotificationType
  postId?: string
  commentId?: string
  /** 게시물 작성자에게 보낼 때: 타인 댓글에 대한 답글 */
  postCommentKind?: 'comment' | 'reply'
}) {
  if (params.userId === params.actorId) {
    return
  }

  const actor = await prisma.user.findUnique({
    where: { id: params.actorId },
    select: { name: true },
  })

  if (!actor) {
    return
  }

  let title: string
  let body: string
  let link: string

  switch (params.type) {
    case 'POST_LIKE':
      title = '새 좋아요'
      body = `${actor.name}님이 회원님의 게시물에 좋아요를 눌렀습니다.`
      link = params.postId ? buildPostLink(params.postId) : '/network'
      break
    case 'POST_COMMENT':
      if (params.postCommentKind === 'reply') {
        title = '게시물에 새 답글'
        body = `${actor.name}님이 회원님의 게시물에 답글을 남겼습니다.`
      } else {
        title = '새 댓글'
        body = `${actor.name}님이 회원님의 게시물에 댓글을 남겼습니다.`
      }
      link = params.postId ? buildPostLink(params.postId, params.commentId) : '/network'
      break
    case 'COMMENT_REPLY':
      title = '새 답글'
      body = `${actor.name}님이 회원님의 댓글에 답글을 남겼습니다.`
      link = params.postId ? buildPostLink(params.postId, params.commentId) : '/network'
      break
    case 'FOLLOW':
      title = '새 팔로워'
      body = `${actor.name}님이 회원님을 팔로우했습니다. 프로그램·이력 소식을 확인해 보세요.`
      link = `/profile/${params.actorId}?section=updates`
      break
    default:
      return
  }

  await prisma.notification.create({
    data: {
      userId: params.userId,
      actorId: params.actorId,
      title,
      body,
      type: params.type,
      link,
    },
  })
}

async function safeCreateSocialNotification(
  params: Parameters<typeof createSocialNotification>[0],
) {
  try {
    await createSocialNotification(params)
  } catch (error) {
    console.error(`Notification failed (${params.type} → ${params.userId}):`, error)
  }
}

/** 댓글·대댓글 작성 시 관련 사용자에게 알림 (한 건 실패해도 나머지는 시도) */
export async function notifyCommentCreated(params: {
  actorId: string
  postId: string
  postAuthorId: string
  commentId: string
  parentAuthorId?: string | null
}) {
  const { actorId, postId, postAuthorId, commentId, parentAuthorId } = params

  if (parentAuthorId) {
    await safeCreateSocialNotification({
      userId: parentAuthorId,
      actorId,
      type: 'COMMENT_REPLY',
      postId,
      commentId,
    })

    if (postAuthorId !== parentAuthorId) {
      await safeCreateSocialNotification({
        userId: postAuthorId,
        actorId,
        type: 'POST_COMMENT',
        postId,
        commentId,
        postCommentKind: 'reply',
      })
    }
    return
  }

  await safeCreateSocialNotification({
    userId: postAuthorId,
    actorId,
    type: 'POST_COMMENT',
    postId,
    commentId,
    postCommentKind: 'comment',
  })
}

const followNotificationWhere = (userId: string, actorId: string) => ({
  userId,
  actorId,
  type: 'FOLLOW' as const,
})

/** 팔로우 알림은 동일 사용자당 1건만 유지하고, 언팔로우 시 제거합니다. */
export async function syncFollowNotification(params: {
  userId: string
  actorId: string
  action: 'follow' | 'unfollow'
}) {
  if (params.userId === params.actorId) {
    return
  }

  const where = followNotificationWhere(params.userId, params.actorId)

  if (params.action === 'unfollow') {
    await prisma.notification.deleteMany({ where })
    return
  }

  const actor = await prisma.user.findUnique({
    where: { id: params.actorId },
    select: { name: true },
  })

  if (!actor) {
    return
  }

  const title = '새 팔로워'
  const body = `${actor.name}님이 회원님을 팔로우했습니다. 프로그램·이력 소식을 확인해 보세요.`
  const link = `/profile/${params.actorId}?section=updates`

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where })
    await tx.notification.create({
      data: {
        ...where,
        title,
        body,
        link,
        read: false,
      },
    })
  })
}

/** 기존에 쌓인 중복 팔로우 알림을 정리합니다 (actor당 최신 1건만 유지). */
export async function cleanupDuplicateFollowNotifications(userId: string) {
  const followNotifications = await prisma.notification.findMany({
    where: { userId, type: 'FOLLOW' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, actorId: true },
  })

  const seenActorIds = new Set<string>()
  const duplicateIds: string[] = []

  for (const notification of followNotifications) {
    if (!notification.actorId) {
      continue
    }
    if (seenActorIds.has(notification.actorId)) {
      duplicateIds.push(notification.id)
      continue
    }
    seenActorIds.add(notification.actorId)
  }

  if (duplicateIds.length > 0) {
    await prisma.notification.deleteMany({
      where: { id: { in: duplicateIds } },
    })
  }
}

export function dedupeFollowNotifications<T extends { type: string; actorId: string | null }>(
  notifications: T[],
): T[] {
  const seenActorIds = new Set<string>()

  return notifications.filter((notification) => {
    if (notification.type !== 'FOLLOW' || !notification.actorId) {
      return true
    }
    if (seenActorIds.has(notification.actorId)) {
      return false
    }
    seenActorIds.add(notification.actorId)
    return true
  })
}
