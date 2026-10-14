import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Star, Trash2 } from 'lucide-react'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input, Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { Pagination } from '../../components/common/Pagination'
import { AppLayout } from '../../components/layout/AppLayout'
import { EnrollmentManagePanel } from '../../components/institution/EnrollmentManagePanel'
import { MyEnrollmentsPanel } from '../../components/opportunities/MyEnrollmentsPanel'
import { InstitutionProgramsSection } from '../../components/programs/InstitutionProgramsSection'
import { useDiscoverPrograms } from '../../hooks/useDiscoverPrograms'
import { MyProgramApplications } from '../../components/programs/MyProgramApplications'
import { MyParticipatingPrograms } from '../../components/programs/MyParticipatingPrograms'
import { JobsSearchBar } from '../../components/opportunities/JobsSearchBar'
import { OpportunityFilterButton, OpportunityFiltersSidebar } from '../../components/opportunities/OpportunityBrowseControls'
import {
  createOpportunity,
  deleteOpportunity,
  enrollOpportunity,
  withdrawOpportunityEnrollment,
  getMyEnrollments,
  getOpportunities,
  saveOpportunity,
  unsaveOpportunity,
} from '../../services/opportunityService'
import {
  EMPTY_OPPORTUNITY_FILTERS,
  OPPORTUNITY_TYPE_LABEL,
  jobsSearchFromParams,
  opportunityQuery,
  programQuery,
  writeJobsSearchParams,
  type JobsSearch,
  type OpportunityFilters,
} from '../../lib/jobsSearch'
import { canManageOpportunity } from '../../lib/opportunityPermissions'
import { isProgramOpportunityType } from '../../types/opportunity'
import { useAuthStore } from '../../stores/authStore'
import type { Opportunity, OpportunityEnrollment } from '../../types/opportunity'

type OpportunityFormType =
  | 'job'
  | 'internship'
  | 'hackathon'
  | 'education'
  | 'competition'
  | 'startup_program'

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

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

const typeOptions = [
  { label: '전체', value: '' },
  { label: '채용', value: 'job' },
  { label: '인턴십', value: 'internship' },
  { label: '해커톤', value: 'hackathon' },
  { label: '교육', value: 'education' },
  { label: '공모전', value: 'competition' },
  { label: '창업 프로그램', value: 'startup_program' },
]

export function OpportunitiesPage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageTab: 'browse' | 'my' = searchParams.get('tab') === 'my' ? 'my' : 'browse'
  // setSearchParams(prev => …) hands over the params of the last render, which lag behind a navigation that is
  // still rendering (router updates run in a transition). Building on the address bar keeps quick successive
  // changes, such as a category click followed at once by a sort change, from dropping each other.
  const currentParams = () => new URLSearchParams(window.location.search)
  const setPageTab = (tab: 'browse' | 'my') => {
    const next = currentParams()
    if (tab === 'my') next.set('tab', 'my')
    else next.delete('tab')
    setSearchParams(next)
  }
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  // The URL is the source of truth so back/forward and links (e.g. the 기회 menu) always match the screen.
  // Only the search box keeps a draft, committed 300 ms after typing stops without adding history entries.
  const effectiveSearch = useMemo(() => jobsSearchFromParams(searchParams), [searchParams])
  const [qDraft, setQDraft] = useState(effectiveSearch.q)
  const [syncedQ, setSyncedQ] = useState(effectiveSearch.q)
  if (effectiveSearch.q !== syncedQ) {
    setSyncedQ(effectiveSearch.q)
    setQDraft(effectiveSearch.q)
  }
  const search: JobsSearch = { ...effectiveSearch, q: qDraft }
  useEffect(() => {
    if (qDraft.trim() === effectiveSearch.q) return
    const timer = window.setTimeout(() => {
      const current = new URLSearchParams(window.location.search)
      setSearchParams(writeJobsSearchParams(current, { ...jobsSearchFromParams(current), q: qDraft }), { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [qDraft, effectiveSearch.q, setSearchParams])
  const updateSearch = (next: Partial<JobsSearch>) => {
    if (next.q !== undefined) {
      setQDraft(next.q)
      return
    }
    const current = currentParams()
    setSearchParams(writeJobsSearchParams(current, { ...jobsSearchFromParams(current), q: qDraft, ...next }))
  }

  const [filters, setFiltersState] = useState<OpportunityFilters>(EMPTY_OPPORTUNITY_FILTERS)
  const searchKey = writeJobsSearchParams(new URLSearchParams(), effectiveSearch).toString()
  const [pages, setPages] = useState({ searchKey, institution: 1, opportunity: 1 })
  const currentPages = pages.searchKey === searchKey ? pages : { searchKey, institution: 1, opportunity: 1 }
  const institutionPage = currentPages.institution
  const opportunityPage = currentPages.opportunity
  const setInstitutionPage = (page: number) => setPages({ ...currentPages, institution: page })
  const setOpportunityPage = (page: number) => setPages({ ...currentPages, opportunity: page })
  const setFilters: typeof setFiltersState = (next) => {
    setFiltersState(next)
    setOpportunityPage(1)
  }
  const [form, setForm] = useState({
    title: '',
    type: 'job' as OpportunityFormType,
    organization: '',
    description: '',
    skills: '',
    location: '',
    isRemote: false,
    deadline: '',
    applyUrl: '',
  })
  const searchNarrowed = Boolean(effectiveSearch.q || effectiveSearch.category !== 'all' || effectiveSearch.openOnly)
  const programFilters = useMemo(() => programQuery(effectiveSearch), [effectiveSearch])
  const opportunityFilters = useMemo(() => opportunityQuery(effectiveSearch), [effectiveSearch])
  const institutionPrograms = useDiscoverPrograms(token, institutionPage, programFilters)
  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', opportunityFilters, filters, opportunityPage],
    queryFn: () => getOpportunities(token ?? '', { ...opportunityFilters, ...filters, page: opportunityPage, pageSize: 10 }),
    enabled: Boolean(token) && opportunityFilters !== null,
    placeholderData: keepPreviousData,
  })
  const enrollmentsQuery = useQuery({
    queryKey: ['opportunities', 'enrollments', 'me'],
    queryFn: () => getMyEnrollments(token ?? ''),
    enabled: Boolean(token),
  })
  const enrollmentByOpportunity = useMemo(() => {
    const map = new Map<string, OpportunityEnrollment>()
    for (const enrollment of enrollmentsQuery.data?.enrollments ?? []) {
      map.set(enrollment.opportunityId, enrollment)
    }
    return map
  }, [enrollmentsQuery.data?.enrollments])
  const createMutation = useMutation({
    mutationFn: () =>
      createOpportunity(token ?? '', {
        title: form.title,
        type: form.type,
        organization: form.organization,
        description: form.description,
        skills: splitTags(form.skills),
        location: emptyToNull(form.location),
        isRemote: form.isRemote,
        deadline: emptyToNull(form.deadline),
        applyUrl: emptyToNull(form.applyUrl),
      }),
    onSuccess: () => {
      setForm({
        title: '',
        type: 'job' as OpportunityFormType,
        organization: '',
        description: '',
        skills: '',
        location: '',
        isRemote: false,
        deadline: '',
        applyUrl: '',
      })
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })

  const opportunityPageData = opportunityFilters ? opportunitiesQuery.data : undefined
  const opportunities = opportunityPageData?.opportunities ?? []
  const programCount = (programFilters ? (institutionPrograms.data?.total ?? 0) : 0) + (opportunityPageData?.total ?? 0)

  const resetFilters = () => setFilters(EMPTY_OPPORTUNITY_FILTERS)

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-4 py-5 text-white shadow-lg ring-1 ring-black/5 sm:px-10 sm:py-10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300 sm:text-xs">
            AI RADAR
          </p>
          <h1 className="mt-2 text-lg font-bold sm:mt-3 sm:text-3xl">
            <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">
              {programCount}
            </span>
            개 프로그램
          </h1>
          <p className="mt-1.5 hidden text-sm leading-relaxed text-white/80 sm:block sm:text-base">
            인턴십, 공모전, 해커톤, 부트캠프 등 다양한 프로그램을 한 곳에서 찾아보세요.
          </p>
        </section>

        {token ? (
          <div className="flex flex-wrap gap-2 border-b border-surface-border pb-1">
            <button
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
                pageTab === 'browse'
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
              onClick={() => setPageTab('browse')}
              type="button"
            >
              프로그램 탐색
            </button>
            <button
              className={`rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
                pageTab === 'my'
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
              onClick={() => setPageTab('my')}
              type="button"
            >
              내 신청·관리
            </button>
          </div>
        ) : null}

        {pageTab === 'my' && token ? <MyParticipatingPrograms token={token} /> : null}

        {pageTab === 'my' && token ? <MyProgramApplications token={token} /> : null}

        {pageTab === 'my' && token ? (
          <section>
            <h2 className="text-lg font-bold text-ink-strong">내 프로그램 신청</h2>
            <p className="mt-1 text-sm text-ink-muted">
              신청·대기·미선정 상태는 여기서만 확인할 수 있으며, 다른 사람의 프로필에는
              보이지 않습니다.
            </p>
            <div className="mt-4">
              <MyEnrollmentsPanel token={token} />
            </div>
          </section>
        ) : null}

        {user?.role === 'institution' || user?.role === 'admin' ? (
          <EnrollmentManagePanel token={token ?? ''} />
        ) : null}

        {user?.role === 'institution' || user?.role === 'admin' ? (
          <Card className="rounded-2xl border-surface-border shadow-sm">
            <CardHeader>
              <CardTitle>프로그램·기회 등록</CardTitle>
              <CardDescription>기관·관리자 계정으로 교육·해커톤·프로그램을 등록할 수 있습니다.</CardDescription>
            </CardHeader>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                createMutation.mutate()
              }}
            >
              <Input label="제목" onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required value={form.title} />
              <Input label="기관/회사" onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))} required value={form.organization} />
              <Select label="타입" onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as OpportunityFormType }))} value={form.type}>
                {typeOptions.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input label="기술스택" onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))} placeholder="React, TypeScript" value={form.skills} />
              <Input label="위치" onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} value={form.location} />
              <Input label="마감일" onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))} type="date" value={form.deadline} />
              <Input label="지원 링크" onChange={(event) => setForm((prev) => ({ ...prev, applyUrl: event.target.value }))} type="url" value={form.applyUrl} />
              <Select label="원격 여부" onChange={(event) => setForm((prev) => ({ ...prev, isRemote: event.target.value === 'true' }))} value={String(form.isRemote)}>
                <option value="false">오프라인/혼합</option>
                <option value="true">원격</option>
              </Select>
              <Textarea className="md:col-span-2" label="설명" onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required value={form.description} />
              {createMutation.error ? (
                <p className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {createMutation.error.message}
                </p>
              ) : null}
              <div className="md:col-span-2">
                <Button disabled={createMutation.isPending} type="submit">
                  {createMutation.isPending ? '등록 중' : '기회 등록'}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}

        {pageTab === 'browse' ? <JobsSearchBar onChange={updateSearch} search={search} /> : null}

        {pageTab === 'browse' && programFilters ? (
          <InstitutionProgramsSection filtered={searchNarrowed} onPageChange={setInstitutionPage} query={institutionPrograms} />
        ) : null}

        {pageTab === 'browse' && token && opportunityFilters ? (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:gap-6">
            <OpportunityFiltersSidebar filters={filters} onReset={resetFilters} setFilters={setFilters} />

            <div className="min-w-0 space-y-3" id="posted-opportunities">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-surface-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-ink-strong">채용·대외활동 공고</h2>
                  <p className="mt-0.5 text-sm text-ink-muted">기업과 기관이 올린 공고입니다. 추천순은 내 프로필 스킬과의 일치도 기준입니다.</p>
                </div>
                <div className="flex items-center gap-2">
                  {opportunityPageData && opportunityPageData.total > 0 ? (
                    <p className="text-xs text-ink-muted">
                      {(opportunityPageData.page - 1) * opportunityPageData.pageSize + 1}–
                      {Math.min(opportunityPageData.page * opportunityPageData.pageSize, opportunityPageData.total)} / {opportunityPageData.total}개
                    </p>
                  ) : null}
                  <div className="lg:hidden">
                    <OpportunityFilterButton
                      filters={filters}
                      onReset={resetFilters}
                      open={filterModalOpen}
                      setFilters={setFilters}
                      setOpen={setFilterModalOpen}
                    />
                  </div>
                </div>
              </div>

              {opportunitiesQuery.isLoading ? <LoadingState /> : null}
              {opportunityPageData && opportunities.length === 0 ? (
                <p className="rounded-2xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">
                  {searchNarrowed || filters.skill || filters.remote || filters.saved ? '조건에 맞는 공고가 없습니다.' : '등록된 공고가 없습니다.'}
                </p>
              ) : null}
              <div className={`grid gap-3 sm:gap-4 ${opportunitiesQuery.isPlaceholderData ? 'opacity-60' : ''}`}>
                {opportunities.map((opportunity) => (
                  <OpportunityCard
                    canManage={canManageOpportunity(user?.role, user?.id, opportunity)}
                    enrollment={enrollmentByOpportunity.get(opportunity.id)}
                    key={opportunity.id}
                    opportunity={opportunity}
                    token={token ?? ''}
                    onChanged={() => {
                      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
                      void queryClient.invalidateQueries({ queryKey: ['opportunities', 'enrollments', 'me'] })
                      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
                    }}
                  />
                ))}
              </div>
              {opportunityPageData ? (
                <Pagination
                  disabled={opportunitiesQuery.isPlaceholderData}
                  onPageChange={(next) => {
                    setOpportunityPage(next)
                    document.getElementById('posted-opportunities')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  page={opportunityPageData.page}
                  totalPages={opportunityPageData.totalPages}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {pageTab === 'browse' && programFilters === null && !token ? (
          <p className="rounded-2xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">이 유형의 공고는 로그인한 뒤 볼 수 있습니다.</p>
        ) : null}
      </div>
    </AppLayout>
  )
}

type OpportunityCardProps = {
  opportunity: Opportunity
  enrollment?: OpportunityEnrollment
  token: string
  canManage?: boolean
  onChanged: () => void
}

function OpportunityCard({ opportunity, enrollment, token, canManage = false, onChanged }: OpportunityCardProps) {
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
          <h2 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink-strong lg:mt-4 lg:line-clamp-none lg:text-xl">
            {opportunity.title}
          </h2>
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
