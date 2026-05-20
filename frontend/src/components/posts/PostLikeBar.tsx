import { useMutation } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { likePost, unlikePost } from '../../services/postService'
import type { Post } from '../../types/post'
import { PostLikesModal } from './PostLikesModal'

type PostLikeBarProps = {
  post: Post
  token: string
  userId?: string
  onChanged: () => void
  className?: string
  size?: 'sm' | 'md'
}

export function PostLikeBar({ post, token, userId, onChanged, className, size = 'md' }: PostLikeBarProps) {
  const [likesOpen, setLikesOpen] = useState(false)
  const liked = post.likes.some((like) => like.userId === userId)
  const count = post.likes.length

  const likeMutation = useMutation({
    mutationFn: () => (liked ? unlikePost(token, post.id) : likePost(token, post.id)),
    onSuccess: onChanged,
  })

  const iconSize = size === 'sm' ? 18 : 18
  const textClass = size === 'sm' ? 'text-sm' : 'text-sm'

  return (
    <>
      <div className={cn('inline-flex items-center gap-1', className)}>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-semibold transition active:scale-95',
            textClass,
            liked ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted',
          )}
          disabled={likeMutation.isPending}
          onClick={() => likeMutation.mutate()}
          type="button"
        >
          <Heart className={cn(liked && 'fill-current')} size={iconSize} />
          좋아요
        </button>
        <button
          className={cn(
            'rounded-full px-2 py-2 font-semibold transition',
            textClass,
            count > 0
              ? 'text-brand-600 hover:bg-brand-50 active:scale-95'
              : 'cursor-default text-ink-muted',
          )}
          disabled={count === 0}
          onClick={() => setLikesOpen(true)}
          type="button"
        >
          {count}
        </button>
      </div>

      <PostLikesModal likes={post.likes} onClose={() => setLikesOpen(false)} open={likesOpen} />

      {likeMutation.error ? (
        <p className="mt-1 text-xs text-red-600">{likeMutation.error.message}</p>
      ) : null}
    </>
  )
}
