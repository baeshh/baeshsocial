import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import type { PostComment } from '../../types/post'
import { CommentLikeBar } from './CommentLikeBar'

type PostCommentItemProps = {
  comment: PostComment
  postId: string
  token: string
  userId?: string
  onChanged: () => void
  variant?: 'default' | 'compact'
}

export function PostCommentItem({
  comment,
  postId,
  token,
  userId,
  onChanged,
  variant = 'default',
}: PostCommentItemProps) {
  const likes = comment.likes ?? []

  if (variant === 'compact') {
    return (
      <li className="rounded-xl bg-slate-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Link className="shrink-0" to={`/profile/${comment.author.id}`}>
            <Avatar name={comment.author.name} size="sm" src={comment.author.avatarUrl} />
          </Link>
          <Link className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900" to={`/profile/${comment.author.id}`}>
            {comment.author.name}
          </Link>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{comment.content}</p>
        <div className="mt-2">
          <CommentLikeBar
            commentId={comment.id}
            likes={likes}
            onChanged={onChanged}
            postId={postId}
            token={token}
            userId={userId}
          />
        </div>
      </li>
    )
  }

  return (
    <div className="rounded-xl bg-surface-muted/80 p-4">
      <div className="flex items-center gap-2">
        <Link className="shrink-0" to={`/profile/${comment.author.id}`}>
          <Avatar name={comment.author.name} size="sm" src={comment.author.avatarUrl} />
        </Link>
        <Link
          className="text-sm font-bold text-ink-strong hover:text-brand-600"
          to={`/profile/${comment.author.id}`}
        >
          {comment.author.name}
        </Link>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-ink-body">{comment.content}</p>
      <div className="mt-2">
        <CommentLikeBar
          commentId={comment.id}
          likes={likes}
          onChanged={onChanged}
          postId={postId}
          token={token}
          userId={userId}
        />
      </div>
    </div>
  )
}
