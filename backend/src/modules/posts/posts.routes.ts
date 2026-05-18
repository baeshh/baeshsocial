import { PostVisibility } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { commentSchema, postSchema, updatePostSchema } from '../../validators/post.validator.js'
import { createSocialNotification } from '../../utils/notifications.js'

export const postsRouter = Router()

const visibilityMap = {
  public: PostVisibility.PUBLIC,
  connections: PostVisibility.CONNECTIONS,
  private: PostVisibility.PRIVATE,
} as const

const authorSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const

const publicAuthorSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} as const

const linkedProjectSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  progress: true,
  skills: true,
} as const

const nestedPostInclude = {
  author: { select: authorSelect },
  linkedProject: { select: linkedProjectSelect },
  likes: {
    select: {
      id: true,
      userId: true,
      createdAt: true,
    },
  },
  comments: {
    include: {
      author: {
        select: authorSelect,
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const

const postInclude = {
  ...nestedPostInclude,
  repostOf: {
    include: nestedPostInclude,
  },
} as const

const publicNestedPostInclude = {
  author: { select: publicAuthorSelect },
  linkedProject: { select: linkedProjectSelect },
  likes: {
    select: {
      id: true,
      userId: true,
      createdAt: true,
    },
  },
  comments: {
    include: {
      author: {
        select: publicAuthorSelect,
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const

const publicPostInclude = {
  ...publicNestedPostInclude,
  repostOf: {
    include: publicNestedPostInclude,
  },
} as const

function extractHashtags(content: string): Set<string> {
  const tags = Array.from(content.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0].toLowerCase())
  return new Set(tags)
}

async function getFollowingIds(followerId: string): Promise<Set<string>> {
  const rows = await prisma.userFollow.findMany({
    where: { followerId },
    select: { followingId: true },
  })
  return new Set(rows.map((row) => row.followingId))
}

function buildFeedWhere(authUserId: string, followingIds: Set<string>) {
  const followingArr = [...followingIds]

  return {
    OR: [
      { visibility: PostVisibility.PUBLIC },
      { authorId: authUserId },
      ...(followingArr.length > 0
        ? [
            {
              AND: [
                { authorId: { in: followingArr } },
                { visibility: { in: [PostVisibility.PUBLIC, PostVisibility.CONNECTIONS] } },
              ],
            },
          ]
        : []),
    ],
  }
}

function buildPostData(input: ReturnType<typeof postSchema.parse>) {
  return {
    content: input.content.trim(),
    linkedProjectId: input.linkedProjectId,
    repostOfId: input.repostOfId ?? undefined,
    visibility: visibilityMap[input.visibility],
    mediaUrls: input.mediaUrls ?? [],
  }
}

function buildPostUpdateData(input: ReturnType<typeof updatePostSchema.parse>) {
  return {
    ...(input.content !== undefined ? { content: input.content.trim() } : {}),
    ...(input.linkedProjectId !== undefined ? { linkedProjectId: input.linkedProjectId } : {}),
    ...(input.visibility !== undefined ? { visibility: visibilityMap[input.visibility] } : {}),
    ...(input.mediaUrls !== undefined ? { mediaUrls: input.mediaUrls } : {}),
  }
}

async function requirePostOwner(postId: string, userId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } })

  if (!post) {
    throw new Error('POST_NOT_FOUND')
  }

  if (post.authorId !== userId) {
    throw new Error('POST_FORBIDDEN')
  }

  return post
}

function handlePostError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === 'POST_NOT_FOUND') {
    res.status(404).json({ message: 'Post not found' })
    return true
  }

  if (error instanceof Error && error.message === 'POST_FORBIDDEN') {
    res.status(403).json({ message: 'Only the post author can perform this action' })
    return true
  }

  return false
}

async function isPostPubliclyAccessible(postId: string): Promise<boolean> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { visibility: true, repostOfId: true },
  })

  if (!post || post.visibility !== PostVisibility.PUBLIC) {
    return false
  }

  if (post.repostOfId) {
    return isPostPubliclyAccessible(post.repostOfId)
  }

  return true
}

function sanitizePublicLinkedProject<T extends { visibility?: string } | null>(project: T): T | null {
  if (!project || project.visibility !== 'PUBLIC') {
    return null
  }
  return project
}

type PublicPostRecord = {
  linkedProject: { visibility?: string } | null
  repostOf: PublicPostRecord | null
}

function sanitizePublicPost<T extends PublicPostRecord>(post: T): T {
  return {
    ...post,
    linkedProject: sanitizePublicLinkedProject(post.linkedProject),
    repostOf: post.repostOf ? sanitizePublicPost(post.repostOf) : null,
  }
}

/** 게시물이 viewer에게 피드/목록에서 보일 수 있는지 (단일 행 기준) */
async function canViewerSeePost(
  post: { authorId: string; visibility: PostVisibility },
  viewerId: string,
  followingIds: Set<string>,
) {
  if (post.authorId === viewerId) {
    return true
  }
  if (post.visibility === PostVisibility.PUBLIC) {
    return true
  }
  if (post.visibility === PostVisibility.PRIVATE) {
    return false
  }
  return followingIds.has(post.authorId)
}

postsRouter.get('/', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const followingIds = await getFollowingIds(authUser.id)
    const posts = await prisma.post.findMany({
      where: buildFeedWhere(authUser.id, followingIds),
      include: postInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.status(200).json({ posts })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/recommended', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8))
    const followingIds = await getFollowingIds(authUser.id)

    const [likes, myComments, myReposts] = await Promise.all([
      prisma.postLike.findMany({
        where: { userId: authUser.id },
        select: { postId: true },
      }),
      prisma.comment.findMany({
        where: { authorId: authUser.id },
        select: { postId: true },
      }),
      prisma.post.findMany({
        where: { authorId: authUser.id, repostOfId: { not: null } },
        select: { repostOfId: true },
      }),
    ])

    const engagedIds = new Set<string>()
    for (const row of likes) {
      engagedIds.add(row.postId)
    }
    for (const row of myComments) {
      engagedIds.add(row.postId)
    }
    for (const row of myReposts) {
      if (row.repostOfId) {
        engagedIds.add(row.repostOfId)
      }
    }

    const engagedPosts =
      engagedIds.size > 0
        ? await prisma.post.findMany({
            where: { id: { in: [...engagedIds] } },
            include: { likes: { select: { userId: true } } },
          })
        : []

    const userTags = new Set<string>()
    const userProjectIds = new Set<string>()
    const engagedUserIds = new Set<string>()
    const coLikerIds = new Set<string>()

    for (const ep of engagedPosts) {
      extractHashtags(ep.content).forEach((t) => userTags.add(t))
      if (ep.linkedProjectId) {
        userProjectIds.add(ep.linkedProjectId)
      }
      engagedUserIds.add(ep.authorId)
      for (const like of ep.likes) {
        if (like.userId !== authUser.id) {
          coLikerIds.add(like.userId)
        }
      }
    }

    const feedWhere = buildFeedWhere(authUser.id, followingIds)
    const candidates = await prisma.post.findMany({
      where: {
        AND: [
          feedWhere,
          { id: { notIn: [...engagedIds] } },
          { authorId: { not: authUser.id } },
        ],
      },
      take: 120,
      orderBy: { createdAt: 'desc' },
      include: postInclude,
    })

    const scorePost = (post: (typeof candidates)[0]) => {
      let score = 0
      if (followingIds.has(post.authorId)) {
        score += 6
      }
      if (engagedUserIds.has(post.authorId)) {
        score += 4
      }
      for (const tag of extractHashtags(post.content)) {
        if (userTags.has(tag)) {
          score += 3
        }
      }
      if (post.linkedProjectId && userProjectIds.has(post.linkedProjectId)) {
        score += 5
      }
      if (coLikerIds.has(post.authorId)) {
        score += 2
      }
      score += Math.min(4, Math.floor(post.likes.length / 3))
      if (post.comments.length > 0) {
        score += 1
      }
      return score
    }

    const ranked = candidates
      .map((post) => ({ post, score: scorePost(post) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    res.status(200).json({ posts: ranked.map((row) => row.post) })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/by-user/:userId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const targetUserId = String(req.params.userId)
    const followingIds = await getFollowingIds(authUser.id)
    const isSelf = targetUserId === authUser.id
    const canSeeConnections = isSelf || followingIds.has(targetUserId)

    const posts = await prisma.post.findMany({
      where: {
        authorId: targetUserId,
        OR: isSelf
          ? [
              { visibility: PostVisibility.PUBLIC },
              { visibility: PostVisibility.CONNECTIONS },
              { visibility: PostVisibility.PRIVATE },
            ]
          : [
              { visibility: PostVisibility.PUBLIC },
              ...(canSeeConnections ? [{ visibility: PostVisibility.CONNECTIONS }] : []),
            ],
      },
      include: postInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.status(200).json({ posts })
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = postSchema.parse(req.body)
    const followingIds = await getFollowingIds(authUser.id)

    if (input.linkedProjectId) {
      const project = await prisma.project.findFirst({
        where: {
          id: input.linkedProjectId,
          OR: [
            { ownerId: authUser.id },
            { members: { some: { userId: authUser.id } } },
            { visibility: 'PUBLIC' },
          ],
        },
      })

      if (!project) {
        res.status(404).json({ message: 'Linked project not found' })
        return
      }
    }

    if (input.repostOfId) {
      const original = await prisma.post.findUnique({
        where: { id: input.repostOfId },
      })
      if (!original) {
        res.status(404).json({ message: 'Original post not found' })
        return
      }
      const visible = await canViewerSeePost(original, authUser.id, followingIds)
      if (!visible) {
        res.status(403).json({ message: 'Cannot repost this post' })
        return
      }
      const existingRepost = await prisma.post.findFirst({
        where: { authorId: authUser.id, repostOfId: input.repostOfId },
      })
      if (existingRepost) {
        res.status(409).json({ message: '이미 퍼간 게시물입니다.' })
        return
      }
    }

    const post = await prisma.post.create({
      data: {
        ...buildPostData(input),
        authorId: authUser.id,
      },
      include: postInclude,
    })

    res.status(201).json({ post })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const posts = await prisma.post.findMany({
      where: { authorId: authUser.id },
      include: postInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.status(200).json({ posts })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/public/by-user/:userId', async (req, res, next) => {
  try {
    const targetUserId = String(req.params.userId)
    const user = await prisma.user.findUnique({ where: { id: targetUserId } })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const posts = await prisma.post.findMany({
      where: {
        authorId: targetUserId,
        visibility: PostVisibility.PUBLIC,
      },
      include: publicPostInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const visiblePosts = []
    for (const post of posts) {
      const accessible = await isPostPubliclyAccessible(post.id)
      if (accessible) {
        visiblePosts.push(sanitizePublicPost(post as PublicPostRecord))
      }
    }

    res.status(200).json({ posts: visiblePosts })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/public/:id', async (req, res, next) => {
  try {
    const postId = String(req.params.id)
    const accessible = await isPostPubliclyAccessible(postId)

    if (!accessible) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: publicPostInclude,
    })

    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const project =
      post.linkedProjectId &&
      (await prisma.project.findUnique({
        where: { id: post.linkedProjectId },
        select: { visibility: true },
      }))

    res.status(200).json({
      post: sanitizePublicPost({
        ...post,
        linkedProject: post.linkedProject
          ? { ...post.linkedProject, visibility: project?.visibility }
          : null,
      }),
    })
  } catch (error) {
    next(error)
  }
})

postsRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const followingIds = await getFollowingIds(authUser.id)
    const post = await prisma.post.findUnique({
      where: { id: String(req.params.id) },
      include: postInclude,
    })

    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const visible = await canViewerSeePost(post, authUser.id, followingIds)
    if (!visible) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    res.status(200).json({ post })
  } catch (error) {
    next(error)
  }
})

postsRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const postId = String(req.params.id)
    await requirePostOwner(postId, authUser.id)
    const input = updatePostSchema.parse(req.body)
    const post = await prisma.post.update({
      where: { id: postId },
      data: buildPostUpdateData(input),
      include: postInclude,
    })

    res.status(200).json({ post })
  } catch (error) {
    if (handlePostError(error, res)) {
      return
    }
    next(error)
  }
})

postsRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const postId = String(req.params.id)
    await requirePostOwner(postId, authUser.id)
    await prisma.post.delete({ where: { id: postId } })

    res.status(204).send()
  } catch (error) {
    if (handlePostError(error, res)) {
      return
    }
    next(error)
  }
})

postsRouter.post('/:id/like', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const postId = String(req.params.id)
    const followingIds = await getFollowingIds(authUser.id)
    const post = await prisma.post.findUnique({ where: { id: postId } })

    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const visible = await canViewerSeePost(post, authUser.id, followingIds)
    if (!visible) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const existingLike = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId: authUser.id } },
    })

    if (!existingLike) {
      await prisma.postLike.create({
        data: { postId, userId: authUser.id },
      })
      await createSocialNotification({
        userId: post.authorId,
        actorId: authUser.id,
        type: 'POST_LIKE',
      })
    }

    res.status(201).json({ ok: true })
  } catch (error) {
    next(error)
  }
})

postsRouter.delete('/:id/like', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const postId = String(req.params.id)
    await prisma.postLike.deleteMany({
      where: { postId, userId: authUser.id },
    })

    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

postsRouter.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const postId = String(req.params.id)
    const input = commentSchema.parse(req.body)
    const followingIds = await getFollowingIds(authUser.id)
    const post = await prisma.post.findUnique({ where: { id: postId } })

    if (!post) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const visible = await canViewerSeePost(post, authUser.id, followingIds)
    if (!visible) {
      res.status(404).json({ message: 'Post not found' })
      return
    }

    const comment = await prisma.comment.create({
      data: {
        postId,
        authorId: authUser.id,
        content: input.content,
      },
      include: {
        author: { select: authorSelect },
      },
    })

    await createSocialNotification({
      userId: post.authorId,
      actorId: authUser.id,
      type: 'POST_COMMENT',
    })

    res.status(201).json({ comment })
  } catch (error) {
    next(error)
  }
})
