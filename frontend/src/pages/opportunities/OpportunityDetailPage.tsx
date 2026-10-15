import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, ExternalLink, Info, MapPin, Sparkles, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingState } from '../../components/common/LoadingState'
import { SaveOpportunityButton } from '../../components/jobs/SaveOpportunityButton'
import { AppLayout } from '../../components/layout/AppLayout'
import { ApiError } from '../../lib/api'
import { canManageOpportunity } from '../../lib/opportunityPermissions'
import { ENROLLMENT_STATUS_META, opportunityDeadline, opportunityKindLabel, opportunityStatus, safeExternalUrl } from '../../lib/opportunityDisplay'
import {
  deleteOpportunity,
  enrollOpportunity,
  getMyEnrollments,
  getOpportunity,
  withdrawOpportunityEnrollment,
} from '../../services/opportunityService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import { isProgramOpportunityType, type Opportunity, type OpportunityEnrollment } from '../../types/opportunity'

const CREATOR_ROLE_LABEL: Record<string, string> = { institution: '기관 계정', admin: 'BAESH 운영팀' }

/** Back to the list the visitor came from (with its filters), or to Jobs when the page was opened directly. */
function BackToJobs() {
  const navigate = useNavigate()
  const fromApp = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!fromApp) return
    event.preventDefault()
    navigate(-1)
  }
  return (
    <Link className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-600" onClick={onClick} to="/opportunities">
      <ArrowLeft aria-hidden size={16} />
      기회 탐색으로
    </Link>
  )
}

export function OpportunityDetailPage() {
  const { opportunityId = '' } = useParams()
  const token = useAuthStore((state) => state.token)
  const query = useQuery({
    queryKey: ['opportunities', 'detail', opportunityId],
    queryFn: () => getOpportunity(token ?? '', opportunityId),
    enabled: Boolean(token && opportunityId),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  })
  const enrollmentsQuery = useQuery({
    queryKey: ['opportunities', 'enrollments', 'me'],
    queryFn: () => getMyEnrollments(token ?? ''),
    enabled: Boolean(token),
  })
  const opportunity = query.data?.opportunity
  const enrollment = enrollmentsQuery.data?.enrollments.find((item) => item.opportunityId === opportunityId)

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <BackToJobs />
        {query.isPending ? <LoadingState label="공고를 불러오는 중입니다" /> : null}
        {query.isError ? (
          query.error instanceof ApiError && query.error.status === 404 ? (
            <Card className="rounded-2xl text-center">
              <h1 className="text-lg font-bold text-ink-strong">공고를 찾을 수 없습니다</h1>
              <p className="mt-1 text-sm text-ink-muted">삭제되었거나 주소가 잘못되었습니다.</p>
              <Button className="mt-4" size="sm" to="/opportunities" variant="secondary">
                기회 탐색으로 이동
              </Button>
            </Card>
          ) : (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          )
        ) : null}
        {opportunity && token ? <OpportunityDetail enrollment={enrollment} opportunity={opportunity} token={token} /> : null}
      </div>
    </AppLayout>
  )
}

function OpportunityDetail({ opportunity, enrollment, token }: { opportunity: Opportunity; enrollment?: OpportunityEnrollment; token: string }) {
  const user = useAuthStore((state) => state.user)
  const deadline = opportunityDeadline(opportunity.deadline)
  const status = opportunityStatus(opportunity, enrollment)
  const applyUrl = safeExternalUrl(opportunity.applyUrl)
  const internal = isProgramOpportunityType(opportunity.type)
  const matched = new Set((opportunity.matchedSkills ?? []).map((skill) => skill.toLowerCase()))
  const place = [opportunity.isRemote ? '원격 가능' : null, opportunity.location].filter(Boolean).join(' · ')
  const canManage = canManageOpportunity(user?.role, user?.id, opportunity)
  const creatorRole = opportunity.creator ? CREATOR_ROLE_LABEL[String(opportunity.creator.role).toLowerCase()] : undefined

  return (
    <article className="space-y-4">
      <Card className="rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <Badge tone="purple">{opportunityKindLabel(opportunity)}</Badge>
              {applyUrl ? (
                <Badge icon={<ExternalLink aria-hidden size={11} />} tone="gray">
                  외부 지원
                </Badge>
              ) : null}
              {internal ? <Badge tone="gray">BAESH 신청</Badge> : null}
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <h1 className="mt-3 text-xl font-bold leading-snug text-ink-strong sm:text-2xl">{opportunity.title}</h1>
            <p className="mt-1.5 text-sm font-semibold text-ink-body">{opportunity.organization}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              기관·회사명은 등록자가 입력한 정보로, BAESH가 인증한 기관 정보가 아닙니다.
              {opportunity.creator ? ` 등록: ${opportunity.creator.name}${creatorRole ? ` (${creatorRole})` : ''}` : ''}
            </p>
          </div>
          <div className="hidden shrink-0 sm:block">
            <SaveOpportunityButton opportunity={opportunity} token={token} />
          </div>
        </div>
        <div className="mt-4 sm:hidden">
          <SaveOpportunityButton opportunity={opportunity} token={token} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <aside aria-label="지원 정보" className="space-y-4 lg:order-last">
          <Card className="space-y-4 rounded-2xl">
            <dl className="space-y-3 text-sm">
              <div className="flex gap-2.5">
                <CalendarDays aria-hidden className="mt-0.5 shrink-0 text-ink-muted" size={16} />
                <div>
                  <dt className="text-xs font-semibold text-ink-muted">마감일</dt>
                  <dd className="font-semibold text-ink-strong">
                    {opportunity.deadline ? deadline.dateLabel : '상시 모집'}
                    {opportunity.deadline ? <span className={`ml-1.5 text-xs ${deadline.closed ? 'text-ink-muted' : 'text-warning-700'}`}>{deadline.label}</span> : null}
                  </dd>
                </div>
              </div>
              <div className="flex gap-2.5">
                <MapPin aria-hidden className="mt-0.5 shrink-0 text-ink-muted" size={16} />
                <div>
                  <dt className="text-xs font-semibold text-ink-muted">위치·진행 방식</dt>
                  <dd className="font-semibold text-ink-strong">{place || '등록되지 않음'}</dd>
                </div>
              </div>
            </dl>
            <ApplySection applyUrl={applyUrl} closed={deadline.closed} enrollment={enrollment} internal={internal} opportunity={opportunity} token={token} />
          </Card>
          {canManage ? <ManageOpportunity opportunity={opportunity} token={token} /> : null}
        </aside>

        <div className="min-w-0 space-y-4">
          <Card className="rounded-2xl">
            <h2 className="text-base font-bold text-ink-strong">소개</h2>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-ink-body">{opportunity.description}</p>
          </Card>
          <Card className="rounded-2xl">
            <h2 className="text-base font-bold text-ink-strong">요구 스킬·자격</h2>
            {opportunity.skills.length > 0 ? (
              <>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {opportunity.skills.map((skill) => (
                    <li key={skill}>
                      <Badge tone={matched.has(skill.toLowerCase()) ? 'green' : 'gray'}>
                        {skill}
                        {matched.has(skill.toLowerCase()) ? <span className="sr-only"> (내 프로필과 일치)</span> : null}
                      </Badge>
                    </li>
                  ))}
                </ul>
                {matched.size > 0 ? (
                  <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-success-700">
                    <Sparkles aria-hidden size={13} />
                    내 프로필 스킬 {matched.size}개가 요구 스킬과 일치합니다.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">등록된 요구 스킬이 없습니다. 자격 요건은 소개 또는 지원 페이지에서 확인하세요.</p>
            )}
          </Card>
        </div>
      </div>
    </article>
  )
}

function ApplySection({
  opportunity,
  enrollment,
  token,
  applyUrl,
  internal,
  closed,
}: {
  opportunity: Opportunity
  enrollment?: OpportunityEnrollment
  token: string
  applyUrl: string | null
  internal: boolean
  closed: boolean
}) {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }
  const status = enrollment?.status
  const canEnroll = !enrollment || status === 'WITHDRAWN' || status === 'REJECTED'
  const canWithdraw = status === 'APPLIED' || status === 'ENROLLED'
  const enroll = useMutation({
    mutationFn: () => enrollOpportunity(token, opportunity.id),
    onSuccess: () => {
      showToast('참여 신청을 보냈습니다. 진행 상황은 ‘내 지원 현황’에서 확인할 수 있습니다.', 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const withdraw = useMutation({
    mutationFn: () => withdrawOpportunityEnrollment(token, opportunity.id),
    onSuccess: () => {
      showToast(status === 'ENROLLED' ? '참여를 취소했습니다.' : '신청을 취소했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <section aria-labelledby="apply-method-title" className="border-t border-surface-border pt-4">
      <h2 className="text-sm font-bold text-ink-strong" id="apply-method-title">
        지원 방법
      </h2>
      {internal ? (
        <div className="mt-2 space-y-2">
          {status && status !== 'WITHDRAWN' ? (
            <p className="text-sm text-ink-body">
              내 신청 상태: <Badge tone={ENROLLMENT_STATUS_META[status].tone}>{ENROLLMENT_STATUS_META[status].label}</Badge>
            </p>
          ) : (
            <p className="text-sm text-ink-body">BAESH에서 바로 참여 신청하고, 등록 기관이 검토해 선정합니다.</p>
          )}
          {canEnroll && !closed ? (
            <Button className="w-full" loading={enroll.isPending} onClick={() => enroll.mutate()}>
              {status === 'REJECTED' || status === 'WITHDRAWN' ? '다시 참여 신청' : 'BAESH에서 참여 신청'}
            </Button>
          ) : null}
          {canEnroll && closed ? <p className="text-sm text-ink-muted">모집이 마감되어 신청할 수 없습니다.</p> : null}
          {canWithdraw ? (
            <Button
              className="w-full"
              loading={withdraw.isPending}
              onClick={() => {
                if (window.confirm(status === 'ENROLLED' ? '참여를 취소할까요? 다시 참여하려면 새로 신청해야 합니다.' : '신청을 취소할까요?')) withdraw.mutate()
              }}
              variant="secondary"
            >
              {status === 'ENROLLED' ? '참여 취소' : '신청 취소'}
            </Button>
          ) : null}
          {status === 'COMPLETED' ? <p className="text-xs text-ink-muted">수료한 프로그램은 취소할 수 없습니다.</p> : null}
        </div>
      ) : null}
      {applyUrl ? (
        <div className={internal ? 'mt-4 space-y-2 border-t border-dashed border-surface-border pt-4' : 'mt-2 space-y-2'}>
          <a
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
            href={applyUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink aria-hidden size={16} />
            외부 사이트에서 지원
            <span className="sr-only">(새 창)</span>
          </a>
          <p className="flex gap-1.5 text-xs leading-5 text-ink-muted">
            <Info aria-hidden className="mt-0.5 shrink-0" size={13} />
            BAESH 밖의 사이트로 이동합니다. 그곳에서 한 지원은 BAESH에 기록되지 않으니 결과는 해당 사이트에서 확인하세요.
          </p>
        </div>
      ) : null}
      {!internal && !applyUrl ? <p className="mt-2 text-sm text-ink-muted">등록된 지원 방법이 없습니다. 소개에 안내된 방법을 확인하거나 등록 기관에 문의하세요.</p> : null}
    </section>
  )
}

function ManageOpportunity({ opportunity, token }: { opportunity: Opportunity; token: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => deleteOpportunity(token, opportunity.id),
    onSuccess: () => {
      showToast('공고를 삭제했습니다.', 'info')
      queryClient.removeQueries({ queryKey: ['opportunities', 'detail', opportunity.id] })
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      navigate('/opportunities', { replace: true })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  return (
    <Card className="rounded-2xl">
      <h2 className="text-sm font-bold text-ink-strong">공고 관리</h2>
      <p className="mt-1 text-xs text-ink-muted">내가 등록한 공고이거나 운영자 권한이 있어 보이는 메뉴입니다.</p>
      <Button
        className="mt-3 w-full"
        loading={remove.isPending}
        onClick={() => {
          if (window.confirm(`「${opportunity.title}」 공고를 삭제할까요?\n연결된 참여 신청·저장 기록도 함께 제거됩니다.`)) remove.mutate()
        }}
        variant="danger"
      >
        <Trash2 aria-hidden size={16} />
        공고 삭제
      </Button>
    </Card>
  )
}
