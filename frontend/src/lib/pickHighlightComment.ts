import type { PostComment } from '../types/post'
import { topLevelComments } from './buildCommentTree'

type PickHighlightCommentOptions = {
  comments: PostComment[]
  followingIds: Set<string>
  followerIds: Set<string>
}

/**
 * 피드용 하이라이트 댓글 1개 선택
 * 1) 맞팔로우 댓글 2) 내가 팔로우한 사람 댓글 3) 좋아요 최다
 */
export function pickHighlightComment({
  comments,
  followingIds,
  followerIds,
}: PickHighlightCommentOptions): PostComment | null {
  const roots = topLevelComments(comments)
  if (roots.length === 0) {
    return null
  }

  const ranked = [...roots].map((comment) => {
    const authorId = comment.authorId
    const isFollowing = followingIds.has(authorId)
    const isFollower = followerIds.has(authorId)
    const isMutual = isFollowing && isFollower
    let tier = 1
    if (isMutual) {
      tier = 3
    } else if (isFollowing) {
      tier = 2
    }
    const likeCount = comment.likes?.length ?? 0
    return { comment, tier, likeCount, createdAt: new Date(comment.createdAt).getTime() }
  })

  ranked.sort((a, b) => {
    if (b.tier !== a.tier) {
      return b.tier - a.tier
    }
    if (b.likeCount !== a.likeCount) {
      return b.likeCount - a.likeCount
    }
    return b.createdAt - a.createdAt
  })

  return ranked[0]?.comment ?? null
}
