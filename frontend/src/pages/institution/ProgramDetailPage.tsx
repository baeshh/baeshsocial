import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, MapPin, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs, type TabItem } from '../../components/common/Tabs'
import { ProgramKpiPanel } from '../../components/institution/KpiPanels'
import { ProgramApplicationsPanel } from '../../components/institution/ProgramApplicationsPanel'
import { ProgramParticipantsPanel } from '../../components/institution/ProgramParticipantsPanel'
import { ProgramProjectsPanel } from '../../components/institution/ProgramProjectsPanel'
import { ProgramRequestsPanel } from '../../components/institution/ProgramRequestsPanel'
import { ProgramReviewPanel } from '../../components/institution/ProgramReviewPanel'
import { ProgramSettingsPanel } from '../../components/institution/ProgramSettingsPanel'
import { AppLayout } from '../../components/layout/AppLayout'
import {
  DELIVERY_MODE_LABEL,
  PROGRAM_STATUS_META,
  PROGRAM_VISIBILITY_META,
  RECRUITMENT_MODE_META,
  RECRUITMENT_STATE_META,
  formatAudiences,
  formatPeriod,
  takesApplications,
} from '../../lib/programs'
import { getProgram } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'

export function ProgramDetailPage() {
  const { orgId = '', programId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useAuthStore((s) => s.token)

  const programQuery = useQuery({
    queryKey: ['programs', programId],
    queryFn: () => getProgram(token!, programId),
    enabled: Boolean(token && programId),
  })

  if (programQuery.isLoading) {
    return (
      <AppLayout>
        <LoadingState label="프로그램을 불러오는 중입니다" />
      </AppLayout>
    )
  }

  if (programQuery.isError || !programQuery.data || programQuery.data.organization.id !== orgId) {
    return (
      <AppLayout>
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {(programQuery.error as Error | null)?.message ?? '프로그램을 찾을 수 없습니다.'}
        </p>
      </AppLayout>
    )
  }

  const { program, organization, myAccess } = programQuery.data
  const status = PROGRAM_STATUS_META[program.status]
  const recruitmentMeta = RECRUITMENT_STATE_META[program.recruitment.state]

  const tabs: TabItem[] = [
    {
      id: 'projects',
      label: myAccess.isStaff ? `프로젝트 ${program.projectCount ?? ''}` : '내 프로젝트',
      content: <ProgramProjectsPanel access={myAccess} program={program} />,
    },
    ...(myAccess.isStaff
      ? [
          ...(takesApplications(program.recruitment.mode)
            ? [{ id: 'applications', label: '지원자', content: <ProgramApplicationsPanel program={program} /> }]
            : []),
          { id: 'participants', label: `참여자 ${program.participantCount ?? ''}`, content: <ProgramParticipantsPanel program={program} /> },
          { id: 'requests', label: '등록 요청', content: <ProgramRequestsPanel program={program} /> },
          { id: 'review', label: '증빙 검토', content: <ProgramReviewPanel program={program} /> },
          { id: 'kpis', label: '성과 분석', content: <ProgramKpiPanel program={program} /> },
          { id: 'settings', label: '설정', content: <ProgramSettingsPanel access={myAccess} key={program.updatedAt} program={program} /> },
        ]
      : []),
  ]

  const requested = searchParams.get('tab') ?? 'projects'
  const activeTab = tabs.some((tab) => tab.id === requested) ? requested : 'projects'

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Link
            aria-label="조직으로 돌아가기"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-surface-border bg-white text-ink-strong shadow-sm transition hover:border-brand-200"
            to={`/org/${orgId}?tab=programs`}
          >
            <ArrowLeft size={18} />
          </Link>
          <Link className="font-medium text-ink-strong hover:text-brand-600" to={`/org/${orgId}`}>
            {organization.name}
          </Link>
          <span>/</span>
          <Link className="hover:text-brand-600" to={`/org/${orgId}?tab=programs`}>
            프로그램
          </Link>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">{program.title}</h1>
            {myAccess.isStaff && !program.publishedAt ? <Badge>임시저장</Badge> : null}
            <Badge tone={status.tone}>{status.label}</Badge>
            {program.recruitment.state !== 'draft' ? <Badge tone={recruitmentMeta.tone}>{recruitmentMeta.label}</Badge> : null}
            <Badge>{PROGRAM_VISIBILITY_META[program.visibility].label}</Badge>
            <Badge>{RECRUITMENT_MODE_META[program.recruitment.mode].label}</Badge>
            {myAccess.isStaff ? <Badge tone="blue">{myAccess.isOrgAdmin ? '조직 관리자' : '담당자'}</Badge> : <Badge>참여자</Badge>}
            {program.visibility !== 'private' ? (
              <Link
                className="text-sm font-semibold text-brand-600 hover:underline"
                to={program.visibility === 'unlisted' && program.shareToken ? `/programs/${program.id}?t=${encodeURIComponent(program.shareToken)}` : `/programs/${program.id}`}
              >
                {program.publishedAt ? '공개 페이지 보기' : '공고 미리보기'}
              </Link>
            ) : null}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="flex items-center gap-1">
              <CalendarDays size={14} />
              {program.term ? `${program.term} · ` : ''}
              {formatPeriod(program.startDate, program.endDate)}
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              담당 {program.managers.length ? program.managers.map((m) => m.name).join(', ') : '미지정'}
            </span>
            {formatAudiences(program.recruitment) ? <span>대상 {formatAudiences(program.recruitment)}</span> : null}
            {program.recruitment.capacity ? (
              <span>
                정원 {program.recruitment.capacity}명 · 참여 {program.participantCount ?? 0}명
              </span>
            ) : null}
            {program.recruitment.deliveryMode || program.recruitment.location ? (
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                {[program.recruitment.deliveryMode ? DELIVERY_MODE_LABEL[program.recruitment.deliveryMode] : null, program.recruitment.location]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </p>
          {program.description ? <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-ink-body">{program.description}</p> : null}
        </div>

        <Tabs
          activeTab={activeTab}
          onChange={(tabId) => setSearchParams(tabId === 'projects' ? {} : { tab: tabId }, { replace: true })}
          tabs={tabs}
          variant="underline"
        />
      </div>
    </AppLayout>
  )
}
