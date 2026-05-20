import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BaeshLogo } from '../../components/common/BaeshLogo'
import { Button } from '../../components/common/Button'
import { LoadingState } from '../../components/common/LoadingState'
import { PublicProfileView } from '../../components/profile/PublicProfileView'
import { PublicPostSignupCta } from '../../components/posts/PublicPostSignupCta'
import { applyProfilePageMeta, clearProfilePageMeta } from '../../lib/profileSeo'
import { buildProfileShareUrl } from '../../lib/profileShare'
import { getPublicProfile } from '../../services/profileService'
import { getPublicPostsByUser } from '../../services/postService'
import { useAuthStore } from '../../stores/authStore'

export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const token = useAuthStore((state) => state.token)

  const profileQuery = useQuery({
    queryKey: ['profiles', 'public', userId],
    queryFn: () => getPublicProfile(userId ?? ''),
    enabled: Boolean(userId) && !token,
    retry: false,
  })

  const postsQuery = useQuery({
    queryKey: ['posts', 'public', 'by-user', userId],
    queryFn: () => getPublicPostsByUser(userId ?? ''),
    enabled: Boolean(userId) && !token,
    retry: false,
  })

  useEffect(() => {
    const profile = profileQuery.data?.profile
    if (profile && userId) {
      applyProfilePageMeta(profile, buildProfileShareUrl(userId))
    }
    return () => {
      clearProfilePageMeta()
    }
  }, [profileQuery.data?.profile, userId])

  if (token && userId) {
    return <Navigate replace to={`/profile/${userId}`} />
  }

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-surface-muted">
        <LoadingState />
      </div>
    )
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4">
        <p className="text-lg font-semibold text-ink-strong">프로필을 찾을 수 없습니다</p>
        <p className="mt-2 text-sm text-ink-muted">존재하지 않거나 비공개인 프로필일 수 있습니다.</p>
        <Button className="mt-6 rounded-full" to="/">
          홈으로
        </Button>
      </div>
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
        <PublicProfileView data={profileQuery.data} posts={postsQuery.data?.posts ?? []} />
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
