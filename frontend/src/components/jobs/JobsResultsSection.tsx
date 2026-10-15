import { keepPreviousData, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDiscoverPrograms } from '../../hooks/useDiscoverPrograms'
import {
  JOBS_CATEGORIES,
  opportunityQuery,
  postingSortNote,
  programQuery,
  programSortNote,
  writeJobsSearchParams,
  type JobsSearch,
} from '../../lib/jobsSearch'
import { canManageOpportunity } from '../../lib/opportunityPermissions'
import { getMyEnrollments, getOpportunities } from '../../services/opportunityService'
import type { AuthUser } from '../../types/auth'
import type { OpportunityEnrollment } from '../../types/opportunity'
import { ErrorState } from '../common/ErrorState'
import { Pagination } from '../common/Pagination'
import { ProgramCard } from '../programs/ProgramCard'
import { JobOpportunityCard } from './JobOpportunityCard'
import { JobsEmptyState } from './JobsEmptyState'
import { JobsResultSkeleton } from './JobsResultSkeleton'

type Props = {
  search: JobsSearch
  token: string | null
  user: AuthUser | null
  narrowed: boolean
  onReset: () => void
}

const scrollToGroup = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * Institution programs and posted opportunities come from two APIs that page and rank independently, so each
 * keeps its own list, count and order instead of being interleaved into one ranking the server never made.
 */
export function JobsResultsSection({ search, token, user, narrowed, onReset }: Props) {
  const queryClient = useQueryClient()
  const programs = useMemo(() => programQuery(search), [search])
  const postings = useMemo(() => opportunityQuery(search), [search])
  const postingsVisible = postings.query !== null && Boolean(token)

  // Each new search starts both lists from their first page.
  const searchKey = writeJobsSearchParams(new URLSearchParams(), search).toString()
  const [pages, setPages] = useState({ searchKey, programs: 1, postings: 1 })
  const current = pages.searchKey === searchKey ? pages : { searchKey, programs: 1, postings: 1 }

  const programPageSize = search.source === 'programs' ? 12 : 6
  const postingPageSize = search.source === 'postings' ? 16 : 8
  const programsQuery = useDiscoverPrograms(token, current.programs, programs.query, programPageSize)
  const postingsQuery = useQuery({
    queryKey: ['opportunities', 'list', postings.query, current.postings, postingPageSize],
    queryFn: () => getOpportunities(token ?? '', { ...postings.query, page: current.postings, pageSize: postingPageSize }),
    enabled: postingsVisible,
    placeholderData: keepPreviousData,
  })
  const enrollmentsQuery = useQuery({
    queryKey: ['opportunities', 'enrollments', 'me'],
    queryFn: () => getMyEnrollments(token ?? ''),
    enabled: postingsVisible,
  })
  const enrollmentByOpportunity = useMemo(() => {
    const map = new Map<string, OpportunityEnrollment>()
    for (const enrollment of enrollmentsQuery.data?.enrollments ?? []) map.set(enrollment.opportunityId, enrollment)
    return map
  }, [enrollmentsQuery.data?.enrollments])

  const programData = programs.query ? programsQuery.data : undefined
  const postingData = postingsVisible ? postingsQuery.data : undefined
  const failed = (Boolean(programs.query) && programsQuery.isError && !programData) || (postingsVisible && postingsQuery.isError && !postingData)
  const settled = (!programs.query || programData !== undefined) && (!postingsVisible || postingData !== undefined)
  const programTotal = programData?.total ?? 0
  const postingTotal = postingData?.total ?? 0
  const nothingQueried = !programs.query && !postingsVisible
  const allEmpty = settled && programTotal + postingTotal === 0
  const categoryLabel = JOBS_CATEGORIES.find((category) => category.id === search.category)?.label

  const notes: string[] = []
  if (programs.excluded === 'filters') notes.push('일반 공고 조건(스킬·원격·저장)이 적용되어 기관 프로그램은 결과에서 뺐습니다.')
  if (postings.excluded === 'filters') notes.push('기관 프로그램 조건(진행 방식·지원 대상)이 적용되어 일반 공고는 결과에서 뺐습니다.')
  if (programs.excluded === 'category' && search.source !== 'postings') notes.push(`‘${categoryLabel}’ 분류에는 기관 프로그램이 없어 일반 공고만 보여 줍니다.`)
  if (postings.excluded === 'category' && search.source !== 'programs') notes.push(`‘${categoryLabel}’ 분류는 기관 프로그램만 있습니다.`)

  return (
    <section aria-labelledby="jobs-results-title" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-ink-strong" id="jobs-results-title">
          검색 결과
        </h2>
        <p aria-live="polite" className="text-sm text-ink-muted">
          {nothingQueried
            ? null
            : failed
              ? '일부 결과를 불러오지 못했습니다'
              : settled
              ? [
                  `총 ${programTotal + postingTotal}개`,
                  programs.query ? `기관 프로그램 ${programTotal}` : null,
                  postingsVisible ? `일반 공고 ${postingTotal}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '불러오는 중'}
        </p>
      </div>

      {notes.map((note) => (
        <p className="rounded-xl bg-surface-muted px-3.5 py-2.5 text-xs leading-5 text-ink-body" key={note}>
          {note}
        </p>
      ))}

      {nothingQueried && token ? <JobsEmptyState narrowed onReset={onReset} /> : null}
      {allEmpty && !nothingQueried ? <JobsEmptyState narrowed={narrowed} onReset={onReset} /> : null}

      {programs.query && !allEmpty ? (
        <ResultGroup
          count={programData?.total}
          description="인증된 기관이 BAESH에서 직접 운영하고, BAESH 안에서 지원·선발까지 진행합니다."
          emptyText="조건에 맞는 기관 프로그램이 없습니다."
          id="institution-programs"
          pagination={
            programData ? (
              <Pagination
                disabled={programsQuery.isPlaceholderData}
                label="기관 프로그램 페이지"
                onPageChange={(page) => {
                  setPages({ ...current, programs: page })
                  scrollToGroup('institution-programs')
                }}
                page={programData.page}
                totalPages={programData.totalPages}
              />
            ) : null
          }
          query={programsQuery}
          sortNote={programSortNote(search.sort)}
          title="기관 운영 프로그램"
        >
          {programData?.programs.map((program) => <ProgramCard key={program.id} program={program} />)}
        </ResultGroup>
      ) : null}

      {postingsVisible && !allEmpty ? (
        <ResultGroup
          count={postingData?.total}
          description="기업·기관 계정이 등록한 공고입니다. 기관명 등은 등록자가 입력한 정보입니다."
          emptyText="조건에 맞는 일반 공고가 없습니다."
          id="posted-opportunities"
          pagination={
            postingData ? (
              <Pagination
                disabled={postingsQuery.isPlaceholderData}
                label="일반 공고 페이지"
                onPageChange={(page) => {
                  setPages({ ...current, postings: page })
                  scrollToGroup('posted-opportunities')
                }}
                page={postingData.page}
                totalPages={postingData.totalPages}
              />
            ) : null
          }
          query={postingsQuery}
          sortNote={postingSortNote(search.sort)}
          title="일반 공고"
        >
          {postingData?.opportunities.map((opportunity) => (
            <JobOpportunityCard
              canManage={canManageOpportunity(user?.role, user?.id, opportunity)}
              enrollment={enrollmentByOpportunity.get(opportunity.id)}
              key={opportunity.id}
              onChanged={() => {
                void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
                void queryClient.invalidateQueries({ queryKey: ['profiles'] })
              }}
              opportunity={opportunity}
              token={token ?? ''}
            />
          ))}
        </ResultGroup>
      ) : null}

      {postings.query && !token ? (
        <div className="rounded-2xl border border-surface-border bg-white px-4 py-5 text-sm text-ink-body">
          <p className="font-semibold text-ink-strong">채용·인턴십 등 일반 공고는 로그인한 뒤 볼 수 있습니다.</p>
          <p className="mt-1 text-ink-muted">기관 운영 프로그램은 로그인하지 않아도 둘러볼 수 있습니다.</p>
          <Link className="mt-3 inline-flex font-semibold text-brand-600 hover:underline" to="/auth/login">
            로그인하기
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function ResultGroup({
  id,
  title,
  description,
  sortNote,
  count,
  query,
  emptyText,
  pagination,
  children,
}: {
  id: string
  title: string
  description: string
  sortNote: string
  count: number | undefined
  query: UseQueryResult<unknown>
  emptyText: string
  pagination: ReactNode
  children: ReactNode
}) {
  const headingId = `${id}-title`
  return (
    <section aria-labelledby={headingId} className="scroll-mt-44 space-y-3" id={id}>
      <div className="border-b border-surface-border pb-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h3 className="text-lg font-bold text-ink-strong" id={headingId}>
            {title}
            {count !== undefined ? <span className="ml-1.5 text-sm font-semibold text-ink-muted">{count}개</span> : null}
          </h3>
          <p className="text-xs font-medium text-ink-muted">{sortNote}</p>
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <JobsResultSkeleton label={`${title} 불러오는 중`} />
      ) : count === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>{children}</div>
      )}
      {pagination}
    </section>
  )
}
