import { useMutation } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { likeComment, unlikeComment } from '../../services/postService'
import type { ContentLike } from '../../types/post'
import { PostLikesModal } from './PostLikesModal'

type CommentLikeBarProps = {
  postId: string
  commentId: string
  likes: ContentLike[]
  token: string
  userId?: string
  onChanged: () => void
  className?: string
}

export function CommentLikeBar({
  postId,
  commentId,
  likes,
  token,
  userId,
  onChanged,
  className,
}: CommentLikeBarProps) {
  const [likesOpen, setLikesOpen] = useState(false)
  const liked = likes.some((like) => like.userId === userId)
  const count = likes.length

  const likeMutation = useMutation({
    mutationFn: () =>
      liked ? unlikeComment(token, postId, commentId) : likeComment(token, postId, commentId),
    onSuccess: onChanged,
  })

  return (
    <>
      <div className={cn('inline-flex items-center gap-0.5', className)}>
        <button
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition active:scale-95',
            liked ? 'text-brand-700' : 'text-slate-500 hover:bg-slate-100',
          )}
          disabled={likeMutation.isPending}
          onClick={() => likeMutation.mutate()}
          type="button"
        >
          <Heart className={cn('h-3.5 w-3.5', liked && 'fill-current')} />
          좋아요
        </button>
        <button
          className={cn(
            'rounded-full px-1.5 py-1 text-xs font-semibold transition',
            count > 0 ? 'text-brand-600 hover:bg-brand-50' : 'cursor-default text-slate-400',
          )}
          disabled={count === 0}
          onClick={() => setLikesOpen(true)}
          type="button"
        >
          {count}
        </button>
      </div>

      <PostLikesModal
        likes={likes}
        onClose={() => setLikesOpen(false)}
        open={likesOpen}
        title="댓글 좋아요"
      />

      {likeMutation.error ? (
        <p className="mt-1 text-xs text-red-600">{likeMutation.error.message}</p>
      ) : null}
    </>
  )
}
