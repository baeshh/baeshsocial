import { Repeat2 } from 'lucide-react'
import { Avatar } from '../common/Avatar'
import { EmbeddedPostPreview } from './EmbeddedPostPreview'
import { PostMediaGrid } from './PostMediaGrid'
import type { Post } from '../../types/post'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

type PostPublicViewProps = {
  post: Post
}

export function PostPublicView({ post }: PostPublicViewProps) {
  return (
    <article className="rounded-2xl border border-surface-border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={post.author.name} size="md" src={post.author.avatarUrl} />
        <div>
          <p className="text-lg font-bold text-ink-strong">{post.author.name}</p>
          <p className="text-sm text-ink-muted">{formatDate(post.createdAt)}</p>
        </div>
      </div>

      {post.repostOf ? (
        <div className="mt-4">
          <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <Repeat2 size={14} />
            퍼온 게시물
          </p>
          <div className="mt-2">
            <EmbeddedPostPreview label="원본 게시물" post={post.repostOf} profileLinks={false} />
          </div>
        </div>
      ) : null}

      {post.content.trim() ? (
        <p className="mt-5 whitespace-pre-wrap text-base leading-relaxed text-ink-body">{post.content}</p>
      ) : null}

      <PostMediaGrid urls={post.mediaUrls ?? []} />

      {post.linkedProject ? (
        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">연결 프로젝트</p>
          <p className="mt-1 font-bold text-ink-strong">{post.linkedProject.title}</p>
          {post.linkedProject.description ? (
            <p className="mt-1 text-sm text-ink-muted">{post.linkedProject.description}</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-5 border-t border-surface-border pt-4 text-sm text-ink-muted">
        좋아요 {post.likes.length} · 댓글 {post.comments.length}
      </p>

      {post.comments.length > 0 ? (
        <div className="mt-4 space-y-3">
          {post.comments.map((comment) => (
            <div className="rounded-xl bg-surface-muted/80 p-4" key={comment.id}>
              <div className="flex items-center gap-2">
                <Avatar name={comment.author.name} size="sm" src={comment.author.avatarUrl} />
                <p className="text-sm font-bold text-ink-strong">{comment.author.name}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-body">{comment.content}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
