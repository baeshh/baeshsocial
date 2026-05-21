import { Link } from 'react-router-dom'
import { pickHighlightComment } from '../../lib/pickHighlightComment'
import type { Post } from '../../types/post'
import { PostCommentItem } from './PostCommentItem'

type PostFeedCommentsProps = {
  post: Post
  token: string
  userId?: string
  followingIds: Set<string>
  followerIds: Set<string>
  onChanged: () => void
  variant?: 'default' | 'compact'
}

export function PostFeedComments({
  post,
  token,
  userId,
  followingIds,
  followerIds,
  onChanged,
  variant = 'default',
}: PostFeedCommentsProps) {
  const total = post.comments.length
  const highlight = pickHighlightComment({
    comments: post.comments,
    followingIds,
    followerIds,
  })

  if (total === 0) {
    return null
  }

  return (
    <div className={variant === 'compact' ? 'mt-2' : 'mt-4'}>
      {highlight ? (
        <PostCommentItem
          comment={{ ...highlight, replies: [] }}
          onChanged={onChanged}
          postAuthorId={post.authorId}
          postId={post.id}
          token={token}
          userId={userId}
          variant={variant}
        />
      ) : null}
      {total > 1 ? (
        <Link
          className={
            variant === 'compact'
              ? 'mt-2 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700'
              : 'mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700'
          }
          to={`/p/${post.id}`}
        >
          댓글 {total}개 모두 보기
        </Link>
      ) : null}
    </div>
  )
}
