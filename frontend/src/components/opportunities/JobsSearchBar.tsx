import { Search } from 'lucide-react'
import { JOBS_CATEGORIES, JOBS_SORT_LABEL, type JobsSearch, type JobsSort } from '../../lib/jobsSearch'

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink-body hover:border-brand-200'
  }`

/** Search, category, recruitment state and sort shared by institution programs and posted opportunities. */
export function JobsSearchBar({ search, onChange }: { search: JobsSearch; onChange: (next: Partial<JobsSearch>) => void }) {
  return (
    <div className="sticky top-14 z-20 -mx-1 space-y-2.5 rounded-2xl bg-surface-canvas/95 px-1 py-2 backdrop-blur lg:top-20">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">프로그램·공고 검색</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-ink-muted" size={18} />
          <input
            className="h-10 w-full rounded-full border border-surface-border bg-white pl-10 pr-3 text-sm text-ink-strong outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:ring-2"
            maxLength={80}
            onChange={(event) => onChange({ q: event.target.value })}
            placeholder="프로그램명, 기관·회사, 키워드 검색"
            type="search"
            value={search.q}
          />
        </label>
        <div className="w-[7.5rem] shrink-0 sm:w-36">
          <label className="sr-only" htmlFor="jobs-sort">
            정렬
          </label>
          <select
            className="h-10 w-full rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100"
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
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button aria-pressed={search.openOnly} className={chip(search.openOnly)} onClick={() => onChange({ openOnly: !search.openOnly })} type="button">
          모집 중만
        </button>
        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-surface-border" />
        {JOBS_CATEGORIES.map((category) => (
          <button
            aria-pressed={search.category === category.id}
            className={chip(search.category === category.id)}
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
