import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import {
  getMyEnrollments,
  withdrawOpportunityEnrollment,
} from '../../services/opportunityService'
import { isProgramOpportunityType } from '../../types/opportunity'
import type { OpportunityEnrollment, OpportunityEnrollmentStatus } from '../../types/opportunity'

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function enrollmentStatusLabel(status: OpportunityEnrollmentStatus) {
  switch (status) {
    case 'APPLIED':
      return '신청 대기'
    case 'ENROLLED':
      return '선정 · 수강 중'
    case 'COMPLETED':
      return '수료 완료'
    case 'REJECTED':
      return '미선정'
    default:
      return status
  }
}

function enrollmentStatusTone(status: OpportunityEnrollmentStatus) {
  switch (status) {
    case 'APPLIED':
      return 'blue' as const
    case 'ENROLLED':
      return 'purple' as const
    case 'COMPLETED':
      return 'green' as const
    case 'REJECTED':
      return 'gray' as const
    default:
      return 'gray' as const
  }
}

type MyEnrollmentsPanelProps = {
  token: string
}

export function MyEnrollmentsPanel({ token }: MyEnrollmentsPanelProps) {
  const queryClient = useQueryClient()
  const enrollmentsQuery = useQuery({
    queryKey: ['opportunities', 'enrollments', 'me'],
    queryFn: () => getMyEnrollments(token),
    enabled: Boolean(token),
  })

  const visibleEnrollments = (enrollmentsQuery.data?.enrollments ?? []).filter(
    (enrollment) => enrollment.status !== 'WITHDRAWN',
  )

  const withdrawMutation = useMutation({
    mutationFn: (opportunityId: string) => withdrawOpportunityEnrollment(token, opportunityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities', 'enrollments', 'me'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })

  if (enrollmentsQuery.isLoading) {
    return <LoadingState />
  }

  if (visibleEnrollments.length === 0) {
    return (
      <Card className="rounded-2xl border-surface-border p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-ink-muted">
          진행 중인 프로그램 신청이 없습니다. 프로그램 탐색에서 신청해 보세요.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        신청·선정·수료 상태는 본인만 볼 수 있습니다. 프로필 이력에는 선정·수료된 프로그램만
        표시됩니다.
      </p>
      {visibleEnrollments.map((enrollment) => (
        <EnrollmentRow
          enrollment={enrollment}
          key={enrollment.id}
          onWithdraw={() => withdrawMutation.mutate(enrollment.opportunityId)}
          withdrawing={
            withdrawMutation.isPending &&
            withdrawMutation.variables === enrollment.opportunityId
          }
          withdrawError={
            withdrawMutation.variables === enrollment.opportunityId
              ? withdrawMutation.error
              : null
          }
        />
      ))}
    </div>
  )
}

type EnrollmentRowProps = {
  enrollment: OpportunityEnrollment
  onWithdraw: () => void
  withdrawing: boolean
  withdrawError: Error | null
}

function EnrollmentRow({ enrollment, onWithdraw, withdrawing, withdrawError }: EnrollmentRowProps) {
  const { opportunity } = enrollment
  const isProgram = isProgramOpportunityType(opportunity.type)
  const canCancel = enrollment.status === 'APPLIED' || enrollment.status === 'ENROLLED'

  return (
    <Card className="rounded-2xl border-surface-border p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="purple">{opportunity.type}</Badge>
            <Badge tone={enrollmentStatusTone(enrollment.status)}>
              {enrollmentStatusLabel(enrollment.status)}
            </Badge>
          </div>
          <h3 className="mt-3 text-lg font-bold text-ink-strong">{opportunity.title}</h3>
          <p className="mt-1 text-sm font-semibold text-brand-700">{opportunity.organization}</p>
          <p className="mt-3 text-sm text-ink-muted">
            신청일 {formatDate(enrollment.appliedAt)}
            {enrollment.enrolledAt ? ` · 선정일 ${formatDate(enrollment.enrolledAt)}` : null}
            {enrollment.completedAt ? ` · 수료일 ${formatDate(enrollment.completedAt)}` : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-surface-border bg-white px-5 py-2.5 text-sm font-semibold text-ink-strong transition hover:border-brand-100 hover:bg-brand-50"
            to="/opportunities"
          >
            프로그램 목록
          </Link>
          {isProgram && canCancel ? (
            <Button disabled={withdrawing} onClick={onWithdraw} type="button" variant="secondary">
              {withdrawing
                ? '취소 중…'
                : enrollment.status === 'ENROLLED'
                  ? '수강 취소'
                  : '신청 취소'}
            </Button>
          ) : null}
        </div>
      </div>
      {withdrawError ? (
        <p className="mt-3 text-sm text-red-600">{withdrawError.message}</p>
      ) : null}
    </Card>
  )
}
