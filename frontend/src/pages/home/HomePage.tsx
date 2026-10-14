import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CircleCheck,
  CircleDashed,
  Clock3,
  FilePen,
  FolderPlus,
  Hourglass,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { AppLayout } from '../../components/layout/AppLayout'
import { cn } from '../../lib/cn'
import { useNow } from '../../hooks/useNow'
import { APPLICATION_STATUS_META, formatDate, formatDateTime, offerTimeLeft } from '../../lib/programs'
import { OPPORTUNITY_TYPE_LABEL } from '../../lib/jobsSearch'
import { getOpportunities } from '../../services/opportunityService'
import { getProfileOverview } from '../../services/profileService'
import { discoverPrograms, getMyProgramApplications } from '../../services/programService'
import { getProjects } from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'

const PROJECT_STATUS_LABEL = { PLANNING: '기획 중', ACTIVE: '진행 중', COMPLETED: '완료', ARCHIVED: '보관' } as const

type NextAction = { id: string; icon: ReactNode; title: string; detail: string; badge?: string; to: string; cta: string; urgent: boolean }

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-surface-border bg-white', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-3.5">
        <h2 className="text-base font-bold text-ink-strong">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function PanelError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-danger-700">
      불러오지 못했습니다.
      <Button onClick={onRetry} size="sm" variant="secondary">
        <RefreshCw size={14} />
        다시 시도
      </Button>
    </div>
  )
}

function Lines({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <span className="block h-12 animate-pulse rounded-xl bg-surface-muted" key={index} />
      ))}
    </div>
  )
}

function MoreLink({ to, label }: { to: string; label: string }) {
  return (
    <Link className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700" to={to}>
      {label}
      <ArrowRight aria-hidden size={14} />
    </Link>
  )
}

export function HomePage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const now = useNow()
  const ready = Boolean(token && user)

  const applicationsQuery = useQuery({
    queryKey: ['programs', 'applications', 'me'],
    queryFn: () => getMyProgramApplications(token!),
    enabled: ready,
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'home'],
    queryFn: () => getProjects(token!, { limit: 4 }),
    enabled: ready,
  })
  const overviewQuery = useQuery({
    queryKey: ['profiles', user?.id, 'overview'],
    queryFn: () => getProfileOverview(token, user!.id),
    enabled: ready,
  })
  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', 'home'],
    queryFn: () => getOpportunities(token!, { sort: 'match', openOnly: true, pageSize: 3 }),
    enabled: ready,
  })
  const programsQuery = useQuery({
    queryKey: ['programs', 'discover', 'home'],
    queryFn: () => discoverPrograms(token, { page: 1, pageSize: 3, state: 'open', sort: 'deadline' }),
    enabled: ready,
  })

  const applications = applicationsQuery.data?.applications ?? []
  const projects = projectsQuery.data?.projects ?? []
  const overview = overviewQuery.data
  const mySkills = new Set((overview?.profile.skills ?? []).map((skill) => skill.toLowerCase()))

  const offers = applications.filter(
    (application) => application.status === 'accepted' && !offerTimeLeft(application.offerExpiresAt, now).expired,
  )
  const drafts = applications.filter((application) => application.status === 'draft')
  const inReview = applications.filter((application) => ['pending', 'waitlisted', 'accepted', 'confirmed'].includes(application.status))

  const actions: NextAction[] = [
    ...offers.map((application) => {
      const timeLeft = offerTimeLeft(application.offerExpiresAt, now)
      return {
        id: `offer-${application.id}`,
        icon: <BadgeCheck size={18} />,
        title: '합격 제안에 응답해 주세요',
        detail: application.offerExpiresAt
          ? `${application.program.title} · ${formatDateTime(application.offerExpiresAt)}까지`
          : application.program.title,
        badge: timeLeft.label,
        to: `/programs/${application.program.id}`,
        cta: '응답하기',
        urgent: true,
      }
    }),
    ...drafts.map((application) => ({
      id: `draft-${application.id}`,
      icon: <FilePen size={18} />,
      title: '작성 중인 지원서가 있습니다',
      detail: `${application.program.title}${application.program.applyEndAt ? ` · 마감 ${formatDate(application.program.applyEndAt)}` : ''}`,
      to: `/programs/${application.program.id}`,
      cta: '이어 작성',
      urgent: false,
    })),
    ...(overview && (!overview.profile.headline || overview.profile.skills.length === 0)
      ? [
          {
            id: 'profile-basics',
            icon: <UserRound size={18} />,
            title: '프로필 기본 정보를 채워 주세요',
            detail: '한 줄 소개와 스킬이 있어야 기회 추천 근거를 보여줄 수 있습니다.',
            to: '/profile',
            cta: '프로필 편집',
            urgent: false,
          },
        ]
      : []),
    ...(projectsQuery.isSuccess && projects.length === 0
      ? [
          {
            id: 'first-project',
            icon: <FolderPlus size={18} />,
            title: '첫 프로젝트를 만들어 보세요',
            detail: '프로젝트 활동과 증빙이 기관 검증을 거쳐 커리어 기록이 됩니다.',
            to: '/projects',
            cta: '프로젝트 만들기',
            urgent: false,
          },
        ]
      : []),
  ]
  const activeProjects = projectsQuery.data
    ? (projectsQuery.data.statusCounts?.ACTIVE ??
      (projectsQuery.data.nextCursor ? null : projects.filter((project) => project.status === 'ACTIVE').length))
    : null
  const actionsLoading = applicationsQuery.isLoading || projectsQuery.isLoading || overviewQuery.isLoading

  const completeness = overview
    ? [
        { label: '프로필 사진', done: Boolean(overview.user.avatarUrl) },
        { label: '한 줄 소개', done: Boolean(overview.profile.headline) },
        { label: '스킬', done: overview.profile.skills.length > 0 },
        { label: '자기소개', done: Boolean(overview.profile.bio) },
      ]
    : []

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-600">내 커리어 홈</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong sm:text-[28px]">
              {user ? `${user.name}님, 안녕하세요` : '안녕하세요'}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">지원 상태와 지금 처리할 작업을 먼저 보여드려요.</p>
          </div>
          <dl className="flex flex-wrap gap-2">
            {[
              { label: '진행 프로젝트', value: activeProjects, to: '/projects' },
              { label: '응답 필요', value: applicationsQuery.isSuccess ? offers.length : null, to: '/opportunities?tab=my' },
              { label: '인증 기록', value: overview ? overview.stats.verifiedCount : null, to: '/profile' },
            ].map((stat) => (
              <Link
                className="flex min-h-11 items-center gap-2 rounded-xl border border-surface-border bg-white px-3.5 transition hover:border-brand-200"
                key={stat.label}
                to={stat.to}
              >
                <dt className="text-xs font-semibold text-ink-muted">{stat.label}</dt>
                <dd className="text-lg font-bold tabular-nums text-ink-strong">{stat.value ?? '–'}</dd>
              </Link>
            ))}
          </dl>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <Panel title="지금 할 일">
              {actionsLoading ? (
                <Lines count={2} />
              ) : applicationsQuery.isError ? (
                <PanelError onRetry={() => applicationsQuery.refetch()} />
              ) : actions.length === 0 ? (
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <p className="flex-1 text-sm text-ink-muted">지금 처리할 작업이 없습니다. 새로운 기회를 찾아보세요.</p>
                  <Button size="sm" to="/opportunities" variant="outline">
                    기회 찾기
                  </Button>
                </div>
              ) : (
                <ul className="-my-2 divide-y divide-surface-border">
                  {actions.map((action) => (
                    <li className="flex flex-wrap items-center gap-3 py-3" key={action.id}>
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          action.urgent ? 'bg-warning-50 text-warning-700' : 'bg-brand-50 text-brand-600',
                        )}
                      >
                        {action.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-strong">
                          {action.title}
                          {action.badge ? <Badge tone={action.urgent ? 'amber' : 'gray'}>{action.badge}</Badge> : null}
                        </p>
                        <p className="truncate text-xs text-ink-muted">{action.detail}</p>
                      </div>
                      <Button size="sm" to={action.to} variant={action.urgent ? 'primary' : 'secondary'}>
                        {action.cta}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel action={<MoreLink label="전체 보기" to="/projects" />} title="최근 프로젝트">
              {projectsQuery.isLoading ? (
                <Lines />
              ) : projectsQuery.isError ? (
                <PanelError onRetry={() => projectsQuery.refetch()} />
              ) : projects.length === 0 ? (
                <p className="text-sm text-ink-muted">아직 프로젝트가 없습니다.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {projects.map((project) => (
                    <li className="min-w-0" key={project.id}>
                      <Link
                        className="block h-full rounded-xl border border-surface-border p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
                        to={`/projects/${project.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 font-semibold text-ink-strong">{project.title}</p>
                          <Badge tone={project.status === 'ACTIVE' ? 'blue' : project.status === 'COMPLETED' ? 'green' : 'gray'}>
                            {PROJECT_STATUS_LABEL[project.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-ink-muted">
                          {project.program ? `${project.program.organization.name} · ${project.program.title}` : '개인 프로젝트'}
                        </p>
                        <p className="mt-3 flex items-center gap-1 text-xs text-ink-muted">
                          <Clock3 aria-hidden size={12} />
                          최근 활동 {formatDate(project.updatedAt)} · 할 일 {project.counts.doneTasks}/{project.counts.tasks}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel action={<MoreLink label="기회 더 보기" to="/opportunities" />} title="추천 기회">
              {opportunitiesQuery.isLoading || programsQuery.isLoading ? (
                <Lines />
              ) : (
                <ul className="-my-2 divide-y divide-surface-border">
                  {(programsQuery.data?.programs ?? []).map((program) => (
                    <li className="py-3" key={`program-${program.id}`}>
                      <Link className="group flex items-center gap-3" to={`/programs/${program.id}`}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-700">
                          <Sparkles aria-hidden size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-strong group-hover:text-brand-700">{program.title}</span>
                          <span className="block truncate text-xs text-ink-muted">
                            {program.organization.name} · 기관 프로그램 · BAESH에서 지원
                            {program.recruitment.applyEndAt ? ` · 마감 ${formatDate(program.recruitment.applyEndAt)}` : ''}
                          </span>
                        </span>
                        <Badge tone="green">모집 중</Badge>
                      </Link>
                    </li>
                  ))}
                  {(opportunitiesQuery.data?.opportunities ?? []).map((opportunity) => {
                    const matched = opportunity.skills.filter((skill) => mySkills.has(skill.toLowerCase()))
                    return (
                      <li className="py-3" key={`opportunity-${opportunity.id}`}>
                        <Link className="group flex items-center gap-3" to={`/opportunities?q=${encodeURIComponent(opportunity.title)}`}>
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            <BriefcaseBusiness aria-hidden size={18} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-strong group-hover:text-brand-700">
                              {opportunity.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {opportunity.organization} · {OPPORTUNITY_TYPE_LABEL[opportunity.type]}
                              {opportunity.deadline ? ` · 마감 ${formatDate(opportunity.deadline)}` : ''}
                            </span>
                            <span className={`mt-0.5 block truncate text-xs ${matched.length > 0 ? 'text-brand-700' : 'text-ink-muted'}`}>
                              {matched.length > 0 ? `내 스킬 일치: ${matched.slice(0, 3).join(', ')}` : '프로필 스킬과 일치하는 항목이 없습니다'}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                  {(programsQuery.data?.programs.length ?? 0) + (opportunitiesQuery.data?.opportunities.length ?? 0) === 0 ? (
                    <li className="py-3 text-sm text-ink-muted">
                      {opportunitiesQuery.isError || programsQuery.isError ? '추천 기회를 불러오지 못했습니다.' : '지금 모집 중인 기회가 없습니다.'}
                    </li>
                  ) : null}
                </ul>
              )}
            </Panel>
          </div>

          <div className="min-w-0 space-y-5">
            <Panel action={<MoreLink label="내 지원" to="/opportunities?tab=my" />} title="지원 현황">
              {applicationsQuery.isLoading ? (
                <Lines count={2} />
              ) : applicationsQuery.isError ? (
                <PanelError onRetry={() => applicationsQuery.refetch()} />
              ) : inReview.length === 0 ? (
                <p className="text-sm text-ink-muted">진행 중인 지원이 없습니다.</p>
              ) : (
                <ul className="space-y-3">
                  {inReview.slice(0, 5).map((application) => {
                    const meta = APPLICATION_STATUS_META[application.status]
                    return (
                      <li key={application.id}>
                        <Link className="group flex items-center gap-3" to={`/programs/${application.program.id}`}>
                          <Hourglass aria-hidden className="shrink-0 text-ink-muted" size={16} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-strong group-hover:text-brand-700">
                              {application.program.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">{application.program.organizationName}</span>
                          </span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>

            <Panel action={<MoreLink label="프로필" to="/profile" />} title="커리어 진척">
              {overviewQuery.isLoading ? (
                <Lines count={2} />
              ) : overviewQuery.isError || !overview ? (
                <PanelError onRetry={() => overviewQuery.refetch()} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-success-50 p-3">
                      <p className="text-xs font-semibold text-success-700">기관 인증 기록</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-strong">{overview.stats.verifiedCount}</p>
                    </div>
                    <div className="rounded-xl bg-surface-muted p-3">
                      <p className="text-xs font-semibold text-ink-muted">프로젝트</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-ink-strong">{overview.stats.projectCount}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink-muted">
                      프로필 완성 {completeness.filter((item) => item.done).length}/{completeness.length}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {completeness.map((item) => (
                        <li className="flex items-center gap-2 text-sm" key={item.label}>
                          {item.done ? (
                            <CircleCheck aria-label="완료" className="text-success-600" size={16} />
                          ) : (
                            <CircleDashed aria-label="미완료" className="text-ink-muted" size={16} />
                          )}
                          <span className={item.done ? 'text-ink-body' : 'text-ink-muted'}>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="rounded-xl border border-surface-border px-3 py-2.5 text-xs leading-5 text-ink-muted">
                    인재 검색 노출:{' '}
                    <span className="font-semibold text-ink-strong">{overview.profile.talentSearchOptIn ? '동의함' : '동의하지 않음'}</span>
                    {' · '}
                    <Link className="font-semibold text-brand-600 hover:underline" to="/profile">
                      공개 범위 설정
                    </Link>
                  </p>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
