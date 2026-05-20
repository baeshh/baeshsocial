import { useMutation } from '@tanstack/react-query'
import { MessageSquare, Repeat2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import {
  canShowRepostButton,
  getRepostTargetId,
  isAlreadyReposted,
} from '../../lib/repostRules'
import { notifyRepostAlreadyDone, notifyRepostError, notifyRepostSuccess } from '../../lib/repostPost'
import { createPost } from '../../services/postService'
import type { Post } from '../../types/post'
import { PostLikeBar } from './PostLikeBar'
import { PostShareButton } from './PostShareButton'

type PostFeedActionBarProps = {
  post: Post
  token: string
  userId?: string
  repostedSourceIds?: Set<string>
  onChanged: () => void
  className?: string
}

export function PostFeedActionBar({
  post,
  token,
  userId,
  repostedSourceIds,
  onChanged,
  className,
}: PostFeedActionBarProps) {
  const showRepost = canShowRepostButton(post, userId, repostedSourceIds)
  const alreadyReposted = isAlreadyReposted(post, userId, repostedSourceIds)
  const repostTargetId = getRepostTargetId(post)

  const repostMutation = useMutation({
    mutationFn: () =>
      createPost(token, {
        content: '',
        repostOfId: repostTargetId,
        visibility: 'public',
      }),
    onSuccess: () => {
      notifyRepostSuccess()
      onChanged()
    },
    onError: (error: Error) => {
      notifyRepostError(error.message)
    },
  })

  const handleRepost = () => {
    if (alreadyReposted) {
      notifyRepostAlreadyDone()
      return
    }
    repostMutation.mutate()
  }

  return (
    <div
      className={cn(
        'flex flex-nowrap items-center gap-0 overflow-x-auto border-t border-slate-100 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <PostLikeBar
        className="shrink-0 [&_button]:px-2 [&_button]:py-1.5 [&_button]:text-xs sm:[&_button]:px-3 sm:[&_button]:text-sm"
        onChanged={onChanged}
        post={post}
        size="sm"
        token={token}
        userId={userId}
      />
      <Link
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 sm:gap-1.5 sm:px-2.5 sm:text-sm"
        to={`/p/${post.id}`}
      >
        <MessageSquare className="h-[18px] w-[18px] shrink-0" />
        <span className="whitespace-nowrap">댓글 {post.comments.length}</span>
      </Link>
      {showRepost ? (
        <button
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-xs font-semibold transition hover:bg-slate-100 disabled:opacity-50 sm:gap-1.5 sm:px-2.5 sm:text-sm',
            alreadyReposted ? 'text-slate-400' : 'text-slate-500',
          )}
          disabled={repostMutation.isPending}
          onClick={handleRepost}
          type="button"
        >
          <Repeat2 className="h-[18px] w-[18px] shrink-0" />
          <span className="whitespace-nowrap">{alreadyReposted ? '퍼감' : '퍼가기'}</span>
        </button>
      ) : null}
      <PostShareButton
        className="shrink-0"
        compact
        postId={post.id}
        visibility={post.visibility}
      />
    </div>
  )
}
