import { ArrowRight, ShieldCheck } from 'lucide-react'
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

/**
 * Jobs card for a program run on BAESH, laid out like the posted-opportunity card. `preview` renders the same
 * card inert, for the creation wizard. Programs are only listed for verified organizations.
 */
export function ProgramCard({ program, preview = false }: { program: DiscoverableProgram; preview?: boolean }) {
  const { recruitment, myStatus } = program
  const hint = recruitmentDeadlineHint(recruitment)
  const application = myStatus.application && myStatus.application.status !== 'withdrawn' ? myStatus.application : null
  const audience = formatAudiences(recruitment)
  const canApply = recruitment.state === 'open' && !myStatus.isParticipant && !application
  const takesApplications = recruitment.mode === 'open' || recruitment.mode === 'mixed'
  const href = `/programs/${program.id}`

  const status = myStatus.isParticipant
    ? { label: '참여 중', tone: 'green' as const }
    : application
      ? APPLICATION_STATUS_META[application.status]
      : RECRUITMENT_STATE_META[recruitment.state]
  const place = [recruitment.deliveryMode ? DELIVERY_MODE_LABEL[recruitment.deliveryMode] : null, recruitment.location].filter(Boolean).join(' · ')
  const details = [
    audience,
    recruitment.capacity
      ? recruitment.mode === 'mixed' && recruitment.openSeats !== null
        ? `정원 ${recruitment.capacity}명 · 추가 모집 ${recruitment.openSeats}명`
        : `모집 ${recruitment.capacity}명`
      : null,
    program.startDate || program.endDate ? `운영 ${formatPeriod(program.startDate, program.endDate)}` : null,
  ].filter(Boolean)

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition hover:border-brand-200 hover:shadow-md">
      {recruitment.coverImageUrl ? <img alt="" className="aspect-[16/6] w-full object-cover" src={recruitment.coverImageUrl} /> : null}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-1">
          <Badge tone="blue">기관 운영 프로그램</Badge>
          {recruitment.category ? <Badge tone="gray">{PROGRAM_CATEGORY_LABEL[recruitment.category]}</Badge> : null}
          {takesApplications ? <Badge tone="gray">BAESH 지원</Badge> : null}
        </div>
        <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink-strong">
          {preview ? (
            program.title || '프로그램 이름'
          ) : (
            <Link className="hover:text-brand-700" to={href}>
              {program.title}
            </Link>
          )}
        </h3>
        <p className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-ink-muted">
          <span className="truncate font-semibold text-ink-body">{program.organization.name}</span>
          <ShieldCheck aria-hidden className="shrink-0 text-success-600" size={14} />
          <span className="shrink-0 text-xs font-semibold text-success-700">인증 기관</span>
        </p>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          {[place || null, recruitment.applyEndAt && takesApplications ? `모집 마감 ${formatDateTime(recruitment.applyEndAt)}` : null]
            .filter(Boolean)
            .join(' · ') || '진행 방식·일정은 상세에서 확인'}
        </p>
        {details.length > 0 ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-body">{details.join(' · ')}</p> : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            {hint && !application && !myStatus.isParticipant ? <span className="text-xs font-semibold text-warning-700">{hint}</span> : null}
          </div>
          {preview ? (
            <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700">
              {canApply ? '지원하기' : '상세 보기'}
              <ArrowRight aria-hidden size={15} />
            </span>
          ) : (
            <div className="flex items-center gap-3">
              {canApply ? (
                <Link className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700" to={`${href}#apply`}>
                  지원하기<span className="sr-only">: {program.title}</span>
                </Link>
              ) : null}
              <Link className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={href}>
                상세 보기<span className="sr-only">: {program.title}</span>
                <ArrowRight aria-hidden size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
