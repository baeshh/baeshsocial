import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { LoadingState } from '../common/LoadingState'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import { getPostsByUser } from '../../services/postService'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

type ProfilePostsPanelProps = {
  token: string
  userId: string
  userName: string
  avatarUrl: string | null
  isOwnProfile: boolean
}

export function ProfilePostsPanel({
  token,
  userId,
  userName,
  avatarUrl,
  isOwnProfile,
}: ProfilePostsPanelProps) {
  const postsQuery = useQuery({
    queryKey: ['posts', 'by-user', userId],
    queryFn: () => getPostsByUser(token, userId),
    enabled: Boolean(token && userId),
    refetchOnMount: 'always',
  })

  if (postsQuery.isLoading) {
    return <LoadingState />
  }

  if (postsQuery.error) {
    return (
      <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        {postsQuery.error.message}
      </p>
    )
  }

  const posts = postsQuery.data?.posts ?? []

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/50 px-4 py-8 text-center">
        <p className="text-sm text-ink-muted">
          {isOwnProfile ? '아직 게시물이 없습니다.' : '공개된 게시물이 없습니다.'}
        </p>
        {isOwnProfile ? (
          <Button className="mt-4" to="/network" variant="secondary">
            Network에서 첫 게시물 작성
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <article className="rounded-xl border border-surface-border bg-white p-4 shadow-sm" key={post.id}>
          <div className="flex items-center gap-3">
            <Avatar name={userName} size="sm" src={avatarUrl} />
            <div>
              <p className="font-semibold text-ink-strong">{userName}</p>
              <p className="text-xs text-ink-muted">
                {formatDate(post.createdAt)} · {visibilityLabel(post.visibility)}
              </p>
            </div>
          </div>
          {post.content.trim() ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
          ) : null}
          <PostMediaGrid urls={post.mediaUrls ?? []} />
          {post.linkedProject ? (
            <Link
              className="mt-3 block rounded-lg border border-surface-border bg-surface-muted/40 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
              to={`/projects/${post.linkedProject.id}`}
            >
              프로젝트: {post.linkedProject.title}
            </Link>
          ) : null}
          <p className="mt-3 text-xs text-ink-muted">
            좋아요 {post.likes.length} · 댓글 {post.comments.length}
          </p>
        </article>
      ))}
    </div>
  )
}
