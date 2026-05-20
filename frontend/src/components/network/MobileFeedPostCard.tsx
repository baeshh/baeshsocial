import { useMutation } from '@tanstack/react-query'
import { MessageSquare, Repeat2, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { EmbeddedPostPreview } from '../posts/EmbeddedPostPreview'
import { PostFeedComments } from '../posts/PostFeedComments'
import { PostLikeBar } from '../posts/PostLikeBar'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import { PostShareButton } from '../posts/PostShareButton'
import { notifyRepostAlreadyDone, notifyRepostError, notifyRepostSuccess } from '../../lib/repostPost'
import { addComment, createPost } from '../../services/postService'
import type { Post } from '../../types/post'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function visibilityLabel(visibility: string) {
  if (visibility === 'PUBLIC') {
    return '공개'
  }
  if (visibility === 'CONNECTIONS') {
    return '연결 공개'
  }
  return '비공개'
}

type MobileFeedPostCardProps = {
  post: Post
  token: string
  userId?: string
  followingIds: Set<string>
  followerIds: Set<string>
  repostedSourceIds?: Set<string>
  onChanged: () => void
}

export function MobileFeedPostCard({
  post,
  token,
  userId,
  followingIds,
  followerIds,
  repostedSourceIds,
  onChanged,
}: MobileFeedPostCardProps) {
  const [comment, setComment] = useState('')
  const isAuthor = post.authorId === userId
  const alreadyReposted = Boolean(userId && repostedSourceIds?.has(post.id))
  const canRepost = Boolean(userId && !isAuthor && post.visibility === 'PUBLIC')

  const commentMutation = useMutation({
    mutationFn: () => addComment(token, post.id, comment.trim()),
    onSuccess: () => {
      setComment('')
      onChanged()
    },
  })

  const repostMutation = useMutation({
    mutationFn: () =>
      createPost(token, {
        content: '',
        repostOfId: post.id,
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

  const handleCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!comment.trim()) {
      return
    }
    commentMutation.mutate()
  }

  const handleRepost = () => {
    if (alreadyReposted) {
      notifyRepostAlreadyDone()
      return
    }
    repostMutation.mutate()
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link className="shrink-0" to={`/profile/${post.author.id}`}>
            <Avatar name={post.author.name} size="sm" src={post.author.avatarUrl} />
          </Link>
          <div className="min-w-0">
            <Link className="block truncate text-[15px] font-bold text-slate-900" to={`/profile/${post.author.id}`}>
              {post.author.name}
            </Link>
            <p className="text-xs text-slate-500">
              {formatDate(post.createdAt)} · {visibilityLabel(post.visibility)}
            </p>
          </div>
        </div>
        <Link
          className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100"
          to={`/p/${post.id}`}
        >
          <span className="text-xs font-semibold text-brand-600">보기</span>
        </Link>
      </div>

      {post.repostOf ? (
        <div className="mt-2 space-y-2">
          <p className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            <Repeat2 size={14} />
            퍼온 게시물
          </p>
          {post.content.trim() ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
              {post.content}
            </p>
          ) : null}
          <EmbeddedPostPreview post={post.repostOf} />
        </div>
      ) : (
        <>
          {post.content.trim() ? (
            <Link className="mt-1 block" to={`/p/${post.id}`}>
              <p className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
                {post.content}
              </p>
            </Link>
          ) : null}
          {post.mediaUrls && post.mediaUrls.length > 0 ? (
            <Link className="mt-3 block" to={`/p/${post.id}`}>
              <PostMediaGrid urls={post.mediaUrls} variant="compact" />
            </Link>
          ) : null}
        </>
      )}

      {!post.repostOf && post.linkedProject ? (
        <Link
          className="mt-3 block rounded-xl border border-brand-100 bg-brand-50/60 p-3 transition active:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">연결 프로젝트</p>
          <p className="mt-1 text-[15px] font-bold text-slate-900">{post.linkedProject.title}</p>
          {post.linkedProject.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{post.linkedProject.description}</p>
          ) : null}
        </Link>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
        <PostLikeBar onChanged={onChanged} post={post} size="sm" token={token} userId={userId} />
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold text-slate-500">
          <MessageSquare size={18} />
          댓글 {post.comments.length}
        </span>
        {canRepost ? (
          <button
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold transition hover:bg-slate-100 disabled:opacity-50 ${
              alreadyReposted ? 'text-slate-400' : 'text-slate-500'
            }`}
            disabled={repostMutation.isPending}
            onClick={handleRepost}
            type="button"
          >
            <Repeat2 size={18} />
            {alreadyReposted ? '퍼감' : '퍼가기'}
          </button>
        ) : null}
        <PostShareButton
          className="!px-2 !py-2 text-sm"
          postId={post.id}
          visibility={post.visibility}
        />
      </div>

      <PostFeedComments
        followerIds={followerIds}
        followingIds={followingIds}
        onChanged={onChanged}
        post={post}
        token={token}
        userId={userId}
        variant="compact"
      />

      <form className="mt-3 flex items-center gap-2" onSubmit={handleCommentSubmit}>
        <label className="sr-only" htmlFor={`comment-${post.id}`}>
          댓글 입력
        </label>
        <input
          className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-200 focus:bg-white focus:ring-2 focus:ring-brand-600/20"
          id={`comment-${post.id}`}
          onChange={(event) => setComment(event.target.value)}
          placeholder="댓글을 입력하세요…"
          type="text"
          value={comment}
        />
        <button
          aria-label="댓글 등록"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 active:scale-95 disabled:opacity-50"
          disabled={commentMutation.isPending || !comment.trim()}
          type="submit"
        >
          <Send size={18} />
        </button>
      </form>

      {commentMutation.error ? (
        <p className="mt-2 text-xs text-red-600">{commentMutation.error.message}</p>
      ) : null}
    </article>
  )
}
