import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { getManagedEnrollments, updateEnrollmentStatus } from '../../services/opportunityService'
import type { OpportunityEnrollment } from '../../types/opportunity'

function statusLabel(status: OpportunityEnrollment['status']) {
  switch (status) {
    case 'APPLIED':
      return '신청 대기'
    case 'ENROLLED':
      return '수강 중'
    case 'COMPLETED':
      return '수료'
    case 'REJECTED':
      return '반려'
    default:
      return status
  }
}

type EnrollmentManagePanelProps = {
  token: string
}

export function EnrollmentManagePanel({ token }: EnrollmentManagePanelProps) {
  const queryClient = useQueryClient()
  const managedQuery = useQuery({
    queryKey: ['opportunities', 'enrollments', 'managed'],
    queryFn: () => getManagedEnrollments(token),
    enabled: Boolean(token),
  })

  const updateMutation = useMutation({
    mutationFn: ({
      enrollmentId,
      status,
    }: {
      enrollmentId: string
      status: 'enrolled' | 'completed' | 'rejected'
    }) => updateEnrollmentStatus(token, enrollmentId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities', 'enrollments', 'managed'] })
      queryClient.invalidateQueries({ queryKey: ['opportunities', 'enrollments', 'me'] })
      queryClient.invalidateQueries({ queryKey: ['profiles', 'me'] })
    },
  })

  const enrollments = managedQuery.data?.enrollments ?? []
  const pending = enrollments.filter((item) => item.status === 'APPLIED' || item.status === 'ENROLLED')

  return (
    <Card className="rounded-2xl border-brand-100 bg-brand-50/30 shadow-sm">
      <CardHeader>
        <CardTitle>프로그램 수강·수료 관리</CardTitle>
        <CardDescription>
          기관 계정으로 등록한 프로그램 신청자를 승인하고, 수료 시 프로필에 인증 이력이 자동 발급됩니다.
        </CardDescription>
      </CardHeader>

      {managedQuery.isLoading ? <LoadingState /> : null}

      {!managedQuery.isLoading && pending.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-muted">처리할 신청이 없습니다.</p>
      ) : null}

      <div className="space-y-3 px-5 pb-5">
        {pending.map((enrollment) => (
          <div className="rounded-xl border border-surface-border bg-white p-4" key={enrollment.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                {enrollment.user ? (
                  <Avatar name={enrollment.user.name} src={enrollment.user.avatarUrl} />
                ) : null}
                <div className="min-w-0">
                  <p className="font-bold text-ink-strong">{enrollment.user?.name ?? '사용자'}</p>
                  <p className="text-sm text-ink-muted">{enrollment.user?.email}</p>
                  <p className="mt-2 font-semibold text-brand-700">{enrollment.opportunity.title}</p>
                  <p className="text-xs text-ink-muted">{enrollment.opportunity.organization}</p>
                </div>
              </div>
              <Badge tone="purple">{statusLabel(enrollment.status)}</Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {enrollment.status === 'APPLIED' ? (
                <Button
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ enrollmentId: enrollment.id, status: 'enrolled' })
                  }
                  type="button"
                  variant="secondary"
                >
                  수강 승인
                </Button>
              ) : null}
              {enrollment.status === 'APPLIED' || enrollment.status === 'ENROLLED' ? (
                <Button
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ enrollmentId: enrollment.id, status: 'completed' })
                  }
                  type="button"
                >
                  수료 처리
                </Button>
              ) : null}
              {enrollment.status !== 'COMPLETED' && enrollment.status !== 'REJECTED' ? (
                <Button
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ enrollmentId: enrollment.id, status: 'rejected' })
                  }
                  type="button"
                  variant="danger"
                >
                  반려
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
