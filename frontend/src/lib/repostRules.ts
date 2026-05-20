import type { Post } from '../types/post'

/** 퍼가기 대상은 항상 원본 게시물 ID */
export function getRepostTargetId(post: Post) {
  return post.repostOf?.id ?? post.id
}

export function getOriginalAuthorId(post: Post) {
  return post.repostOf?.authorId ?? post.authorId
}

export function isAlreadyReposted(
  post: Post,
  userId: string | undefined,
  repostedSourceIds?: Set<string>,
) {
  if (!userId || !repostedSourceIds) {
    return false
  }
  return repostedSourceIds.has(getRepostTargetId(post))
}

/** 원본 작성자·퍼간 글 작성자 본인, 이미 퍼간 경우 퍼가기 불가 */
export function canShowRepostButton(
  post: Post,
  userId: string | undefined,
  repostedSourceIds?: Set<string>,
) {
  if (!userId || post.visibility !== 'PUBLIC') {
    return false
  }
  if (post.authorId === userId) {
    return false
  }
  if (getOriginalAuthorId(post) === userId) {
    return false
  }
  if (isAlreadyReposted(post, userId, repostedSourceIds)) {
    return false
  }
  return true
}
