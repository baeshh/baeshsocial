import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { ExternalLink, Star } from 'lucide-react'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input, Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { EnrollmentManagePanel } from '../../components/institution/EnrollmentManagePanel'
import {
  createOpportunity,
  enrollOpportunity,
  getMyEnrollments,
  getOpportunities,
  saveOpportunity,
  unsaveOpportunity,
} from '../../services/opportunityService'
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
  const [sortBy, setSortBy] = useState<'match' | 'recent'>('match')
  const [filters, setFilters] = useState({
    q: '',
    type: '',
    skill: '',
    remote: false,
    saved: false,
  })
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
  const queryFilters = useMemo(
    () => ({
      q: filters.q,
      type: filters.type,
      skill: filters.skill,
      remote: filters.remote,
      saved: filters.saved,
    }),
    [filters],
  )
  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', queryFilters],
    queryFn: () => getOpportunities(token ?? '', queryFilters),
    enabled: Boolean(token),
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

  const sortedOpportunities = useMemo(() => {
    const list = opportunitiesQuery.data?.opportunities ?? []
    if (sortBy === 'match') {
      return [...list].sort((a, b) => b.matchScore - a.matchScore)
    }
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }, [opportunitiesQuery.data?.opportunities, sortBy])

  const programCount = sortedOpportunities.length

  const setCategory = (cat: 'jobs' | 'hackathon' | 'education') => {
    if (cat === 'jobs') {
      setFilters((prev) => ({ ...prev, type: '' }))
    }
    if (cat === 'hackathon') {
      setFilters((prev) => ({ ...prev, type: 'hackathon' }))
    }
    if (cat === 'education') {
      setFilters((prev) => ({ ...prev, type: 'education' }))
    }
  }

  const categoryJobs = filters.type === '' || filters.type === 'job' || filters.type === 'internship'
  const categoryHack = filters.type === 'hackathon'
  const categoryEdu = filters.type === 'education'

  const skillPresets = ['Python', 'React', 'Node.js'] as const

  const resetFilters = () => {
    setFilters({ q: '', type: '', skill: '', remote: false, saved: false })
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 px-6 py-8 text-white shadow-lg ring-1 ring-black/5 sm:px-10 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-300">⚡ AI RADAR ACTIVE</p>
          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            총{' '}
            <span className="bg-gradient-to-r from-sky-300 to-violet-300 bg-clip-text text-transparent">
              {programCount}
            </span>
            개의 프로그램이 있습니다.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
            인턴십, 공모전, 해커톤, 부트캠프 등 다양한 프로그램을 한 곳에서 찾아보세요.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              { label: '💼 Full-time', onClick: () => setCategory('jobs') },
              { label: '🏆 Hackathons', onClick: () => setCategory('hackathon') },
              { label: '🎓 Education', onClick: () => setCategory('education') },
              {
                label: '🌐 Remote Only',
                onClick: () => setFilters((prev) => ({ ...prev, remote: !prev.remote })),
              },
            ].map((pill) => (
              <button
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
                key={pill.label}
                onClick={pill.onClick}
                type="button"
              >
                {pill.label}
              </button>
            ))}
          </div>
        </section>

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

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit rounded-2xl border-surface-border p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-surface-border pb-4">
              <h2 className="text-lg font-bold text-ink-strong">Filters</h2>
              <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={resetFilters} type="button">
                Reset
              </button>
            </div>
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Category</p>
                <div className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
                    <input
                      checked={categoryJobs}
                      className="h-4 w-4 rounded border-surface-border text-brand-600"
                      onChange={() => setCategory('jobs')}
                      type="checkbox"
                    />
                    Jobs & Internships
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
                    <input
                      checked={categoryHack}
                      className="h-4 w-4 rounded border-surface-border text-brand-600"
                      onChange={() => setCategory('hackathon')}
                      type="checkbox"
                    />
                    Hackathons
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
                    <input
                      checked={categoryEdu}
                      className="h-4 w-4 rounded border-surface-border text-brand-600"
                      onChange={() => setCategory('education')}
                      type="checkbox"
                    />
                    Education
                  </label>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Skills</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skillPresets.map((skill) => (
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        filters.skill === skill
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-surface-border bg-white text-ink-body hover:border-brand-200'
                      }`}
                      key={skill}
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          skill: prev.skill === skill ? '' : skill,
                        }))
                      }
                      type="button"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="검색"
                onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="키워드"
                value={filters.q}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
                <input
                  checked={filters.remote}
                  className="h-4 w-4 rounded border-surface-border text-brand-600"
                  onChange={(event) => setFilters((prev) => ({ ...prev, remote: event.target.checked }))}
                  type="checkbox"
                />
                원격만
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
                <input
                  checked={filters.saved}
                  className="h-4 w-4 rounded border-surface-border text-brand-600"
                  onChange={(event) => setFilters((prev) => ({ ...prev, saved: event.target.checked }))}
                  type="checkbox"
                />
                저장한 기회
              </label>
            </div>
          </Card>

          <div>
            <div className="mb-4 flex flex-col gap-3 border-b border-surface-border pb-4 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-lg font-bold text-ink-strong">Latest Postings</h2>
              <div className="w-full sm:w-52">
                <Select label="Sort by" onChange={(event) => setSortBy(event.target.value as 'match' | 'recent')} value={sortBy}>
                  <option value="match">Match Score</option>
                  <option value="recent">Recent</option>
                </Select>
              </div>
            </div>

            {opportunitiesQuery.isLoading ? <LoadingState /> : null}
            {!opportunitiesQuery.isLoading && sortedOpportunities.length === 0 ? (
              <p className="py-20 text-center text-ink-muted">등록된 프로그램이 없습니다.</p>
            ) : null}
            <div className="grid gap-4">
              {sortedOpportunities.map((opportunity) => (
                <OpportunityCard
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
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

type OpportunityCardProps = {
  opportunity: Opportunity
  enrollment?: OpportunityEnrollment
  token: string
  onChanged: () => void
}

function OpportunityCard({ opportunity, enrollment, token, onChanged }: OpportunityCardProps) {
  const isProgram = isProgramOpportunityType(opportunity.type)
  const enrollMutation = useMutation({
    mutationFn: () => enrollOpportunity(token, opportunity.id),
    onSuccess: onChanged,
  })
  const saveMutation = useMutation({
    mutationFn: () =>
      opportunity.saved
        ? unsaveOpportunity(token, opportunity.id)
        : saveOpportunity(token, opportunity.id),
    onSuccess: onChanged,
  })

  return (
    <Card className="flex flex-col rounded-2xl border-surface-border shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="purple">{opportunity.type}</Badge>
            {opportunity.isRemote ? <Badge tone="green">Remote</Badge> : null}
          </div>
          <h2 className="mt-4 text-xl font-bold text-ink-strong">{opportunity.title}</h2>
          <p className="mt-1 text-sm font-semibold text-brand-700">{opportunity.organization}</p>
        </div>
        <div className="rounded-2xl bg-surface-muted p-4 text-center">
          <p className="text-xs font-semibold text-ink-muted">Match</p>
          <p className="mt-1 text-2xl font-bold text-ink-strong">{opportunity.matchScore}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-4 leading-7 text-ink-body">{opportunity.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {opportunity.skills.map((skill) => (
          <Badge key={skill} tone="blue">{skill}</Badge>
        ))}
      </div>
      <div className="mt-5 grid gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-body sm:grid-cols-2">
        <p><span className="font-semibold text-ink-strong">위치:</span> {opportunity.location ?? '미정'}</p>
        <p><span className="font-semibold text-ink-strong">마감:</span> {formatDate(opportunity.deadline)}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
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
        {isProgram ? (
          <Button
            disabled={enrollMutation.isPending || enrollment?.status === 'COMPLETED'}
            onClick={() => enrollMutation.mutate()}
            type="button"
          >
            {enrollment?.status === 'COMPLETED'
              ? '수료 완료'
              : enrollment?.status === 'ENROLLED'
                ? '수강 중'
                : enrollment?.status === 'APPLIED'
                  ? '신청 완료'
                  : enrollMutation.isPending
                    ? '신청 중…'
                    : '프로그램 수강 신청'}
          </Button>
        ) : null}
      </div>
      {enrollMutation.error ? (
        <p className="mt-3 text-sm text-red-600">{enrollMutation.error.message}</p>
      ) : null}
    </Card>
  )
}
