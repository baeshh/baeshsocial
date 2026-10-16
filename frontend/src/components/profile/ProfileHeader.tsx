import { BadgeCheck, Building2, Eye, GraduationCap } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PROFILE_VISIBILITY_META } from '../../lib/profileFormat'
import type { ProfileOverview } from '../../types/profile'
import { Button } from '../common/Button'
import { ClickableProfileAvatar } from './ProfileAvatarLightbox'
import { ProfileShareButton } from './ProfileShareButton'

export type ProfileStatTarget = 'projects' | 'experience' | 'verified' | 'activity'

type ProfileHeaderProps = {
  data: ProfileOverview
  avatarUrl: string | null
  coverUrl: string | null
  actions?: ReactNode
  showShare?: boolean
  onStatClick?: (target: ProfileStatTarget) => void
  onFollowListClick?: (kind: 'followers' | 'following') => void
}

const MAX_SKILL_CHIPS = 10

export function ProfileHeader({
  data,
  avatarUrl,
  coverUrl,
  actions,
  showShare = true,
  onStatClick,
  onFollowListClick,
}: ProfileHeaderProps) {
  const { user, profile, affiliations, stats, isOwnProfile } = data
  const primaryOrg = affiliations[0]?.name ?? profile.company ?? null
  const summaryParts = [profile.headline, primaryOrg, profile.interests[0]].filter(Boolean)
  const summary = profile.headline || profile.interests[0] ? summaryParts : []
  const visibility = profile.visibility ? PROFILE_VISIBILITY_META[profile.visibility] : null

  const statTiles: { id: ProfileStatTarget; label: string; value: number; accent?: boolean }[] = [
    { id: 'projects', label: '프로젝트', value: stats.projectCount },
    { id: 'experience', label: '활동 이력', value: stats.historyCount },
    { id: 'verified', label: '검증 성과', value: stats.verifiedCount, accent: true },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
      <div
        className="relative h-28 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 bg-cover bg-center sm:h-36"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-slate-900/30" aria-hidden />
      </div>

      <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-3 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <ClickableProfileAvatar className="ring-4 ring-white" name={user.name} size="xl" src={avatarUrl} />
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {showShare ? <ProfileShareButton userId={user.id} /> : null}
            {actions}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink-strong">{user.name}</h1>
            {isOwnProfile && visibility ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-ink-muted"
                title={visibility.description}
              >
                <Eye size={12} />
                {visibility.label}
              </span>
            ) : null}
          </div>
          {summary.length > 0 ? (
            <p className="mt-1 text-sm font-medium text-ink-body sm:text-base">{summary.join(' · ')}</p>
          ) : isOwnProfile ? (
            <p className="mt-1 text-sm text-ink-muted">직무·소속·전문 분야를 입력해 프로필을 완성해 보세요.</p>
          ) : null}

          {affiliations.length > 0 || profile.school ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {affiliations.map((org) => (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                  key={org.organizationId}
                  title="BAESH가 인증한 기관의 구성원입니다."
                >
                  <Building2 size={13} />
                  {org.name}
                  {org.title ? <span className="font-normal text-emerald-700">· {org.title}</span> : null}
                  <BadgeCheck className="text-emerald-600" size={13} />
                </span>
              ))}
              {profile.school && !affiliations.some((org) => org.name === profile.school) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 font-semibold text-ink-body">
                  <GraduationCap size={13} />
                  {profile.school}
                </span>
              ) : null}
            </div>
          ) : null}

          {profile.skills.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.skills.slice(0, MAX_SKILL_CHIPS).map((skill) => (
                <span
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-100"
                  key={skill}
                >
                  {skill}
                </span>
              ))}
              {profile.skills.length > MAX_SKILL_CHIPS ? (
                <span className="px-1 py-1 text-xs text-ink-muted">+{profile.skills.length - MAX_SKILL_CHIPS}</span>
              ) : null}
            </div>
          ) : isOwnProfile ? (
            <p className="mt-3 text-sm text-ink-muted">기술 태그를 추가해 보세요.</p>
          ) : null}

          {data.canViewDetails ? (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
              {statTiles.map((tile) => (
                <button
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm',
                    tile.accent
                      ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
                      : 'border-surface-border bg-surface-muted/40 hover:border-brand-200',
                  )}
                  key={tile.id}
                  onClick={() => onStatClick?.(tile.id)}
                  type="button"
                >
                  <span className={cn('block text-lg font-bold', tile.accent ? 'text-emerald-700' : 'text-ink-strong')}>
                    {tile.value}
                  </span>
                  <span className="block text-xs font-medium text-ink-muted">{tile.label}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <FollowStat label="팔로워" onClick={onFollowListClick ? () => onFollowListClick('followers') : undefined} value={stats.followerCount} />
            <FollowStat label="팔로잉" onClick={onFollowListClick ? () => onFollowListClick('following') : undefined} value={stats.followingCount} />
            {data.canViewDetails ? (
              <FollowStat label="게시물" onClick={onStatClick ? () => onStatClick('activity') : undefined} value={stats.postCount} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function FollowStat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const content = (
    <>
      <span className="font-bold text-ink-strong">{value}</span>
      <span className="ml-1 text-xs font-semibold text-ink-muted">{label}</span>
    </>
  )
  return onClick ? (
    <button className="transition hover:text-brand-600" onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <span>{content}</span>
  )
}

export function FollowButton({
  following,
  pending,
  onClick,
}: {
  following: boolean
  pending: boolean
  onClick: () => void
}) {
  return (
    <Button className="rounded-full" disabled={pending} onClick={onClick} variant={following ? 'secondary' : 'primary'}>
      {pending ? '처리 중…' : following ? '팔로잉' : '팔로우'}
    </Button>
  )
}
