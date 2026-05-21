import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { GraduationCap, ShieldCheck, Sparkles } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs } from '../../components/common/Tabs'
import { AppLayout } from '../../components/layout/AppLayout'
import { ClickableProfileAvatar } from '../../components/profile/ProfileAvatarLightbox'
import {
  ProfileEditModal,
  type ProfileEditFormState,
} from '../../components/profile/ProfileEditModal'
import { ProfileHistoryPanel } from '../../components/profile/ProfileHistoryPanel'
import { ProfilePostsPanel } from '../../components/profile/ProfilePostsPanel'
import { ProfileProjectsPanel } from '../../components/profile/ProfileProjectsPanel'
import { ProfileFollowListModal } from '../../components/profile/ProfileFollowListModal'
import { ProfileShareButton } from '../../components/profile/ProfileShareButton'
import { ProfileGrowthTimeline } from '../../components/profile/ProfileGrowthTimeline'
import { ProfileUpdatesHighlight } from '../../components/profile/ProfileUpdatesHighlight'
import { getMyProfile, getProfileByUserId, updateMyProfile } from '../../services/profileService'
import { followUser, unfollowUser, updateMe } from '../../services/userService'
import { useAuthStore } from '../../stores/authStore'
function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const MATURITY_LABELS = {
  foundation: '기초 단계',
  growing: '성장 단계',
  advanced: '고급 단계',
} as const

function formatDate(value: string | null) {
  if (!value) {
    return '날짜 없음'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function DonutStat({ pct, color, label }: { pct: number; color: string; label: string }) {
  const r = 34
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="relative h-[92px] w-[92px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" fill="none" r={r} stroke="#e5e7eb" strokeWidth="10" />
          <circle
            className="transition-all duration-500"
            cx="50"
            cy="50"
            fill="none"
            r={r}
            stroke={color}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth="10"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-strong">
          {pct}%
        </span>
      </div>
      <p className="max-w-[6.5rem] text-xs font-medium leading-snug text-ink-muted">{label}</p>
    </div>
  )
}

export function ProfilePage() {
  const { userId: routeUserId } = useParams<{ userId?: string }>()
  const [searchParams] = useSearchParams()
  const focusUpdates = searchParams.get('section') === 'updates'
  const updatesAnchorRef = useRef<HTMLDivElement>(null)
  const token = useAuthStore((state) => state.token)
  const sessionUser = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const queryClient = useQueryClient()
  const [profileTab, setProfileTab] = useState('history')
  const [editOpen, setEditOpen] = useState(false)
  const [followListKind, setFollowListKind] = useState<'followers' | 'following' | null>(null)
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(null)
  const [draftCoverUrl, setDraftCoverUrl] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileEditFormState>({
    name: '',
    headline: '',
    bio: '',
    school: '',
    company: '',
    location: '',
    skills: '',
    interests: '',
    website: '',
    github: '',
    linkedin: '',
  })
  const viewingUserId = routeUserId ?? sessionUser?.id
  const isOwnRoute = !routeUserId || routeUserId === sessionUser?.id

  const profileQuery = useQuery({
    queryKey: ['profiles', isOwnRoute ? 'me' : routeUserId],
    queryFn: () =>
      isOwnRoute ? getMyProfile(token ?? '') : getProfileByUserId(token ?? '', routeUserId ?? ''),
    enabled: Boolean(token && viewingUserId),
  })

  useEffect(() => {
    if (!isOwnRoute && routeUserId && profileQuery.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ['search', 'recommended'] })
    }
  }, [isOwnRoute, routeUserId, profileQuery.isSuccess, queryClient])

  useEffect(() => {
    if (!profileQuery.data) {
      return
    }

    const { profile } = profileQuery.data
    setProfileForm({
      name: profile.user.name,
      headline: profile.headline ?? '',
      bio: profile.bio ?? '',
      school: profile.school ?? '',
      company: profile.company ?? '',
      location: profile.location ?? '',
      skills: profile.skills.join(', '),
      interests: profile.interests.join(', '),
      website: profile.socialLinks?.website ?? '',
      github: profile.socialLinks?.github ?? '',
      linkedin: profile.socialLinks?.linkedin ?? '',
    })
  }, [profileQuery.data])

  useEffect(() => {
    if (focusUpdates) {
      return
    }
    setProfileTab('history')
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [routeUserId, focusUpdates])

  useEffect(() => {
    if (!focusUpdates || !profileQuery.data) {
      return
    }

    setProfileTab('history')
    const timer = window.setTimeout(() => {
      updatesAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)

    return () => window.clearTimeout(timer)
  }, [focusUpdates, profileQuery.data])

  const invalidateProfile = () => {
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const authToken = token ?? ''
      await updateMyProfile(authToken, {
        headline: emptyToNull(profileForm.headline),
        bio: emptyToNull(profileForm.bio),
        school: emptyToNull(profileForm.school),
        company: emptyToNull(profileForm.company),
        location: emptyToNull(profileForm.location),
        skills: splitTags(profileForm.skills),
        interests: splitTags(profileForm.interests),
        socialLinks: {
          ...(emptyToNull(profileForm.website) ? { website: profileForm.website.trim() } : {}),
          ...(emptyToNull(profileForm.github) ? { github: profileForm.github.trim() } : {}),
          ...(emptyToNull(profileForm.linkedin) ? { linkedin: profileForm.linkedin.trim() } : {}),
        },
      })

      const original = profileQuery.data?.profile.user
      const nameTrimmed = profileForm.name.trim()
      const nameChanged = original && nameTrimmed !== original.name
      const avatarChanged = original && draftAvatarUrl !== original.avatarUrl
      const coverChanged = original && draftCoverUrl !== original.coverUrl

      if (nameChanged && nameTrimmed.length < 2) {
        throw new Error('이름은 2자 이상이어야 합니다.')
      }

      if (nameChanged || avatarChanged || coverChanged) {
        const { user } = await updateMe(authToken, {
          ...(nameChanged ? { name: nameTrimmed } : {}),
          ...(avatarChanged ? { avatarUrl: draftAvatarUrl } : {}),
          ...(coverChanged ? { coverUrl: draftCoverUrl } : {}),
        })
        setSession(authToken, user)
      }
    },
    onSuccess: () => {
      invalidateProfile()
      setEditOpen(false)
    },
  })

  const openProfileEdit = () => {
    if (profileQuery.data) {
      setDraftAvatarUrl(profileQuery.data.profile.user.avatarUrl)
      setDraftCoverUrl(profileQuery.data.profile.user.coverUrl)
    }
    setEditOpen(true)
  }

  const followMutation = useMutation({
    mutationFn: async () => {
      const profileData = profileQuery.data
      const targetId = profileData?.profile.user.id
      if (!targetId || !token) {
        return
      }
      if (profileData.isFollowing) {
        await unfollowUser(token, targetId)
        return
      }
      await followUser(token, targetId)
    },
    onSuccess: invalidateProfile,
  })

  const data = profileQuery.data
  const isOwnProfile = data?.isOwnProfile ?? isOwnRoute
  const donuts = data?.aiSkillInsights.skillBreakdown ?? []

  return (
    <AppLayout>
      <div className="space-y-6">
        {profileQuery.isLoading ? <LoadingState /> : null}
        {profileQuery.error ? (
          <Card className="border-red-100">
            <CardTitle>프로필을 불러오지 못했습니다</CardTitle>
            <CardDescription className="mt-2">{profileQuery.error.message}</CardDescription>
          </Card>
        ) : null}

        {data ? (
          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="space-y-6 lg:col-span-8">
              {(() => {
                const previewCoverUrl =
                  isOwnProfile && editOpen ? (draftCoverUrl ?? data.profile.user.coverUrl) : data.profile.user.coverUrl
                const previewAvatarUrl =
                  isOwnProfile && editOpen
                    ? (draftAvatarUrl ?? data.profile.user.avatarUrl)
                    : data.profile.user.avatarUrl

                return (
              <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
                <div
                  className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 bg-cover bg-center px-5 pb-16 pt-5 sm:px-6"
                  style={
                    previewCoverUrl
                      ? { backgroundImage: `url(${previewCoverUrl})` }
                      : undefined
                  }
                >
                  <div className="absolute inset-0 bg-slate-900/45" aria-hidden />
                  <div className="relative flex flex-wrap gap-2">
                    {data.profile.headline ? (
                      <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                        {data.profile.headline}
                      </span>
                    ) : isOwnProfile ? (
                      <span className="rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm">
                        직무를 입력하세요
                      </span>
                    ) : null}
                    {data.profile.skills[0] ? (
                      <span className="rounded-full bg-gradient-to-r from-brand-500 to-accent-600 px-4 py-2 text-sm font-semibold text-white shadow-sm">
                        {data.profile.skills[0]}
                      </span>
                    ) : null}
                  </div>
                </div>


                <div className="relative px-5 pb-6 sm:px-6">
                  <div className="-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <ClickableProfileAvatar
                      className="ring-4 ring-white"
                      name={data.profile.user.name}
                      size="xl"
                      src={previewAvatarUrl}
                    />
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <ProfileShareButton userId={data.profile.user.id} />
                      {isOwnProfile ? (
                        <Button
                          className="rounded-full bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-md hover:from-brand-700 hover:to-accent-700"
                          onClick={openProfileEdit}
                          type="button"
                        >
                          프로필 편집
                        </Button>
                      ) : (
                        <Button
                          className="rounded-full"
                          disabled={followMutation.isPending}
                          onClick={() => followMutation.mutate()}
                          type="button"
                          variant={data.isFollowing ? 'secondary' : 'primary'}
                        >
                          {followMutation.isPending
                            ? '처리 중…'
                            : data.isFollowing
                              ? '팔로잉'
                              : '팔로우'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-5">
                    <h1 className="text-2xl font-bold text-ink-strong">{data.profile.user.name}</h1>
                    {data.profile.bio ? (
                      <p className="mt-2 max-w-2xl leading-relaxed text-ink-body">{data.profile.bio}</p>
                    ) : isOwnProfile ? (
                      <p className="mt-2 max-w-2xl text-sm text-ink-muted">
                        소개를 작성하면 프로필 신뢰도와 매칭 품질이 올라갑니다.
                      </p>
                    ) : null}
                    {(data.profile.company || data.profile.location) && (
                      <p className="mt-2 text-sm font-medium text-ink-muted">
                        {[data.profile.company, data.profile.location].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {data.profile.school ? (
                      <p className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-muted">
                        <GraduationCap className="text-brand-600" size={18} />
                        {data.profile.school}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {data.profile.skills.length > 0 ? (
                        data.profile.skills.map((skill) => (
                          <span
                            className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-100"
                            key={skill}
                          >
                            {skill}
                          </span>
                        ))
                      ) : isOwnProfile ? (
                        <span className="text-sm text-ink-muted">기술 태그를 추가해보세요.</span>
                      ) : null}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-6 text-sm">
                      <button
                        className="font-bold text-ink-strong transition hover:text-brand-600"
                        onClick={() => setFollowListKind('followers')}
                        type="button"
                      >
                        <span className="text-base">{data.stats.followerCount}</span>
                        <span className="ml-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          팔로워
                        </span>
                      </button>
                      <button
                        className="font-bold text-ink-strong transition hover:text-brand-600"
                        onClick={() => setFollowListKind('following')}
                        type="button"
                      >
                        <span className="text-base">{data.stats.followingCount}</span>
                        <span className="ml-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          팔로잉
                        </span>
                      </button>
                      <span className="text-ink-muted">
                        <span className="text-base font-bold text-ink-strong">{data.stats.postCount}</span>
                        <span className="ml-1 text-xs font-semibold uppercase tracking-wide">게시물</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
                )
              })()}

              <Card className="overflow-hidden rounded-2xl border-surface-border shadow-sm">
                <Tabs
                  activeTab={profileTab}
                  className="px-5 pb-5 pt-2 sm:px-6"
                  onChange={setProfileTab}
                  variant="underline"
                  tabs={[
                    {
                      id: 'history',
                      label: '이력',
                      content: (
                        <div className="space-y-6" ref={updatesAnchorRef}>
                          {focusUpdates ? (
                            <ProfileUpdatesHighlight
                              data={data}
                              emphasized
                              userName={data.profile.user.name}
                            />
                          ) : null}
                          <ProfileHistoryPanel
                            data={data}
                            onUpdated={invalidateProfile}
                            readOnly={!isOwnProfile}
                            token={token ?? ''}
                          />
                        </div>
                      ),
                    },
                    {
                      id: 'projects',
                      label: `프로젝트${data.projects.length > 0 ? ` (${data.projects.length})` : ''}`,
                      content: (
                        <ProfileProjectsPanel isOwnProfile={isOwnProfile} projects={data.projects} />
                      ),
                    },
                    {
                      id: 'posts',
                      label: `게시물${data.stats.postCount > 0 ? ` (${data.stats.postCount})` : ''}`,
                      content: (
                        <ProfilePostsPanel
                          avatarUrl={data.profile.user.avatarUrl}
                          isOwnProfile={isOwnProfile}
                          token={token ?? ''}
                          userId={data.profile.user.id}
                          userName={data.profile.user.name}
                        />
                      ),
                    },
                  ]}
                />
              </Card>

            </div>

            <aside className="space-y-6 lg:col-span-4">
              <Card className="rounded-2xl border-surface-border shadow-sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>Skill Insights</CardTitle>
                    <Badge tone="purple">
                      {MATURITY_LABELS[data.aiSkillInsights.maturityLevel]}
                    </Badge>
                  </div>
                  <CardDescription>프로필·프로젝트·이력 데이터 기반 요약입니다.</CardDescription>
                </CardHeader>
                {donuts.length > 0 ? (
                  <div className="flex flex-wrap items-start justify-around gap-4 border-t border-surface-border pt-4">
                    {donuts.map((d) => (
                      <DonutStat color={d.color} key={d.label} label={d.label} pct={d.pct} />
                    ))}
                  </div>
                ) : (
                  <p className="border-t border-surface-border pt-4 text-sm text-ink-muted">
                    기술스택·프로젝트를 추가하면 역량 비중 차트가 표시됩니다.
                  </p>
                )}
                <div className="mt-4 flex gap-3 rounded-xl bg-violet-50/80 p-4 ring-1 ring-violet-100">
                  <Sparkles className="mt-0.5 shrink-0 text-accent-600" size={18} />
                  <p className="text-sm leading-relaxed text-ink-body">{data.aiSkillInsights.summary}</p>
                </div>
                {data.aiSkillInsights.recommendedFocus.length > 0 ? (
                  <ul className="mt-4 space-y-2 border-t border-surface-border pt-4 text-sm text-ink-muted">
                    {data.aiSkillInsights.recommendedFocus.map((item) => (
                      <li className="flex gap-2" key={item}>
                        <span className="text-brand-600">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>

              <Card className="rounded-2xl border-surface-border shadow-sm">
                <ProfileGrowthTimeline formatDate={formatDate} items={data.growthTimeline} />
              </Card>

              <Card className="rounded-2xl border-surface-border shadow-sm">
                <CardHeader>
                  <CardTitle>Verified Record</CardTitle>
                  <CardDescription>검증된 프로젝트 기여입니다.</CardDescription>
                </CardHeader>
                {data.verifiedRecords.length > 0 ? (
                  <div className="space-y-3">
                    {data.verifiedRecords.map((record) => (
                      <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-4" key={record.id}>
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="text-brand-600" size={18} />
                          <p className="font-bold text-ink-strong">{record.project.title}</p>
                        </div>
                        <p className="mt-2 text-sm text-ink-muted">{record.contributionSummary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted">아직 검증 기록이 없습니다.</p>
                )}
              </Card>
            </aside>
          </div>
        ) : null}
      </div>

      {data && followListKind ? (
        <ProfileFollowListModal
          kind={followListKind}
          onClose={() => setFollowListKind(null)}
          onFollowChanged={invalidateProfile}
          open
          profileUserId={data.profile.user.id}
          profileUserName={data.profile.user.name}
          token={token ?? ''}
        />
      ) : null}

      {data ? (
        <ProfileEditModal
          avatarUrl={draftAvatarUrl}
          coverUrl={draftCoverUrl}
          errorMessage={updateProfileMutation.error?.message}
          form={profileForm}
          isSaving={updateProfileMutation.isPending}
          onAvatarChange={setDraftAvatarUrl}
          onChange={(patch) => setProfileForm((prev) => ({ ...prev, ...patch }))}
          onClose={() => setEditOpen(false)}
          onCoverChange={setDraftCoverUrl}
          onSubmit={() => updateProfileMutation.mutate()}
          open={editOpen}
        />
      ) : null}
    </AppLayout>
  )
}
