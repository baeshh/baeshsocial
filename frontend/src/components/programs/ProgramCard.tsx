import { Building2, CalendarDays, MapPin, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  APPLICATION_STATUS_META,
  DELIVERY_MODE_LABEL,
  PROGRAM_CATEGORY_LABEL,
  RECRUITMENT_STATE_META,
  formatAudiences,
  formatDateTime,
  formatPeriod,
  recruitmentDeadlineHint,
} from '../../lib/programs'
import type { DiscoverableProgram } from '../../types/program'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'

const buttonBase = 'flex-1 rounded-full px-3 py-2 text-center text-sm font-semibold transition'

/** Jobs card for a program. `preview` renders the same card inert, for the creation wizard. */
export function ProgramCard({ program, preview = false }: { program: DiscoverableProgram; preview?: boolean }) {
  const { recruitment, myStatus } = program
  const state = RECRUITMENT_STATE_META[recruitment.state]
  const hint = recruitmentDeadlineHint(recruitment)
  const application = myStatus.application && myStatus.application.status !== 'withdrawn' ? myStatus.application : null
  const audience = formatAudiences(recruitment)
  const canApply = recruitment.state === 'open' && !myStatus.isParticipant && !application
  const href = `/programs/${program.id}`

  const applyLabel = myStatus.isParticipant
    ? '참여 중'
    : application
      ? APPLICATION_STATUS_META[application.status].label
      : recruitment.state === 'open'
        ? '지원하기'
        : recruitment.state === 'scheduled'
          ? '모집 예정'
          : '모집 마감'

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl p-0 transition hover:border-brand-200 hover:shadow-md">
      {recruitment.coverImageUrl ? (
        <img alt="" className="aspect-[16/7] w-full object-cover" src={recruitment.coverImageUrl} />
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={state.tone}>{state.label}</Badge>
          {recruitment.category ? <Badge tone="gray">{PROGRAM_CATEGORY_LABEL[recruitment.category]}</Badge> : null}
          {hint ? <span className="text-xs font-semibold text-accent-600">{hint}</span> : null}
        </div>
        {preview ? (
          <p className="mt-2 line-clamp-2 text-base font-bold text-ink-strong">{program.title || '프로그램 이름'}</p>
        ) : (
          <Link className="mt-2 line-clamp-2 text-base font-bold text-ink-strong hover:text-brand-700" to={href}>
            {program.title}
          </Link>
        )}
        <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-medium text-ink-muted">
          <Building2 className="shrink-0" size={13} />
          <span className="truncate">
            {program.organization.name}
            {audience ? ` · ${audience}` : ''}
          </span>
        </p>
        <div className="mt-auto space-y-1 pt-4 text-xs text-ink-body">
          {recruitment.capacity ? (
            <p className="flex items-center gap-1">
              <Users className="shrink-0 text-ink-muted" size={12} />
              {recruitment.mode === 'mixed' && recruitment.openSeats !== null
                ? `정원 ${recruitment.capacity}명 · 추가 모집 ${recruitment.openSeats}명`
                : `모집 ${recruitment.capacity}명`}
            </p>
          ) : null}
          {recruitment.applyEndAt && (recruitment.mode === 'open' || recruitment.mode === 'mixed') ? (
            <p className="flex items-center gap-1">
              <CalendarDays className="shrink-0 text-ink-muted" size={12} /> 모집 마감 {formatDateTime(recruitment.applyEndAt)}
            </p>
          ) : null}
          {program.startDate || program.endDate ? (
            <p className="flex items-center gap-1">
              <CalendarDays className="shrink-0 text-ink-muted" size={12} /> 운영 {formatPeriod(program.startDate, program.endDate)}
            </p>
          ) : null}
          {recruitment.deliveryMode || recruitment.location ? (
            <p className="flex items-center gap-1">
              <MapPin className="shrink-0 text-ink-muted" size={12} />
              <span className="truncate">
                {[recruitment.deliveryMode ? DELIVERY_MODE_LABEL[recruitment.deliveryMode] : null, recruitment.location].filter(Boolean).join(' · ')}
              </span>
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2">
          {preview ? (
            <>
              <span className={`${buttonBase} border border-surface-border text-ink-strong`}>상세 보기</span>
              <span className={`${buttonBase} ${canApply ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'}`}>{applyLabel}</span>
            </>
          ) : (
            <>
              <Link className={`${buttonBase} border border-surface-border text-ink-strong hover:border-brand-200`} to={href}>
                상세 보기
              </Link>
              {canApply ? (
                <Link className={`${buttonBase} bg-brand-600 text-white hover:bg-brand-700`} to={`${href}#apply`}>
                  {applyLabel}
                </Link>
              ) : (
                <span aria-disabled className={`${buttonBase} cursor-not-allowed bg-surface-muted text-ink-muted`}>
                  {applyLabel}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
