import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input, Select, Textarea } from '../../components/common/Input'
import { AppLayout } from '../../components/layout/AppLayout'
import { EnrollmentManagePanel } from '../../components/institution/EnrollmentManagePanel'
import { JobsFilterButton, JobsFilterSidebar } from '../../components/jobs/JobsFilterPanel'
import { JobsPageHeader, type JobsView } from '../../components/jobs/JobsPageHeader'
import { JobsResultsSection } from '../../components/jobs/JobsResultsSection'
import { JobsSearchBar } from '../../components/jobs/JobsSearchBar'
import { MyEnrollmentsPanel } from '../../components/opportunities/MyEnrollmentsPanel'
import { MyProgramApplications } from '../../components/programs/MyProgramApplications'
import { MyParticipatingPrograms } from '../../components/programs/MyParticipatingPrograms'
import { createOpportunity } from '../../services/opportunityService'
import { EMPTY_JOBS_SEARCH, isJobsSearchNarrowed, jobsSearchFromParams, writeJobsSearchParams, type JobsSearch } from '../../lib/jobsSearch'
import { useAuthStore } from '../../stores/authStore'

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

const typeOptions = [
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
  const view: JobsView = searchParams.get('tab') === 'my' && token ? 'my' : 'browse'
  // setSearchParams(prev => …) hands over the params of the last render, which lag behind a navigation that is
  // still rendering (router updates run in a transition). Building on the address bar keeps quick successive
  // changes, such as a category click followed at once by a sort change, from dropping each other.
  const currentParams = () => new URLSearchParams(window.location.search)
  const setView = (next: JobsView) => {
    const params = currentParams()
    if (next === 'my') params.set('tab', 'my')
    else params.delete('tab')
    setSearchParams(params)
  }
  const [filterOpen, setFilterOpen] = useState(false)

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
  const resetSearch = () => {
    setQDraft('')
    setSearchParams(writeJobsSearchParams(currentParams(), EMPTY_JOBS_SEARCH))
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

  const filterProps = { search: effectiveSearch, onChange: updateSearch, signedIn: Boolean(token) }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-5">
        <JobsPageHeader onViewChange={setView} showViews={Boolean(token)} view={view} />

        {view === 'my' && token ? (
          <>
            <MyParticipatingPrograms token={token} />
            <MyProgramApplications token={token} />
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
          </>
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
                {typeOptions.map((option) => (
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

        {view === 'browse' ? (
          <>
            <JobsSearchBar
              filterButton={<JobsFilterButton {...filterProps} open={filterOpen} setOpen={setFilterOpen} />}
              onChange={updateSearch}
              search={search}
            />
            <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6">
              <JobsFilterSidebar {...filterProps} />
              <JobsResultsSection
                narrowed={isJobsSearchNarrowed(effectiveSearch)}
                onReset={resetSearch}
                search={effectiveSearch}
                token={token}
              />
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
