import { buildCommentTree } from '../../lib/buildCommentTree'
import type { PostComment } from '../../types/post'
import { PostCommentItem } from './PostCommentItem'

type PostCommentThreadProps = {
  comments: PostComment[]
  postId: string
  postAuthorId: string
  token: string
  userId?: string
  onChanged: () => void
  highlightId?: string | null
}

export function PostCommentThread({
  comments,
  postId,
  postAuthorId,
  token,
  userId,
  onChanged,
  highlightId,
}: PostCommentThreadProps) {
  const tree = buildCommentTree(comments)

  if (tree.length === 0) {
    return null
  }

  return (
    <div className="mt-4 space-y-3">
      {tree.map((comment) => (
        <PostCommentItem
          comment={comment}
          highlightId={highlightId}
          key={comment.id}
          onChanged={onChanged}
          postAuthorId={postAuthorId}
          postId={postId}
          token={token}
          userId={userId}
        />
      ))}
    </div>
  )
}
