import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PROJECT_STATUS_META, PROJECT_STATUSES } from '../../lib/projectDisplay'
import {
  PROJECT_KIND_LABEL,
  PROJECT_SORT_LABEL,
  projectListQuery,
  projectSearchFromParams,
  writeProjectSearchParams,
  type ProjectListSearch,
} from '../../lib/projectSearch'
import { getProjects } from '../../services/projectService'
import { Button } from '../common/Button'
import { ErrorState } from '../common/ErrorState'
import { LoadMore } from '../common/LoadMore'
import { JobsResultSkeleton } from '../jobs/JobsResultSkeleton'
import { chipClass } from '../jobs/jobsStyles'
import { ProjectCreateModal } from './ProjectCreateModal'
import { ProjectListCard } from './ProjectListCard'

const PAGE_SIZE = 24
const EMPTY_SEARCH: ProjectListSearch = { q: '', status: null, kind: null, sort: 'updated' }

export function ProjectListView({ token }: { token: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)

  // The URL is the source of truth (back/forward, shared links); only the search box keeps a draft,
  // committed 300 ms after typing stops without adding history entries.
  const effective = useMemo(() => projectSearchFromParams(searchParams), [searchParams])
  const [qDraft, setQDraft] = useState(effective.q)
  const [syncedQ, setSyncedQ] = useState(effective.q)
  if (effective.q !== syncedQ) {
    setSyncedQ(effective.q)
    setQDraft(effective.q)
  }
  useEffect(() => {
    if (qDraft.trim() === effective.q) return
    const timer = window.setTimeout(() => {
      const current = new URLSearchParams(window.location.search)
      setSearchParams(writeProjectSearchParams(current, { ...projectSearchFromParams(current), q: qDraft }), { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [qDraft, effective.q, setSearchParams])
  const update = (next: Partial<ProjectListSearch>) => {
    const current = new URLSearchParams(window.location.search)
    setSearchParams(writeProjectSearchParams(current, { ...projectSearchFromParams(current), q: qDraft, ...next }))
  }
  const reset = () => {
    setQDraft('')
    setSearchParams(writeProjectSearchParams(new URLSearchParams(window.location.search), EMPTY_SEARCH))
  }

  const filters = projectListQuery(effective)
  const projectsQuery = useInfiniteQuery({
    queryKey: ['projects', 'list', filters],
    queryFn: ({ pageParam }) => getProjects(token, { ...filters, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })
  const projects = projectsQuery.data?.pages.flatMap((page) => page.projects) ?? []
  const statusCounts = projectsQuery.data?.pages[0]?.statusCounts
  const allCount = statusCounts ? PROJECT_STATUSES.reduce((sum, status) => sum + statusCounts[status], 0) : null
  const shownCount = statusCounts ? (effective.status ? statusCounts[effective.status] : allCount) : null
  const narrowed = Boolean(effective.q || effective.status || effective.kind)

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">프로젝트</h1>
          <p className="mt-1 text-sm text-ink-muted">내가 만들거나 참여한 프로젝트의 진행 상황과 다음 작업을 한곳에서 확인합니다.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setCreateOpen(true)} type="button">
          <Plus aria-hidden size={18} />
          새 프로젝트
        </Button>
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
          <label className="relative w-full min-w-0 sm:flex-1">
            <span className="sr-only">프로젝트 검색</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-ink-muted" size={18} />
            <input
              className="h-11 w-full rounded-full border border-surface-border bg-white pl-10 pr-3 text-sm text-ink-strong outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:ring-2"
              maxLength={100}
              onChange={(event) => setQDraft(event.target.value)}
              placeholder="프로젝트명·설명 검색"
              type="search"
              value={qDraft}
            />
          </label>
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <label className="sr-only" htmlFor="project-kind">
              구분
            </label>
            <select
              className="h-11 w-full rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100"
              id="project-kind"
              onChange={(event) => update({ kind: (event.target.value || null) as ProjectListSearch['kind'] })}
              value={effective.kind ?? ''}
            >
              <option value="">전체 프로젝트</option>
              <option value="personal">{PROJECT_KIND_LABEL.personal}</option>
              <option value="program">{PROJECT_KIND_LABEL.program}</option>
            </select>
          </div>
          <div className="w-[8.5rem] shrink-0 sm:w-36">
            <label className="sr-only" htmlFor="project-sort">
              정렬
            </label>
            <select
              className="h-11 w-full rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100"
              id="project-sort"
              onChange={(event) => update({ sort: event.target.value as ProjectListSearch['sort'] })}
              value={effective.sort}
            >
              {(Object.keys(PROJECT_SORT_LABEL) as ProjectListSearch['sort'][]).map((sort) => (
                <option key={sort} value={sort}>
                  {PROJECT_SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div aria-label="진행 상태" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
          <button aria-pressed={!effective.status} className={chipClass(!effective.status)} onClick={() => update({ status: null })} type="button">
            전체{allCount !== null ? ` ${allCount}` : ''}
          </button>
          {PROJECT_STATUSES.map((status) => (
            <button aria-pressed={effective.status === status} className={chipClass(effective.status === status)} key={status} onClick={() => update({ status })} type="button">
              {PROJECT_STATUS_META[status].label}
              {statusCounts ? ` ${statusCounts[status]}` : ''}
            </button>
          ))}
        </div>
      </div>

      <section aria-labelledby="project-results-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 aria-live="polite" className="text-sm font-semibold text-ink-body" id="project-results-title">
            {shownCount !== null ? `프로젝트 ${shownCount}개` : '프로젝트'}
            <span className="ml-1.5 font-normal text-ink-muted">· {PROJECT_SORT_LABEL[effective.sort]}</span>
          </h2>
          {narrowed ? (
            <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={reset} type="button">
              조건 초기화
            </button>
          ) : null}
        </div>

        {projectsQuery.isError && projects.length === 0 ? (
          <ErrorState error={projectsQuery.error} onRetry={() => void projectsQuery.refetch()} />
        ) : null}
        {projectsQuery.isPending ? <JobsResultSkeleton count={4} label="프로젝트를 불러오는 중" /> : null}

        {projectsQuery.isSuccess && projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-border bg-white p-8 text-center">
            <h3 className="text-base font-bold text-ink-strong">{narrowed ? '조건에 맞는 프로젝트가 없습니다' : '아직 프로젝트가 없습니다'}</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">
              {narrowed ? '검색어나 상태·구분 조건을 바꿔 보세요.' : '새 프로젝트를 만들거나 팀 초대를 수락하면 이곳에 표시됩니다.'}
            </p>
            <div className="mt-4 flex justify-center">
              {narrowed ? (
                <Button onClick={reset} type="button" variant="secondary">
                  조건 초기화
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)} type="button">
                  <Plus aria-hidden size={16} />
                  새 프로젝트
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {projects.length > 0 ? (
          <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${projectsQuery.isPlaceholderData ? 'opacity-60' : ''}`}>
            {projects.map((project) => (
              <ProjectListCard key={project.id} project={project} />
            ))}
          </div>
        ) : null}

        <LoadMore
          hasNextPage={Boolean(projectsQuery.hasNextPage)}
          isFetchingNextPage={projectsQuery.isFetchingNextPage}
          label="프로젝트 더 보기"
          onLoadMore={() => void projectsQuery.fetchNextPage()}
        />
      </section>

      <ProjectCreateModal onClose={() => setCreateOpen(false)} open={createOpen} token={token} />
    </div>
  )
}
