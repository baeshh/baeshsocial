import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { JOBS_CATEGORIES, JOBS_SORT_LABEL, type JobsSearch, type JobsSort } from '../../lib/jobsSearch'
import { chipClass } from './jobsStyles'

/** Search, category, recruitment state and sort shared by institution programs and posted opportunities. */
export function JobsSearchBar({
  search,
  onChange,
  filterButton,
}: {
  search: JobsSearch
  onChange: (next: Partial<JobsSearch>) => void
  /** Opens the detail filters on screens without the side panel. */
  filterButton?: ReactNode
}) {
  return (
    <div className="sticky top-14 z-20 -mx-1 space-y-2 rounded-2xl bg-surface-canvas/95 px-1 py-2 backdrop-blur lg:top-20">
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <label className="relative w-full min-w-0 sm:flex-1">
          <span className="sr-only">프로그램·공고 검색</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-ink-muted" size={18} />
          <input
            className="h-11 w-full rounded-full border border-surface-border bg-white pl-10 pr-3 text-sm text-ink-strong outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:ring-2"
            maxLength={80}
            onChange={(event) => onChange({ q: event.target.value })}
            placeholder="어떤 기회를 찾고 있나요?"
            type="search"
            value={search.q}
          />
        </label>
        {filterButton ? <div className="flex-1 sm:flex-none lg:hidden">{filterButton}</div> : null}
        <div className="w-[8.5rem] shrink-0 sm:w-36">
          <label className="sr-only" htmlFor="jobs-sort">
            정렬
          </label>
          <select
            className="h-11 w-full rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100"
            id="jobs-sort"
            onChange={(event) => onChange({ sort: event.target.value as JobsSort })}
            value={search.sort}
          >
            {(Object.keys(JOBS_SORT_LABEL) as JobsSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {JOBS_SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        aria-label="분류"
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
      >
        <button aria-pressed={search.openOnly} className={chipClass(search.openOnly)} onClick={() => onChange({ openOnly: !search.openOnly })} type="button">
          모집 중만
        </button>
        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-surface-border" />
        {JOBS_CATEGORIES.map((category) => (
          <button
            aria-pressed={search.category === category.id}
            className={chipClass(search.category === category.id)}
            key={category.id}
            onClick={() => onChange({ category: category.id })}
            type="button"
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  )
}
