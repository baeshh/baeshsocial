import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatDay } from '../../lib/profileFormat'
import type { HistoryVerification } from '../../types/profile'

type VerificationBadgeProps = {
  verification: HistoryVerification
  /** detailed: also show the approval date and program on a second line. */
  detailed?: boolean
  className?: string
}

function verificationSummary(verification: HistoryVerification) {
  if (verification.kind === 'institution') {
    return `${verification.issuer ?? '기관'} ${verification.label}`
  }
  if (verification.kind === 'program') {
    return `${verification.issuer ?? '프로그램'} ${verification.label}`
  }
  return verification.issuer ? `${verification.issuer} ${verification.label}` : `BAESH ${verification.label}`
}

export function VerificationBadge({ verification, detailed = false, className }: VerificationBadgeProps) {
  const institution = verification.kind === 'institution'
  const Icon = institution ? ShieldCheck : BadgeCheck
  const date = formatDay(verification.verifiedAt)

  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <span
        className={cn(
          'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
          institution
            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : verification.kind === 'program'
              ? 'bg-brand-50 text-brand-700 ring-brand-100'
              : 'bg-violet-50 text-violet-700 ring-violet-100',
        )}
        title={institution ? '기관 담당자가 제출된 증빙을 확인하고 승인한 활동입니다.' : undefined}
      >
        <Icon className="shrink-0" size={14} />
        {institution ? '기관 검증' : verification.kind === 'program' ? '수료 인증' : 'BAESH 확인'}
      </span>
      {detailed ? (
        <span className="text-xs text-ink-muted">
          {verificationSummary(verification)}
          {date ? ` · ${date}` : ''}
          {verification.programTitle ? ` · ${verification.programTitle}` : ''}
          {verification.verifiedBy ? ` · 승인 ${verification.verifiedBy}` : ''}
        </span>
      ) : null}
    </div>
  )
}
