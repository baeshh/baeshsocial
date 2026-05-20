import { useMutation } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { cn } from '../../lib/cn'
import { addComment } from '../../services/postService'

type PostCommentComposerProps = {
  postId: string
  token: string
  onSuccess: () => void
  className?: string
  parentId?: string
  placeholder?: string
}

export function PostCommentComposer({
  postId,
  token,
  onSuccess,
  className,
  parentId,
  placeholder = '댓글을 입력하세요…',
}: PostCommentComposerProps) {
  const [comment, setComment] = useState('')
  const inputId = parentId ? `post-reply-${postId}-${parentId}` : `post-comment-${postId}`

  const commentMutation = useMutation({
    mutationFn: () => addComment(token, postId, comment.trim(), parentId),
    onSuccess: () => {
      setComment('')
      onSuccess()
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!comment.trim()) {
      return
    }
    commentMutation.mutate()
  }

  return (
    <div className={cn('relative max-w-xl', parentId ? '' : 'mt-4', className)}>
      <form className="flex items-center gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          {parentId ? '답글' : '댓글'}
        </label>
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-surface-border bg-surface-muted/50 px-4 text-sm text-ink-strong outline-none transition placeholder:text-ink-muted focus:border-brand-200 focus:bg-white focus:ring-2 focus:ring-brand-600/20"
          id={inputId}
          onChange={(event) => setComment(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={comment}
        />
        <button
          aria-label={parentId ? '답글 등록' : '댓글 등록'}
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          disabled={commentMutation.isPending || !comment.trim()}
          type="submit"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">등록</span>
        </button>
      </form>
      {commentMutation.error ? (
        <p className="mt-2 text-xs text-red-600">{commentMutation.error.message}</p>
      ) : null}
    </div>
  )
}
