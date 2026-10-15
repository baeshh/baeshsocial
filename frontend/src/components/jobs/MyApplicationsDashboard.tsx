import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  MY_APPLICATION_TABS,
  buildMyApplications,
  type MyApplicationItem,
  type MyApplicationTab,
} from '../../lib/myApplications'
import { ENROLLMENT_STATUS_META, opportunityKindLabel } from '../../lib/opportunityDisplay'
import { APPLICATION_STATUS_META, PROGRAM_STATUS_META, formatDateTime, formatPeriod } from '../../lib/programs'
import { getMyEnrollments, withdrawOpportunityEnrollment } from '../../services/opportunityService'
import { getMyProgramApplications, getParticipatingPrograms } from '../../services/programService'
import { showToast } from '../../stores/toastStore'
import { isProgramOpportunityType, type OpportunityEnrollment } from '../../types/opportunity'
import type { MyProgramApplication, ParticipatingProgram } from '../../types/program'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { OfferResponse } from '../programs/OfferResponse'
import { chipClass } from './jobsStyles'
import { JobsResultSkeleton } from './JobsResultSkeleton'

const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))

/**
 * Program applications, programs taken part in and posted-opportunity sign-ups on one screen. Each keeps its
 * own status label, deadlines and cancel rules; only the tab grouping is shared.
 */
export function MyApplicationsDashboard({ token, tab, onTabChange }: { token: string; tab: MyApplicationTab; onTabChange: (tab: MyApplicationTab) => void }) {
  const applicationsQuery = useQuery({ queryKey: ['programs', 'applications', 'me'], queryFn: () => getMyProgramApplications(token) })
  const participatingQuery = useQuery({ queryKey: ['programs', 'participating'], queryFn: () => getParticipatingPrograms(token) })
  const enrollmentsQuery = useQuery({ queryKey: ['opportunities', 'enrollments', 'me'], queryFn: () => getMyEnrollments(token) })
  const sources = [applicationsQuery, participatingQuery, enrollmentsQuery]
  const loading = sources.some((query) => query.isPending && !query.isError)
  const failed = sources.filter((query) => query.isError)

  const items = buildMyApplications(
    applicationsQuery.data?.applications ?? [],
    participatingQuery.data?.programs ?? [],
    enrollmentsQuery.data?.enrollments ?? [],
  )
  const count = (id: MyApplicationTab) => (id === 'all' ? items.length : items.filter((item) => item.group === id).length)
  const visible = tab === 'all' ? items : items.filter((item) => item.group === tab)
  const activeLabel = MY_APPLICATION_TABS.find((item) => item.id === tab)?.label

  return (
    <section aria-labelledby="my-applications-title" className="space-y-4">
      <div>
        <h2 className="sr-only" id="my-applications-title">
          내 지원 현황
        </h2>
        <p className="text-sm text-ink-muted">
          기관 프로그램 지원과 일반 공고 참여 신청을 모았습니다. 상태와 취소 규칙은 각 절차를 그대로 따르고, 지원 상태는 나와 해당 운영 기관만 볼 수 있습니다.
          외부 사이트에서 한 지원은 표시되지 않습니다.
        </p>
      </div>

      <div aria-label="지원 단계" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
        {MY_APPLICATION_TABS.map((item) => (
          <button aria-pressed={tab === item.id} className={chipClass(tab === item.id)} key={item.id} onClick={() => onTabChange(item.id)} type="button">
            {item.label}
            <span className="ml-1 text-ink-muted">{loading ? '' : count(item.id)}</span>
          </button>
        ))}
      </div>

      {failed.map((query, index) => (
        <ErrorState error={query.error} key={index} onRetry={() => void query.refetch()} />
      ))}

      {loading ? (
        <JobsResultSkeleton count={2} label="지원 현황을 불러오는 중" />
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-10 text-center">
          <p className="text-base font-bold text-ink-strong">{tab === 'all' ? '아직 지원한 기회가 없습니다' : `‘${activeLabel}’ 단계의 지원이 없습니다`}</p>
          <p className="mt-1.5 text-sm text-ink-muted">기회 탐색에서 프로그램이나 공고를 찾아 지원해 보세요.</p>
          <Button className="mt-4" size="sm" to="/opportunities" variant="secondary">
            기회 탐색으로
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((item) => (
            <li key={item.key}>
              <MyApplicationCard item={item} token={token} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const cardClass = 'flex h-full flex-col rounded-2xl border border-surface-border bg-white p-4 shadow-card sm:p-5'

function MyApplicationCard({ item, token }: { item: MyApplicationItem; token: string }) {
  if (item.kind === 'program-application') return <ProgramApplicationCard application={item.application} />
  if (item.kind === 'participation') return <ParticipationCard program={item.program} />
  return <EnrollmentCard enrollment={item.enrollment} token={token} />
}

function CardHead({ source, sourceTone, status, title, to, organization }: {
  source: string
  sourceTone: 'blue' | 'purple'
  status: { label: string; tone: 'blue' | 'purple' | 'gray' | 'green' | 'amber' | 'red' }
  title: string
  to: string
  organization: string
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={sourceTone}>{source}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink-strong">
        <Link className="hover:text-brand-700" to={to}>
          {title}
        </Link>
      </h3>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-ink-body">{organization}</p>
    </>
  )
}

function ProgramApplicationCard({ application }: { application: MyProgramApplication }) {
  const { program } = application
  const to = program.isParticipant ? `/org/${program.organizationId}/programs/${program.id}` : `/programs/${program.id}`
  return (
    <article className={cardClass}>
      <CardHead
        organization={program.organizationName}
        source="기관 운영 프로그램"
        sourceTone="blue"
        status={APPLICATION_STATUS_META[application.status]}
        title={program.title}
        to={to}
      />
      {application.status === 'draft' ? (
        <p className="mt-2 text-xs font-medium text-warning-700">
          {formatDateTime(application.updatedAt)} 저장
          {program.applyEndAt ? ` · ${formatDateTime(program.applyEndAt)}까지 제출` : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">{formatDateTime(application.submittedAt ?? application.createdAt)} 제출</p>
      )}
      {application.status === 'rejected' && application.reviewNote ? (
        <p className="mt-2 rounded-xl bg-surface-muted/70 px-3 py-2 text-sm text-ink-body">{application.reviewNote}</p>
      ) : null}
      <OfferResponse application={application} programId={program.id} programTitle={program.title} />
      <div className="mt-auto pt-3">
        <Link className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={application.status === 'draft' ? `${to}#apply` : to}>
          {application.status === 'draft' ? '이어서 작성' : application.status === 'pending' || application.status === 'waitlisted' ? '지원서 보기·취소' : '프로그램 보기'}
          <span className="sr-only">: {program.title}</span>
          <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    </article>
  )
}

function ParticipationCard({ program }: { program: ParticipatingProgram }) {
  const to = `/org/${program.organization.id}/programs/${program.id}`
  return (
    <article className={cardClass}>
      <CardHead
        organization={program.organization.name}
        source="기관 운영 프로그램"
        sourceTone="blue"
        status={{ label: `참여 중 · ${PROGRAM_STATUS_META[program.status].label}`, tone: 'green' }}
        title={program.title}
        to={to}
      />
      <p className="mt-2 text-xs text-ink-muted">
        {program.term ? `${program.term} · ` : ''}
        {formatPeriod(program.startDate, program.endDate)}
      </p>
      <p className="mt-1 text-xs text-ink-muted">참여해도 운영 기관의 구성원이 되지는 않습니다. 팀 프로젝트와 활동 증빙은 프로그램에서 관리합니다.</p>
      <div className="mt-auto pt-3">
        <Link className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={to}>
          프로그램 열기<span className="sr-only">: {program.title}</span>
          <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    </article>
  )
}

function EnrollmentCard({ enrollment, token }: { enrollment: OpportunityEnrollment; token: string }) {
  const queryClient = useQueryClient()
  const { opportunity } = enrollment
  const canCancel = isProgramOpportunityType(opportunity.type) && (enrollment.status === 'APPLIED' || enrollment.status === 'ENROLLED')
  const withdraw = useMutation({
    mutationFn: () => withdrawOpportunityEnrollment(token, enrollment.opportunityId),
    onSuccess: () => {
      showToast(enrollment.status === 'ENROLLED' ? '참여를 취소했습니다.' : '신청을 취소했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  return (
    <article className={cardClass}>
      <CardHead
        organization={opportunity.organization}
        source={opportunityKindLabel(opportunity)}
        sourceTone="purple"
        status={ENROLLMENT_STATUS_META[enrollment.status]}
        title={opportunity.title}
        to={`/opportunities/${opportunity.id}`}
      />
      <p className="mt-2 text-xs text-ink-muted">
        신청 {formatDate(enrollment.appliedAt)}
        {enrollment.enrolledAt ? ` · 선정 ${formatDate(enrollment.enrolledAt)}` : ''}
        {enrollment.completedAt ? ` · 수료 ${formatDate(enrollment.completedAt)}` : ''}
      </p>
      {enrollment.status === 'COMPLETED' && enrollment.certificate ? (
        <p className="mt-1 text-xs font-semibold text-success-700">수료 이력이 프로필에 기록되었습니다.</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <Link className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline" to={`/opportunities/${opportunity.id}`}>
          공고 보기<span className="sr-only">: {opportunity.title}</span>
          <ArrowRight aria-hidden size={15} />
        </Link>
        {canCancel ? (
          <Button
            loading={withdraw.isPending}
            onClick={() => {
              if (window.confirm(enrollment.status === 'ENROLLED' ? '참여를 취소할까요? 다시 참여하려면 새로 신청해야 합니다.' : '신청을 취소할까요?')) withdraw.mutate()
            }}
            size="sm"
            variant="secondary"
          >
            {enrollment.status === 'ENROLLED' ? '참여 취소' : '신청 취소'}
          </Button>
        ) : null}
      </div>
    </article>
  )
}
