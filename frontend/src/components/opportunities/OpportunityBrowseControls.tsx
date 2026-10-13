import { SlidersHorizontal } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { OpportunityFilters } from '../../lib/jobsSearch'
import { Modal } from '../common/Modal'

type FiltersPanelProps = {
  filters: OpportunityFilters
  setFilters: Dispatch<SetStateAction<OpportunityFilters>>
  onReset: () => void
  compact?: boolean
}

const skillPresets = ['Python', 'React', 'Node.js'] as const

function countActiveFilters(filters: OpportunityFilters) {
  return [filters.skill, filters.remote, filters.saved].filter(Boolean).length
}

export function OpportunityFiltersPanel({ filters, setFilters, onReset, compact }: FiltersPanelProps) {
  return (
    <div className={compact ? 'space-y-4' : 'mt-5 space-y-5'}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">스킬</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {skillPresets.map((skill) => (
            <button
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filters.skill === skill
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-surface-border bg-white text-ink-body hover:border-brand-200'
              }`}
              key={skill}
              onClick={() => setFilters((prev) => ({ ...prev, skill: prev.skill === skill ? '' : skill }))}
              type="button"
            >
              {skill}
            </button>
          ))}
        </div>
      </div>
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
        저장한 공고
      </label>
      <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={onReset} type="button">
        필터 초기화
      </button>
    </div>
  )
}

/** Mobile: opens the opportunity-only filters in a modal. */
export function OpportunityFilterButton({
  filters,
  setFilters,
  onReset,
  open,
  setOpen,
}: Omit<FiltersPanelProps, 'compact'> & { open: boolean; setOpen: (open: boolean) => void }) {
  const activeCount = countActiveFilters(filters)
  return (
    <>
      <button
        className="relative inline-flex h-9 items-center gap-1.5 rounded-full border border-surface-border bg-white px-3.5 text-sm font-semibold text-ink-strong transition hover:border-brand-200 hover:bg-brand-50"
        onClick={() => setOpen(true)}
        type="button"
      >
        <SlidersHorizontal size={16} />
        공고 상세 필터
        {activeCount > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">{activeCount}</span>
        ) : null}
      </button>
      <Modal description="스킬·원격·저장한 공고 조건을 설정합니다." onClose={() => setOpen(false)} open={open} title="공고 상세 필터">
        <OpportunityFiltersPanel
          compact
          filters={filters}
          onReset={() => {
            onReset()
            setOpen(false)
          }}
          setFilters={setFilters}
        />
        <div className="mt-6">
          <button className="w-full rounded-full bg-brand-600 py-3 text-sm font-semibold text-white" onClick={() => setOpen(false)} type="button">
            적용
          </button>
        </div>
      </Modal>
    </>
  )
}

/** Desktop sidebar card. */
export function OpportunityFiltersSidebar({ filters, setFilters, onReset }: Omit<FiltersPanelProps, 'compact'>) {
  return (
    <div className="hidden h-fit rounded-2xl border border-surface-border bg-white p-5 shadow-sm lg:block">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border pb-4">
        <h2 className="text-lg font-bold text-ink-strong">공고 상세 필터</h2>
        <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={onReset} type="button">
          초기화
        </button>
      </div>
      <OpportunityFiltersPanel filters={filters} onReset={onReset} setFilters={setFilters} />
    </div>
  )
}
