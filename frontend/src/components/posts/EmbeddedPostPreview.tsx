import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { PostMediaGrid } from './PostMediaGrid'
import type { PostCore } from '../../types/post'

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

type EmbeddedPostPreviewProps = {
  post: PostCore
  label?: string
  profileLinks?: boolean
}

export function EmbeddedPostPreview({
  post,
  label,
  profileLinks = true,
}: EmbeddedPostPreviewProps) {
  const hashtags = extractHashtags(post.content)

  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-4">
      {label ? <p className="text-xs font-semibold text-ink-muted">{label}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        {profileLinks ? (
          <Link className="shrink-0 rounded-full ring-2 ring-white/80" to={`/profile/${post.author.id}`}>
            <Avatar name={post.author.name} size="sm" src={post.author.avatarUrl} />
          </Link>
        ) : (
          <div className="shrink-0 rounded-full ring-2 ring-white/80">
            <Avatar name={post.author.name} size="sm" src={post.author.avatarUrl} />
          </div>
        )}
        <div>
          {profileLinks ? (
            <Link className="font-bold text-ink-strong hover:text-brand-600" to={`/profile/${post.author.id}`}>
              {post.author.name}
            </Link>
          ) : (
            <p className="font-bold text-ink-strong">{post.author.name}</p>
          )}
          <p className="text-xs text-ink-muted">{formatDate(post.createdAt)}</p>
        </div>
      </div>
      {post.content.trim() ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
      ) : null}
      <PostMediaGrid urls={post.mediaUrls ?? []} />
      {hashtags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hashtags.map((hashtag) => (
            <span
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
              key={hashtag}
            >
              {hashtag}
            </span>
          ))}
        </div>
      ) : null}
      {post.linkedProject && profileLinks ? (
        <Link
          className="mt-3 block rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm transition hover:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          <span className="font-semibold text-brand-700">연결 프로젝트 · </span>
          {post.linkedProject.title}
        </Link>
      ) : post.linkedProject ? (
        <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <span className="font-semibold text-brand-700">연결 프로젝트 · </span>
          {post.linkedProject.title}
        </div>
      ) : null}
    </div>
  )
}
