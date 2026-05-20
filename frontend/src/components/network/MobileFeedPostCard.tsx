import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { Avatar } from '../common/Avatar'
import { PostMediaGrid } from '../posts/PostMediaGrid'
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
}

export function MobileFeedPostCard({ post }: MobileFeedPostCardProps) {
  const preview =
    post.content.trim() ||
    (post.repostOf ? '퍼온 게시물입니다.' : '')

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
          <MoreHorizontal size={20} />
        </Link>
      </div>

      <Link className="block" to={`/p/${post.id}`}>
        {preview ? (
          <p className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
            {preview}
          </p>
        ) : null}
        {post.mediaUrls && post.mediaUrls.length > 0 ? (
          <div className="mt-3">
            <PostMediaGrid urls={post.mediaUrls} variant="compact" />
          </div>
        ) : null}
      </Link>

      <p className="mt-3 text-xs text-slate-500">
        좋아요 {post.likes.length} · 댓글 {post.comments.length}
      </p>
    </article>
  )
}
