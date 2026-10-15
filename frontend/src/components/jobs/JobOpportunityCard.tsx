import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { opportunityDeadline, opportunityKindLabel, opportunityStatus, safeExternalUrl } from '../../lib/opportunityDisplay'
import { isProgramOpportunityType, type Opportunity, type OpportunityEnrollment } from '../../types/opportunity'
import { Badge } from '../common/Badge'
import { SaveOpportunityButton } from './SaveOpportunityButton'

const SKILL_LIMIT = 3

/** Jobs card for a posted opportunity, laid out like the institution program card so both read the same way. */
export function JobOpportunityCard({
  opportunity,
  enrollment,
  token,
  showMatch,
}: {
  opportunity: Opportunity
  enrollment?: OpportunityEnrollment
  token: string
  /** Name matched profile skills only when the viewer has skills on their profile. */
  showMatch: boolean
}) {
  const href = `/opportunities/${opportunity.id}`
  const deadline = opportunityDeadline(opportunity.deadline)
  const status = opportunityStatus(opportunity, enrollment)
  const external = Boolean(safeExternalUrl(opportunity.applyUrl))
  const internal = isProgramOpportunityType(opportunity.type)
  const matched = showMatch ? (opportunity.matchedSkills ?? []) : []
  const place = [opportunity.isRemote ? '원격 가능' : null, opportunity.location].filter(Boolean).join(' · ')

  return (
    <article className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-md sm:p-5">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <Badge tone="purple">{opportunityKindLabel(opportunity)}</Badge>
          {external ? (
            <Badge icon={<ExternalLink aria-hidden size={11} />} tone="gray">
              외부 지원
            </Badge>
          ) : null}
          {internal ? <Badge tone="gray">BAESH 신청</Badge> : null}
        </div>
        <SaveOpportunityButton compact opportunity={opportunity} token={token} />
      </div>

      <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink-strong">
        <Link className="hover:text-brand-700" to={href}>
          {opportunity.title}
        </Link>
      </h3>
      <p className="mt-1 truncate text-[13px] text-ink-muted">
        <span className="font-semibold text-ink-body">{opportunity.organization}</span>
        {place ? ` · ${place}` : ''}
        {` · 마감 ${deadline.dateLabel}`}
      </p>

      {matched.length > 0 ? (
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-success-700">
          <Sparkles aria-hidden className="shrink-0" size={13} />
          <span className="truncate">내 스킬 일치: {matched.join(', ')}</span>
        </p>
      ) : null}
      {opportunity.skills.length > 0 ? (
        <ul aria-label="요구 스킬" className="mt-2 flex flex-wrap gap-1">
          {opportunity.skills.slice(0, SKILL_LIMIT).map((skill) => (
            <li className="rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-body" key={skill}>
              {skill}
            </li>
          ))}
          {opportunity.skills.length > SKILL_LIMIT ? (
            <li className="px-1 py-0.5 text-[11px] font-medium text-ink-muted">+{opportunity.skills.length - SKILL_LIMIT}</li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {!deadline.closed && opportunity.deadline ? <span className="text-xs font-semibold text-warning-700">{deadline.label}</span> : null}
        </div>
        <Link className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={href}>
          상세 보기<span className="sr-only">: {opportunity.title}</span>
          <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    </article>
  )
}
