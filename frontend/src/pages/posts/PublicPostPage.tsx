import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BaeshLogo } from '../../components/common/BaeshLogo'
import { Button } from '../../components/common/Button'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { PostCard } from '../../components/posts/PostCard'
import { PostPublicView } from '../../components/posts/PostPublicView'
import { PublicPostSignupCta } from '../../components/posts/PublicPostSignupCta'
import { getPost, getPublicPost } from '../../services/postService'
import { useAuthStore } from '../../stores/authStore'

export function PublicPostPage() {
  const { postId } = useParams<{ postId: string }>()
  const [searchParams] = useSearchParams()
  const highlightCommentId = searchParams.get('comment')
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  const postQuery = useQuery({
    queryKey: ['posts', 'public', postId, Boolean(token)],
    queryFn: () =>
      token && postId ? getPost(token, postId) : getPublicPost(postId ?? ''),
    enabled: Boolean(postId),
    retry: false,
  })

  const post = postQuery.data?.post

  useEffect(() => {
    if (post) {
      document.title = `${post.author.name}님의 게시물 · BAESH`
    }
    return () => {
      document.title = 'BAESH'
    }
  }, [post])

  useEffect(() => {
    if (!highlightCommentId || !post) {
      return
    }
    const timer = window.setTimeout(() => {
      const element = document.getElementById(`comment-${highlightCommentId}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [highlightCommentId, post?.id, post?.comments.length])

  if (postQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <LoadingState />
      </div>
    )
  }

  if (postQuery.error || !post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4">
        <p className="text-lg font-semibold text-ink-strong">게시물을 찾을 수 없습니다</p>
        <p className="mt-2 text-sm text-ink-muted">비공개이거나 삭제된 게시물일 수 있습니다.</p>
        <Button className="mt-6 rounded-full" to="/">
          홈으로
        </Button>
      </div>
    )
  }

  if (token && user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl">
          <PostCard
            commentsMode="full"
            highlightCommentId={highlightCommentId}
            onChanged={() => void postQuery.refetch()}
            post={post}
            showViewPostLink={false}
            token={token}
            userId={user.id}
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-muted to-white">
      <header className="border-b border-surface-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <BaeshLogo imageClassName="h-8 w-8" to="/" />
          <div className="flex gap-2">
            <Button className="rounded-full text-sm" to="/auth/login" variant="ghost">
              로그인
            </Button>
            <Button className="rounded-full text-sm" to="/auth/register">
              회원가입
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <PostPublicView post={post} />
        <PublicPostSignupCta />
        <p className="mt-8 text-center text-xs text-ink-muted">
          <Link className="font-medium text-brand-600 hover:text-brand-700" to="/">
            BAESH 홈으로
          </Link>
        </p>
      </main>
    </div>
  )
}
