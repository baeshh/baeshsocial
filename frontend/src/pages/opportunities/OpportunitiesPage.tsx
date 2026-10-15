import { Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { AppLayout } from '../../components/layout/AppLayout'
import { JobsFilterButton, JobsFilterSidebar } from '../../components/jobs/JobsFilterPanel'
import { JobsPageHeader, type JobsView } from '../../components/jobs/JobsPageHeader'
import { JobsResultsSection } from '../../components/jobs/JobsResultsSection'
import { JobsSearchBar } from '../../components/jobs/JobsSearchBar'
import { MyApplicationsDashboard } from '../../components/jobs/MyApplicationsDashboard'
import { myApplicationTabFromParam, type MyApplicationTab } from '../../lib/myApplications'
import { canPostOpportunities } from '../../lib/opportunityPermissions'
import { EMPTY_JOBS_SEARCH, isJobsSearchNarrowed, jobsSearchFromParams, writeJobsSearchParams, type JobsSearch } from '../../lib/jobsSearch'
import { useAuthStore } from '../../stores/authStore'

export function OpportunitiesPage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const view: JobsView = searchParams.get('tab') === 'my' && token ? 'my' : 'browse'
  // setSearchParams(prev => …) hands over the params of the last render, which lag behind a navigation that is
  // still rendering (router updates run in a transition). Building on the address bar keeps quick successive
  // changes, such as a category click followed at once by a sort change, from dropping each other.
  const currentParams = () => new URLSearchParams(window.location.search)
  const setView = (next: JobsView) => {
    const params = currentParams()
    if (next === 'my') params.set('tab', 'my')
    else {
      params.delete('tab')
      params.delete('status')
    }
    setSearchParams(params)
  }
  const myTab = myApplicationTabFromParam(searchParams.get('status'))
  const setMyTab = (next: MyApplicationTab) => {
    const params = currentParams()
    if (next === 'all') params.delete('status')
    else params.set('status', next)
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

  const filterProps = { search: effectiveSearch, onChange: updateSearch, signedIn: Boolean(token) }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-5">
        <JobsPageHeader
          actions={
            canPostOpportunities(user?.role) ? (
              <Button size="sm" to="/opportunities/manage" variant="secondary">
                <Settings2 aria-hidden size={15} />
                공고 관리
              </Button>
            ) : null
          }
          onViewChange={setView}
          showViews={Boolean(token)}
          view={view}
        />

        {view === 'my' && token ? <MyApplicationsDashboard onTabChange={setMyTab} tab={myTab} token={token} /> : null}

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
