import { ExternalLink, Lock, MapPin, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { HistoryFilter, ProfileOverview } from '../../types/profile'
import { HistoryItemCard } from './HistoryItemCard'
import { ProfileProjectCard } from './ProfileProjectCard'

type ProfileOverviewTabProps = {
  data: ProfileOverview
  onOpenProjects: () => void
  onOpenExperience: (filter: HistoryFilter) => void
}

const SOCIAL_LABELS: Record<string, string> = { website: '웹사이트', github: 'GitHub', linkedin: 'LinkedIn' }

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ink-strong">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="text-xs font-semibold text-brand-600 hover:text-brand-700" onClick={onClick} type="button">
      {children}
    </button>
  )
}

export function ProfileLockedNotice() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-10 text-center">
      <Lock className="text-ink-muted" size={22} />
      <p className="text-sm font-semibold text-ink-strong">상세 프로필이 공개되지 않았습니다</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
        이 사용자는 프로필 공개 범위를 제한했습니다. 팔로우하거나 로그인하면 볼 수 있을 수 있습니다.
      </p>
    </div>
  )
}

export function ProfileOverviewTab({ data, onOpenProjects, onOpenExperience }: ProfileOverviewTabProps) {
  if (!data.canViewDetails) {
    return <ProfileLockedNotice />
  }

  const { profile, featuredProjects, verifiedHighlights, recentHistory, stats, isOwnProfile } = data
  const socialLinks = Object.entries(profile.socialLinks ?? {}).filter(([, url]) => Boolean(url))
  const hasIntro = Boolean(profile.bio || profile.location || profile.interests.length || socialLinks.length)

  return (
    <div className="space-y-8">
      {hasIntro || isOwnProfile ? (
        <Section title="소개">
          {profile.bio ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{profile.bio}</p>
          ) : isOwnProfile ? (
            <p className="text-sm text-ink-muted">소개를 작성하면 프로필 신뢰도와 매칭 품질이 올라갑니다.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            {profile.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={14} />
                {profile.location}
              </span>
            ) : null}
            {socialLinks.map(([key, url]) => (
              <a
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                href={url}
                key={key}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {SOCIAL_LABELS[key] ?? key}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
          {profile.interests.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.interests.map((interest) => (
                <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-body" key={interest}>
                  #{interest}
                </span>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section
        action={stats.projectCount > featuredProjects.length ? <TextButton onClick={onOpenProjects}>프로젝트 {stats.projectCount}개 전체 보기 →</TextButton> : null}
        description={
          data.featuredMode === 'pinned'
            ? '직접 고른 대표 프로젝트입니다.'
            : isOwnProfile
              ? '대표 프로젝트를 고정하지 않아 최근 프로젝트를 보여 줍니다. 프로젝트 탭에서 최대 3개를 고정할 수 있습니다.'
              : '최근 프로젝트입니다.'
        }
        title="대표 프로젝트"
      >
        {featuredProjects.length > 0 ? (
          <div className={featuredProjects.length > 1 ? 'grid gap-4 md:grid-cols-2' : ''}>
            {featuredProjects.map((project) => (
              <ProfileProjectCard key={project.id} project={project} variant="featured" />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-surface-border px-4 py-6 text-center text-sm text-ink-muted">
            {isOwnProfile ? '아직 프로젝트가 없습니다. Projects에서 첫 프로젝트를 만들어 보세요.' : '공개된 프로젝트가 없습니다.'}
          </p>
        )}
      </Section>

      <Section
        action={stats.verifiedCount > verifiedHighlights.length ? <TextButton onClick={() => onOpenExperience('verified')}>검증 성과 {stats.verifiedCount}건 전체 보기 →</TextButton> : null}
        description="기관 담당자가 증빙을 승인했거나 프로그램 수료가 확인된 성과입니다. 직접 등록한 이력과 구분됩니다."
        title="검증된 성과"
      >
        {verifiedHighlights.length > 0 ? (
          <div className="space-y-3">
            {verifiedHighlights.map((item) => (
              <HistoryItemCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-surface-border px-4 py-5 text-sm text-ink-muted">
            <ShieldCheck className="shrink-0" size={16} />
            아직 검증된 성과가 없습니다. 기관 프로그램에서 활동 증빙이 승인되면 표시됩니다.
          </p>
        )}
      </Section>

      <Section
        action={stats.historyCount > recentHistory.length ? <TextButton onClick={() => onOpenExperience('all')}>이력 {stats.historyCount}건 전체 보기 →</TextButton> : null}
        title="최근 이력"
      >
        {recentHistory.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {recentHistory.map((item) => (
              <HistoryItemCard compact item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-surface-border px-4 py-5 text-center text-sm text-ink-muted">
            등록된 이력이 없습니다.
          </p>
        )}
      </Section>
    </div>
  )
}
