import { useMutation } from '@tanstack/react-query'
import { MessageSquare, Repeat2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { Textarea } from '../common/Input'
import {
  createPost,
  deletePost,
  updatePost,
} from '../../services/postService'
import type { Post } from '../../types/post'
import { EmbeddedPostPreview } from './EmbeddedPostPreview'
import { PostMediaGrid } from './PostMediaGrid'
import { PostCommentComposer } from './PostCommentComposer'
import { PostCommentThread } from './PostCommentThread'
import { PostFeedComments } from './PostFeedComments'
import { PostLikeBar } from './PostLikeBar'
import { notifyRepostAlreadyDone, notifyRepostError, notifyRepostSuccess } from '../../lib/repostPost'
import { PostShareButton } from './PostShareButton'

function extractHashtags(content: string) {
  return Array.from(content.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0])
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

export type PostCardProps = {
  post: Post
  token: string
  userId?: string
  onChanged: () => void
  repostedSourceIds?: Set<string>
  showComments?: boolean
  /** feed: 하이라이트 댓글 1개만, full: 전체(상세) */
  commentsMode?: 'feed' | 'full'
  followingIds?: Set<string>
  followerIds?: Set<string>
  /** 게시물 상세(/p/:id)에서는 false */
  showViewPostLink?: boolean
  /** 알림 등에서 ?comment= 로 스크롤·강조할 댓글 ID */
  highlightCommentId?: string | null
}

export function PostCard({
  post,
  token,
  userId,
  onChanged,
  repostedSourceIds,
  showComments = true,
  commentsMode = 'full',
  followingIds = new Set(),
  followerIds = new Set(),
  showViewPostLink = true,
  highlightCommentId = null,
}: PostCardProps) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)
  const isAuthor = post.authorId === userId
  const hashtags = extractHashtags(post.content)
  const alreadyReposted = Boolean(userId && repostedSourceIds?.has(post.id))

  const updateMutation = useMutation({
    mutationFn: () => updatePost(token, post.id, { content: editContent }),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => deletePost(token, post.id),
    onSuccess: onChanged,
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

  const handleRepost = () => {
    if (alreadyReposted) {
      notifyRepostAlreadyDone()
      return
    }
    repostMutation.mutate()
  }

  const canRepost = Boolean(userId && !isAuthor)

  return (
    <article className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link className="shrink-0 rounded-full ring-2 ring-white shadow-sm" to={`/profile/${post.author.id}`}>
            <Avatar name={post.author.name} src={post.author.avatarUrl} />
          </Link>
          <div>
            <Link className="font-bold text-ink-strong hover:text-brand-600" to={`/profile/${post.author.id}`}>
              {post.author.name}
            </Link>
            <p className="text-sm text-ink-muted">
              {formatDate(post.createdAt)} · {post.visibility === 'PUBLIC' ? '공개' : post.visibility === 'CONNECTIONS' ? '연결 공개' : '비공개'}
            </p>
          </div>
        </div>
        {showViewPostLink ? (
          <Link className="text-xs font-semibold text-brand-600 hover:text-brand-700" to={`/p/${post.id}`}>
            게시물 보기
          </Link>
        ) : null}
      </div>

      {post.repostOf ? (
        <div className="mt-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <Repeat2 size={14} />
            퍼온 게시물
          </p>
          <div className="mt-2">
            <EmbeddedPostPreview post={post.repostOf} />
          </div>
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            updateMutation.mutate()
          }}
        >
          <Textarea label="게시글 수정" onChange={(event) => setEditContent(event.target.value)} value={editContent} />
          <Button disabled={updateMutation.isPending} type="submit">
            수정 저장
          </Button>
        </form>
      ) : post.content.trim() ? (
        <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink-body">{post.content}</p>
      ) : post.repostOf ? null : (
        <p className="mt-4 text-sm text-ink-muted">내용 없음</p>
      )}

      <PostMediaGrid urls={post.mediaUrls ?? []} />

      {hashtags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {hashtags.map((hashtag) => (
            <span
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100"
              key={hashtag}
            >
              {hashtag}
            </span>
          ))}
        </div>
      ) : null}

      {!post.repostOf && post.linkedProject ? (
        <Link
          className="mt-4 block rounded-xl border border-brand-100 bg-brand-50/50 p-4 transition hover:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Linked Project</p>
          <p className="mt-1 font-bold text-ink-strong">{post.linkedProject.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{post.linkedProject.description ?? '설명 없음'}</p>
        </Link>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
        <div className="flex flex-wrap items-start gap-1">
          <PostLikeBar onChanged={onChanged} post={post} token={token} userId={userId} />
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted">
            <MessageSquare size={18} />
            댓글 {post.comments.length}
          </span>
          {canRepost ? (
            <button
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-surface-muted disabled:opacity-50 ${
                alreadyReposted ? 'text-ink-muted/70' : 'text-ink-muted'
              }`}
              disabled={repostMutation.isPending}
              onClick={handleRepost}
              type="button"
            >
              <Repeat2 size={18} />
              {alreadyReposted ? '퍼감' : '퍼가기'}
            </button>
          ) : null}
          <PostShareButton postId={post.id} visibility={post.visibility} />
        </div>
        {isAuthor ? (
          <div className="flex w-full flex-shrink-0 justify-end gap-2 sm:w-auto">
            <Button className="rounded-full text-xs" onClick={() => setEditing((value) => !value)} variant="ghost">
              수정
            </Button>
            <Button
              className="rounded-full text-xs text-red-700 hover:bg-red-50"
              onClick={() => deleteMutation.mutate()}
              variant="ghost"
            >
              삭제
            </Button>
          </div>
        ) : null}
      </div>
      {showComments && commentsMode === 'feed' ? (
        <PostFeedComments
          followerIds={followerIds}
          followingIds={followingIds}
          onChanged={onChanged}
          post={post}
          token={token}
          userId={userId}
        />
      ) : null}

      {showComments && commentsMode === 'full' ? (
        <>
          <PostCommentThread
            comments={post.comments}
            highlightId={highlightCommentId}
            onChanged={onChanged}
            postId={post.id}
            token={token}
            userId={userId}
          />

          <PostCommentComposer onSuccess={onChanged} postId={post.id} token={token} />
        </>
      ) : null}
    </article>
  )
}
