import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import type { CommentTreeNode } from '../../lib/buildCommentTree'
import { canDeleteComment } from '../../lib/commentPermissions'
import { cn } from '../../lib/cn'
import { deleteComment } from '../../services/postService'
import { CommentLikeBar } from './CommentLikeBar'
import { PostCommentComposer } from './PostCommentComposer'

type PostCommentItemProps = {
  comment: CommentTreeNode
  postId: string
  postAuthorId: string
  token: string
  userId?: string
  onChanged: () => void
  variant?: 'default' | 'compact'
  depth?: number
  highlightId?: string | null
}

export function PostCommentItem({
  comment,
  postId,
  postAuthorId,
  token,
  userId,
  onChanged,
  variant = 'default',
  depth = 0,
  highlightId,
}: PostCommentItemProps) {
  const likes = comment.likes ?? []
  const [replyOpen, setReplyOpen] = useState(false)
  const isHighlighted = highlightId === comment.id
  const canReply = depth === 0 && Boolean(token)
  const showDelete = canDeleteComment(userId, postAuthorId, comment.authorId)

  const deleteMutation = useMutation({
    mutationFn: () => deleteComment(token, postId, comment.id),
    onSuccess: onChanged,
  })

  const handleDelete = () => {
    const isOwn = userId === comment.authorId
    const message = isOwn
      ? '이 댓글을 삭제할까요?'
      : '이 댓글을 삭제할까요? 답글이 있으면 함께 삭제됩니다.'
    if (!window.confirm(message)) {
      return
    }
    deleteMutation.mutate()
  }

  const deleteButton = showDelete ? (
    <button
      className="text-xs font-semibold text-red-600 transition hover:text-red-700 disabled:opacity-50"
      disabled={deleteMutation.isPending}
      onClick={handleDelete}
      type="button"
    >
      {deleteMutation.isPending ? '삭제 중…' : '삭제'}
    </button>
  ) : null

  const replyButton = canReply ? (
    <button
      className="text-xs font-semibold text-ink-muted transition hover:text-brand-600"
      onClick={() => setReplyOpen((value) => !value)}
      type="button"
    >
      {replyOpen ? '답글 취소' : '답글'}
    </button>
  ) : null

  if (variant === 'compact') {
    return (
      <li
        className={cn(
          'rounded-xl bg-slate-50 px-3 py-2.5',
          isHighlighted && 'ring-2 ring-brand-400 ring-offset-1',
        )}
        data-comment-id={comment.id}
        id={`comment-${comment.id}`}
      >
        <div className="flex items-center gap-2">
          <Link className="shrink-0" to={`/profile/${comment.author.id}`}>
            <Avatar name={comment.author.name} size="sm" src={comment.author.avatarUrl} />
          </Link>
          <Link className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900" to={`/profile/${comment.author.id}`}>
            {comment.author.name}
          </Link>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{comment.content}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CommentLikeBar
            commentId={comment.id}
            likes={likes}
            onChanged={onChanged}
            postId={postId}
            token={token}
            userId={userId}
          />
          {replyButton}
          {deleteButton}
        </div>
        {deleteMutation.error ? (
          <p className="mt-1 text-xs text-red-600">{deleteMutation.error.message}</p>
        ) : null}
        {replyOpen ? (
          <PostCommentComposer
            className="mt-2"
            onSuccess={() => {
              setReplyOpen(false)
              onChanged()
            }}
            parentId={comment.id}
            placeholder={`${comment.author.name}님에게 답글…`}
            postId={postId}
            token={token}
          />
        ) : null}
        {comment.replies.length > 0 ? (
          <ul className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
            {comment.replies.map((reply) => (
              <PostCommentItem
                comment={reply}
                depth={depth + 1}
                highlightId={highlightId}
                key={reply.id}
                onChanged={onChanged}
                postAuthorId={postAuthorId}
                postId={postId}
                token={token}
                userId={userId}
                variant="compact"
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl bg-surface-muted/80 p-4',
        isHighlighted && 'ring-2 ring-brand-400 ring-offset-2',
      )}
      data-comment-id={comment.id}
      id={`comment-${comment.id}`}
    >
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
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <CommentLikeBar
          commentId={comment.id}
          likes={likes}
          onChanged={onChanged}
          postId={postId}
          token={token}
          userId={userId}
        />
        {replyButton}
        {deleteButton}
      </div>
      {deleteMutation.error ? (
        <p className="mt-1 text-xs text-red-600">{deleteMutation.error.message}</p>
      ) : null}
      {replyOpen ? (
        <PostCommentComposer
          className="mt-3"
          onSuccess={() => {
            setReplyOpen(false)
            onChanged()
          }}
          parentId={comment.id}
          placeholder={`${comment.author.name}님에게 답글…`}
          postId={postId}
          token={token}
        />
      ) : null}
      {comment.replies.length > 0 ? (
        <div className="mt-3 space-y-3 border-l-2 border-surface-border pl-4">
          {comment.replies.map((reply) => (
            <PostCommentItem
              comment={reply}
              depth={depth + 1}
              highlightId={highlightId}
              key={reply.id}
              onChanged={onChanged}
              postAuthorId={postAuthorId}
              postId={postId}
              token={token}
              userId={userId}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
