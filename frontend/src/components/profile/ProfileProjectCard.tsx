import { Lock, Pin, PinOff, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatDay, formatMonth } from '../../lib/profileFormat'
import type { ProfileProjectCard as ProjectCardData } from '../../types/profile'
import { ProjectLinkChips } from '../projects/ProjectLinkChips'

const STATUS_LABELS: Record<NonNullable<ProjectCardData['status']>, string> = {
  PLANNING: '기획 중',
  ACTIVE: '진행 중',
  COMPLETED: '완료',
  ARCHIVED: '보관됨',
}

type ProfileProjectCardProps = {
  project: ProjectCardData
  variant?: 'featured' | 'list'
  /** Rendered for the profile owner to pin/unpin featured projects. */
  pin?: { pinned: boolean; disabled: boolean; onToggle: () => void }
  linkToProject?: boolean
}

function projectPeriod(project: ProjectCardData) {
  const from = formatMonth(project.startDate)
  const to = project.endDate ? formatMonth(project.endDate) : project.status === 'COMPLETED' || !project.status ? null : '진행 중'
  if (from) return to ? `${from} – ${to}` : from
  return `최근 업데이트 ${formatDay(project.updatedAt)}`
}

export function ProfileProjectCard({ project, variant = 'list', pin, linkToProject = true }: ProfileProjectCardProps) {
  const limited = project.access === 'limited'
  const featured = variant === 'featured'
  const title = (
    <h3 className={cn('font-bold leading-snug text-ink-strong', featured ? 'text-lg' : 'text-base')}>{project.title}</h3>
  )

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5',
        project.verification ? 'border-emerald-200' : 'border-surface-border',
        !limited && linkToProject && 'hover:border-brand-200 hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!limited && linkToProject ? (
            <Link className="hover:text-brand-700 hover:underline" to={`/projects/${project.id}`}>
              {title}
            </Link>
          ) : (
            title
          )}
          <p className="mt-1 text-sm font-medium text-ink-body">
            {project.role}
            {project.teamName ? ` · ${project.teamName}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {project.featured && !pin ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
              <Pin size={12} />
              대표
            </span>
          ) : null}
          {pin ? (
            <button
              aria-pressed={pin.pinned}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ring-1 transition disabled:cursor-not-allowed disabled:opacity-50',
                pin.pinned
                  ? 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100'
                  : 'bg-white text-ink-muted ring-surface-border hover:text-ink-strong',
              )}
              disabled={pin.disabled}
              onClick={pin.onToggle}
              title={pin.pinned ? '대표 프로젝트에서 해제' : '대표 프로젝트로 고정 (최대 3개)'}
              type="button"
            >
              {pin.pinned ? <PinOff size={13} /> : <Pin size={13} />}
              {pin.pinned ? '고정됨' : '대표로 고정'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {project.status ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-semibold text-ink-body">{STATUS_LABELS[project.status]}</span>
        ) : null}
        {project.program ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
            {project.program.organizationName} · {project.program.title}
          </span>
        ) : (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 font-semibold text-ink-muted">개인 프로젝트</span>
        )}
        <span className="text-ink-muted">{projectPeriod(project)}</span>
      </div>

      {limited ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface-muted/70 px-3 py-2 text-xs leading-relaxed text-ink-muted">
          <Lock className="mt-0.5 shrink-0" size={13} />
          팀 전용 프로젝트입니다. 참여자가 공개를 허용한 기관 인증 기록만 표시됩니다.
        </p>
      ) : (
        <>
          {project.description ? (
            <p className={cn('mt-3 text-sm leading-relaxed text-ink-muted', featured ? 'line-clamp-3' : 'line-clamp-2')}>
              {project.description}
            </p>
          ) : null}
          {project.highlight ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/70 px-3 py-2 text-sm text-brand-900">
              <Sparkles className="mt-0.5 shrink-0 text-brand-600" size={14} />
              <span className="line-clamp-3">
                <span className="font-semibold">핵심 성과 </span>
                {project.highlight}
              </span>
            </p>
          ) : null}
        </>
      )}

      {project.skills.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.skills.slice(0, featured ? 8 : 5).map((skill) => (
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800" key={skill}>
              {skill}
            </span>
          ))}
          {project.skills.length > (featured ? 8 : 5) ? (
            <span className="text-xs text-ink-muted">+{project.skills.length - (featured ? 8 : 5)}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-4">
        {project.verification?.official ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-white">
              <ShieldCheck size={13} /> 기관 공식 인증 완료
            </span>
            {project.verification.issuer}
            {project.verification.officialRole ? ` · ${project.verification.officialRole}` : ''}
          </p>
        ) : project.verification ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <ShieldCheck size={14} />
            {project.verification.issuer ?? 'BAESH'} 검증 {project.verification.count}건
            {project.verification.verifiedAt ? (
              <span className="font-normal text-emerald-700/80">· 최근 승인 {formatDay(project.verification.verifiedAt)}</span>
            ) : null}
          </p>
        ) : null}
        <ProjectLinkChips links={project.links} max={featured ? 5 : 3} />
      </div>
    </article>
  )
}
