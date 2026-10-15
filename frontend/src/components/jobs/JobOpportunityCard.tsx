import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Star, Trash2 } from 'lucide-react'
import { OPPORTUNITY_TYPE_LABEL } from '../../lib/jobsSearch'
import {
  deleteOpportunity,
  enrollOpportunity,
  saveOpportunity,
  unsaveOpportunity,
  withdrawOpportunityEnrollment,
} from '../../services/opportunityService'
import { isProgramOpportunityType, type Opportunity, type OpportunityEnrollment } from '../../types/opportunity'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'

function formatDate(value: string | null) {
  if (!value) {
    return '상시'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

type OpportunityCardProps = {
  opportunity: Opportunity
  enrollment?: OpportunityEnrollment
  token: string
  canManage?: boolean
  onChanged: () => void
}

export function JobOpportunityCard({ opportunity, enrollment, token, canManage = false, onChanged }: OpportunityCardProps) {
  const isProgram = isProgramOpportunityType(opportunity.type)
  const status = enrollment?.status
  const canCancelEnrollment = status === 'APPLIED' || status === 'ENROLLED'
  const canApplyToProgram =
    !enrollment || status === 'WITHDRAWN' || status === 'REJECTED'

  const enrollMutation = useMutation({
    mutationFn: () => enrollOpportunity(token, opportunity.id),
    onSuccess: onChanged,
  })
  const withdrawMutation = useMutation({
    mutationFn: () => withdrawOpportunityEnrollment(token, opportunity.id),
    onSuccess: onChanged,
  })
  const saveMutation = useMutation({
    mutationFn: () =>
      opportunity.saved
        ? unsaveOpportunity(token, opportunity.id)
        : saveOpportunity(token, opportunity.id),
    onSuccess: onChanged,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteOpportunity(token, opportunity.id),
    onSuccess: onChanged,
  })

  const handleDelete = () => {
    const confirmed = window.confirm(
      `「${opportunity.title}」 프로그램을 삭제할까요?\n연결된 참여 신청·저장 기록도 함께 제거됩니다.`,
    )
    if (!confirmed) {
      return
    }
    deleteMutation.mutate()
  }

  const mobileSkillLimit = 3
  const extraSkillCount = Math.max(0, opportunity.skills.length - mobileSkillLimit)

  return (
    <Card className="flex flex-col rounded-xl border-surface-border p-4 shadow-sm lg:rounded-2xl lg:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="purple">{OPPORTUNITY_TYPE_LABEL[opportunity.type] ?? opportunity.type}</Badge>
            {opportunity.isRemote ? <Badge tone="green">Remote</Badge> : null}
            <span className="ml-auto shrink-0 text-sm font-bold text-brand-700 lg:hidden">
              {opportunity.matchScore}
            </span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink-strong lg:mt-4 lg:line-clamp-none lg:text-xl">
            {opportunity.title}
          </h3>
          <p className="mt-0.5 truncate text-sm font-semibold text-brand-700">
            {opportunity.organization}
          </p>
        </div>
        <div className="hidden shrink-0 rounded-2xl bg-surface-muted px-4 py-3 text-center lg:block">
          <p className="text-xs font-semibold text-ink-muted">Match</p>
          <p className="mt-1 text-2xl font-bold text-ink-strong">{opportunity.matchScore}</p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-body lg:mt-4 lg:line-clamp-4 lg:text-base lg:leading-7">
        {opportunity.description}
      </p>
      {opportunity.skills.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5 lg:mt-4">
          {opportunity.skills.map((skill, index) => (
            <Badge
              className={index >= mobileSkillLimit ? 'hidden lg:inline-flex' : ''}
              key={skill}
              tone="blue"
            >
              {skill}
            </Badge>
          ))}
          {extraSkillCount > 0 ? (
            <Badge className="lg:hidden" tone="gray">
              +{extraSkillCount}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-ink-muted lg:hidden">
        {opportunity.location ?? '미정'} · 마감 {formatDate(opportunity.deadline)}
      </p>
      <div className="mt-5 hidden gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-body lg:grid lg:grid-cols-2">
        <p>
          <span className="font-semibold text-ink-strong">위치:</span> {opportunity.location ?? '미정'}
        </p>
        <p>
          <span className="font-semibold text-ink-strong">마감:</span> {formatDate(opportunity.deadline)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 lg:mt-5">
        {canManage ? (
          <Button
            className="gap-2 text-red-700 hover:bg-red-50"
            disabled={deleteMutation.isPending}
            onClick={handleDelete}
            type="button"
            variant="ghost"
          >
            <Trash2 size={16} />
            {deleteMutation.isPending ? '삭제 중…' : '삭제'}
          </Button>
        ) : null}
        <Button className="gap-2" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} variant={opportunity.saved ? 'primary' : 'secondary'}>
          <Star size={16} />
          {opportunity.saved ? '저장됨' : '저장'}
        </Button>
        {opportunity.applyUrl ? (
          <a
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-surface-border bg-white px-5 py-2.5 text-sm font-semibold text-ink-strong transition hover:border-brand-100 hover:bg-brand-50"
            href={opportunity.applyUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink size={16} />
            지원 링크
          </a>
        ) : null}
        {isProgram && canApplyToProgram ? (
          <Button
            disabled={enrollMutation.isPending}
            onClick={() => enrollMutation.mutate()}
            type="button"
          >
            {enrollMutation.isPending ? '신청 중…' : '프로그램 참여 신청'}
          </Button>
        ) : null}
        {isProgram && canCancelEnrollment ? (
          <Button
            disabled={withdrawMutation.isPending}
            onClick={() => withdrawMutation.mutate()}
            type="button"
            variant="secondary"
          >
            {withdrawMutation.isPending
              ? '취소 중…'
              : status === 'ENROLLED'
                ? '참여 취소'
                : '신청 취소'}
          </Button>
        ) : null}
        {isProgram && status === 'COMPLETED' ? (
          <Button disabled type="button" variant="secondary">
            수료 완료
          </Button>
        ) : null}
      </div>
      {enrollMutation.error ? (
        <p className="mt-3 text-sm text-red-600">{enrollMutation.error.message}</p>
      ) : null}
      {withdrawMutation.error ? (
        <p className="mt-3 text-sm text-red-600">{withdrawMutation.error.message}</p>
      ) : null}
      {deleteMutation.error ? (
        <p className="mt-3 text-sm text-red-600">{deleteMutation.error.message}</p>
      ) : null}
    </Card>
  )
}
