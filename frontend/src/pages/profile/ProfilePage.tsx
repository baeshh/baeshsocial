import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs } from '../../components/common/Tabs'
import { AppLayout } from '../../components/layout/AppLayout'
import { ProfileEditModal, type ProfileEditFormState } from '../../components/profile/ProfileEditModal'
import { ProfileExperienceTab } from '../../components/profile/ProfileExperienceTab'
import { ProfileFollowListModal } from '../../components/profile/ProfileFollowListModal'
import { FollowButton, ProfileHeader, type ProfileStatTarget } from '../../components/profile/ProfileHeader'
import { ProfileLockedNotice, ProfileOverviewTab } from '../../components/profile/ProfileOverviewTab'
import { ProfilePostsPanel } from '../../components/profile/ProfilePostsPanel'
import { ProfileProjectsTab } from '../../components/profile/ProfileProjectsTab'
import { HISTORY_FILTERS } from '../../lib/profileFormat'
import { uploadDataUrlIfNeeded } from '../../services/mediaService'
import { getProfileOverview, updateMyProfile } from '../../services/profileService'
import { followUser, unfollowUser, updateMe } from '../../services/userService'
import { useAuthStore } from '../../stores/authStore'
import type { AISkillInsights, HistoryFilter, ProfileOverview } from '../../types/profile'

type ProfileTab = 'overview' | 'projects' | 'experience' | 'activity'
const PROFILE_TABS: ProfileTab[] = ['overview', 'projects', 'experience', 'activity']

const MATURITY_LABELS = {
  foundation: '기초 단계',
  growing: '성장 단계',
  advanced: '고급 단계',
} as const

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

function toEditForm(data: ProfileOverview): ProfileEditFormState {
  const { profile, user } = data
  return {
    name: user.name,
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
    visibility: (profile.visibility ?? 'PUBLIC').toLowerCase() as ProfileEditFormState['visibility'],
    talentSearchOptIn: profile.talentSearchOptIn ?? false,
  }
}

function parseTab(searchParams: URLSearchParams): ProfileTab {
  if (searchParams.get('section') === 'updates') return 'experience'
  const tab = searchParams.get('tab') as ProfileTab | null
  return tab && PROFILE_TABS.includes(tab) ? tab : 'overview'
}

function parseHistoryFilter(searchParams: URLSearchParams): HistoryFilter {
  const type = searchParams.get('type') as HistoryFilter | null
  return type && HISTORY_FILTERS.some((filter) => filter.id === type) ? type : 'all'
}

export function ProfilePage() {
  const { userId: routeUserId } = useParams<{ userId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useAuthStore((state) => state.token)
  const sessionUser = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [followListKind, setFollowListKind] = useState<'followers' | 'following' | null>(null)
  const [draftAvatarUrl, setDraftAvatarUrl] = useState<string | null>(null)
  const [draftCoverUrl, setDraftCoverUrl] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState<ProfileEditFormState | null>(null)

  const viewingUserId = routeUserId ?? sessionUser?.id ?? ''
  const activeTab = parseTab(searchParams)
  const historyFilter = parseHistoryFilter(searchParams)

  const overviewQuery = useQuery({
    queryKey: ['profiles', viewingUserId, 'overview'],
    queryFn: () => getProfileOverview(token, viewingUserId),
    enabled: Boolean(token && viewingUserId),
  })
  const data = overviewQuery.data
  const isOwnProfile = data?.isOwnProfile ?? false

  useEffect(() => {
    if (data && !data.isOwnProfile) {
      void queryClient.invalidateQueries({ queryKey: ['search', 'recommended'] })
    }
  }, [data, queryClient])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [viewingUserId])

  const navigateTab = (tab: ProfileTab, filter?: HistoryFilter) => {
    const next = new URLSearchParams()
    if (tab !== 'overview') next.set('tab', tab)
    if (tab === 'experience' && filter && filter !== 'all') next.set('type', filter)
    setSearchParams(next, { replace: true })
  }

  const handleStatClick = (target: ProfileStatTarget) => {
    if (target === 'verified') navigateTab('experience', 'verified')
    else navigateTab(target)
  }

  const invalidateProfile = () => {
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    void queryClient.invalidateQueries({ queryKey: ['users'] })
  }

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!data || !profileForm || !token) return
      const nameTrimmed = profileForm.name.trim()
      const nameChanged = nameTrimmed !== data.user.name
      if (nameChanged && nameTrimmed.length < 2) {
        throw new Error('이름은 2자 이상이어야 합니다.')
      }

      await updateMyProfile(token, {
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
        visibility: profileForm.visibility,
        talentSearchOptIn: profileForm.talentSearchOptIn,
      })

      const avatarChanged = draftAvatarUrl !== data.user.avatarUrl
      const coverChanged = draftCoverUrl !== data.user.coverUrl
      if (nameChanged || avatarChanged || coverChanged) {
        const [avatarUrl, coverUrl] = await Promise.all([
          avatarChanged ? uploadDataUrlIfNeeded(token, draftAvatarUrl, 'avatar') : Promise.resolve(undefined),
          coverChanged ? uploadDataUrlIfNeeded(token, draftCoverUrl, 'cover') : Promise.resolve(undefined),
        ])
        const { user } = await updateMe(token, {
          ...(nameChanged ? { name: nameTrimmed } : {}),
          ...(avatarChanged ? { avatarUrl } : {}),
          ...(coverChanged ? { coverUrl } : {}),
        })
        setSession(token, user)
      }
    },
    onSuccess: () => {
      invalidateProfile()
      void queryClient.invalidateQueries({ queryKey: ['posts'] })
      setEditOpen(false)
    },
  })

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!data || !token) return
      if (data.isFollowing) {
        await unfollowUser(token, data.user.id)
      } else {
        await followUser(token, data.user.id)
      }
    },
    onSuccess: invalidateProfile,
  })

  const openProfileEdit = () => {
    if (!data) return
    setProfileForm(toEditForm(data))
    setDraftAvatarUrl(data.user.avatarUrl)
    setDraftCoverUrl(data.user.coverUrl)
    updateProfileMutation.reset()
    setEditOpen(true)
  }

  const headerActions = data ? (
    isOwnProfile ? (
      <Button
        className="rounded-full bg-gradient-to-r from-brand-600 to-accent-600 text-white shadow-md hover:from-brand-700 hover:to-accent-700"
        onClick={openProfileEdit}
      >
        프로필 편집
      </Button>
    ) : (
      <FollowButton following={data.isFollowing} onClick={() => followMutation.mutate()} pending={followMutation.isPending} />
    )
  ) : null

  return (
    <AppLayout>
      <div className="space-y-6">
        {overviewQuery.isLoading ? <LoadingState /> : null}
        {overviewQuery.error ? (
          <Card className="border-red-100">
            <CardTitle>프로필을 불러오지 못했습니다</CardTitle>
            <CardDescription className="mt-2">{overviewQuery.error.message}</CardDescription>
          </Card>
        ) : null}

        {data ? (
          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="min-w-0 space-y-6 lg:col-span-8">
              <ProfileHeader
                actions={headerActions}
                avatarUrl={editOpen ? draftAvatarUrl : data.user.avatarUrl}
                coverUrl={editOpen ? draftCoverUrl : data.user.coverUrl}
                data={data}
                onFollowListClick={setFollowListKind}
                onStatClick={handleStatClick}
              />

              <Card className="overflow-hidden rounded-2xl border-surface-border shadow-sm">
                <Tabs
                  activeTab={activeTab}
                  className="px-4 pb-5 pt-2 sm:px-6"
                  onChange={(tab) => navigateTab(tab as ProfileTab)}
                  tabs={[
                    {
                      id: 'overview',
                      label: '개요',
                      content: (
                        <ProfileOverviewTab
                          data={data}
                          onOpenExperience={(filter) => navigateTab('experience', filter)}
                          onOpenProjects={() => navigateTab('projects')}
                        />
                      ),
                    },
                    {
                      id: 'projects',
                      label: `프로젝트${data.stats.projectCount ? ` ${data.stats.projectCount}` : ''}`,
                      content: data.canViewDetails ? (
                        <ProfileProjectsTab
                          featuredProjectIds={data.profile.featuredProjectIds ?? []}
                          isOwnProfile={isOwnProfile}
                          onChanged={invalidateProfile}
                          token={token}
                          userId={data.user.id}
                        />
                      ) : (
                        <ProfileLockedNotice />
                      ),
                    },
                    {
                      id: 'experience',
                      label: `경력·이력${data.stats.historyCount ? ` ${data.stats.historyCount}` : ''}`,
                      content: data.canViewDetails ? (
                        <ProfileExperienceTab
                          counts={data.historyCounts}
                          filter={historyFilter}
                          isOwnProfile={isOwnProfile}
                          onChanged={invalidateProfile}
                          onFilterChange={(filter) => navigateTab('experience', filter)}
                          token={token}
                          userId={data.user.id}
                        />
                      ) : (
                        <ProfileLockedNotice />
                      ),
                    },
                    {
                      id: 'activity',
                      label: `활동${data.stats.postCount ? ` ${data.stats.postCount}` : ''}`,
                      content: data.canViewDetails ? (
                        <ProfilePostsPanel
                          avatarUrl={data.user.avatarUrl}
                          isOwnProfile={isOwnProfile}
                          token={token ?? ''}
                          userId={data.user.id}
                          userName={data.user.name}
                        />
                      ) : (
                        <ProfileLockedNotice />
                      ),
                    },
                  ]}
                  variant="underline"
                />
              </Card>
            </div>

            <aside className="space-y-6 lg:col-span-4">
              {data.aiSkillInsights ? <SkillInsightsCard insights={data.aiSkillInsights} /> : null}
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
          profileUserId={data.user.id}
          profileUserName={data.user.name}
          token={token ?? ''}
        />
      ) : null}

      {data && profileForm ? (
        <ProfileEditModal
          avatarUrl={draftAvatarUrl}
          coverUrl={draftCoverUrl}
          errorMessage={updateProfileMutation.error?.message}
          form={profileForm}
          isSaving={updateProfileMutation.isPending}
          onAvatarChange={setDraftAvatarUrl}
          onChange={(patch) => setProfileForm((prev) => (prev ? { ...prev, ...patch } : prev))}
          onClose={() => setEditOpen(false)}
          onCoverChange={setDraftCoverUrl}
          onSubmit={() => updateProfileMutation.mutate()}
          open={editOpen}
        />
      ) : null}
    </AppLayout>
  )
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
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-strong">{pct}%</span>
      </div>
      <p className="max-w-[6.5rem] text-xs font-medium leading-snug text-ink-muted">{label}</p>
    </div>
  )
}

function SkillInsightsCard({ insights }: { insights: AISkillInsights }) {
  return (
    <Card className="rounded-2xl border-surface-border shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Skill Insights</CardTitle>
          <Badge tone="purple">{MATURITY_LABELS[insights.maturityLevel]}</Badge>
        </div>
        <CardDescription>프로필·프로젝트·이력 데이터 기반 요약입니다.</CardDescription>
      </CardHeader>
      {insights.skillBreakdown.length > 0 ? (
        <div className="flex flex-wrap items-start justify-around gap-4 border-t border-surface-border pt-4">
          {insights.skillBreakdown.map((d) => (
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
        <p className="text-sm leading-relaxed text-ink-body">{insights.summary}</p>
      </div>
      {insights.recommendedFocus.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-surface-border pt-4 text-sm text-ink-muted">
          {insights.recommendedFocus.map((item) => (
            <li className="flex gap-2" key={item}>
              <span className="text-brand-600">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}
