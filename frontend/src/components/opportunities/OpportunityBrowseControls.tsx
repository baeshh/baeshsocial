import { Search, SlidersHorizontal } from 'lucide-react'
import { Modal } from '../common/Modal'
import { Input, Select } from '../common/Input'
import type { Dispatch, SetStateAction } from 'react'

export type OpportunityFilters = {
  q: string
  type: string
  skill: string
  remote: boolean
  saved: boolean
}

type OpportunityBrowseControlsProps = {
  filters: OpportunityFilters
  setFilters: Dispatch<SetStateAction<OpportunityFilters>>
  sortBy: 'match' | 'recent'
  setSortBy: (value: 'match' | 'recent') => void
  filterModalOpen: boolean
  setFilterModalOpen: (open: boolean) => void
  onReset: () => void
}

const skillPresets = ['Python', 'React', 'Node.js'] as const

export function countActiveFilters(filters: OpportunityFilters) {
  let count = 0
  if (filters.q.trim()) count += 1
  if (filters.type) count += 1
  if (filters.skill) count += 1
  if (filters.remote) count += 1
  if (filters.saved) count += 1
  return count
}

function setCategory(
  setFilters: Dispatch<SetStateAction<OpportunityFilters>>,
  cat: 'jobs' | 'hackathon' | 'education' | 'all',
) {
  if (cat === 'all') {
    setFilters((prev) => ({ ...prev, type: '' }))
  }
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

type FiltersPanelProps = {
  filters: OpportunityFilters
  setFilters: Dispatch<SetStateAction<OpportunityFilters>>
  onReset: () => void
  compact?: boolean
}

export function OpportunityFiltersPanel({ filters, setFilters, onReset, compact }: FiltersPanelProps) {
  const categoryJobs =
    filters.type === '' || filters.type === 'job' || filters.type === 'internship'
  const categoryHack = filters.type === 'hackathon'
  const categoryEdu = filters.type === 'education'

  return (
    <div className={compact ? 'space-y-4' : 'mt-5 space-y-5'}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">카테고리</p>
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
            <input
              checked={categoryJobs}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
              onChange={() => setCategory(setFilters, 'jobs')}
              type="checkbox"
            />
            채용·인턴십
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
            <input
              checked={categoryHack}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
              onChange={() => setCategory(setFilters, 'hackathon')}
              type="checkbox"
            />
            해커톤
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
            <input
              checked={categoryEdu}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
              onChange={() => setCategory(setFilters, 'education')}
              type="checkbox"
            />
            교육
          </label>
        </div>
      </div>
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
      <button
        className="text-sm font-semibold text-brand-600 hover:underline"
        onClick={onReset}
        type="button"
      >
        필터 초기화
      </button>
    </div>
  )
}

export function OpportunityBrowseControls({
  filters,
  setFilters,
  sortBy,
  setSortBy,
  filterModalOpen,
  setFilterModalOpen,
  onReset,
}: OpportunityBrowseControlsProps) {
  const activeCount = countActiveFilters(filters)

  const chips: { id: 'all' | 'jobs' | 'hackathon' | 'education' | 'remote' | 'saved'; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'jobs', label: '채용·인턴' },
    { id: 'hackathon', label: '해커톤' },
    { id: 'education', label: '교육' },
    { id: 'remote', label: '원격' },
    { id: 'saved', label: '저장' },
  ]

  const chipActive = (id: (typeof chips)[number]['id']) => {
    if (id === 'remote') return filters.remote
    if (id === 'saved') return filters.saved
    if (id === 'all') return filters.type === ''
    if (id === 'jobs') {
      return filters.type === '' || filters.type === 'job' || filters.type === 'internship'
    }
    if (id === 'hackathon') return filters.type === 'hackathon'
    if (id === 'education') return filters.type === 'education'
    return false
  }

  const onChipClick = (id: (typeof chips)[number]['id']) => {
    if (id === 'remote') {
      setFilters((prev) => ({ ...prev, remote: !prev.remote }))
      return
    }
    if (id === 'saved') {
      setFilters((prev) => ({ ...prev, saved: !prev.saved }))
      return
    }
    setCategory(setFilters, id)
  }

  return (
    <>
      <div className="sticky top-14 z-20 -mx-1 space-y-2.5 rounded-2xl bg-surface-canvas/95 px-1 py-2 backdrop-blur lg:top-20">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">프로그램 검색</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-ink-muted"
              size={18}
            />
            <input
              className="h-10 w-full rounded-full border border-surface-border bg-white pl-10 pr-3 text-sm text-ink-strong outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:ring-2"
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="키워드 검색"
              type="search"
              value={filters.q}
            />
          </label>
          <button
            aria-label="필터 열기"
            className="relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-surface-border bg-white px-3.5 text-sm font-semibold text-ink-strong transition hover:border-brand-200 hover:bg-brand-50"
            onClick={() => setFilterModalOpen(true)}
            type="button"
          >
            <SlidersHorizontal size={16} />
            <span>필터</span>
            {activeCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>
          <div className="w-[7.5rem] shrink-0">
            <label className="sr-only" htmlFor="jobs-sort-mobile">
              정렬
            </label>
            <select
              className="h-10 w-full rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100"
              id="jobs-sort-mobile"
              onChange={(event) => setSortBy(event.target.value as 'match' | 'recent')}
              value={sortBy}
            >
              <option value="match">매칭순</option>
              <option value="recent">최신순</option>
            </select>
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <button
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                chipActive(chip.id)
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-surface-border bg-white text-ink-body'
              }`}
              key={chip.id}
              onClick={() => onChipClick(chip.id)}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <Modal
        description="카테고리·스킬·저장 목록 등 상세 조건을 설정합니다."
        onClose={() => setFilterModalOpen(false)}
        open={filterModalOpen}
        title="필터"
      >
        <OpportunityFiltersPanel
          compact
          filters={filters}
          onReset={() => {
            onReset()
            setFilterModalOpen(false)
          }}
          setFilters={setFilters}
        />
        <div className="mt-6 flex gap-2">
          <button
            className="flex-1 rounded-full border border-surface-border py-3 text-sm font-semibold text-ink-strong"
            onClick={() => setFilterModalOpen(false)}
            type="button"
          >
            닫기
          </button>
          <button
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white"
            onClick={() => setFilterModalOpen(false)}
            type="button"
          >
            적용
          </button>
        </div>
      </Modal>
    </>
  )
}

/** 데스크톱 사이드바 필터 카드 */
export function OpportunityFiltersSidebar({
  filters,
  setFilters,
  onReset,
}: Omit<OpportunityBrowseControlsProps, 'sortBy' | 'setSortBy' | 'filterModalOpen' | 'setFilterModalOpen'>) {
  return (
    <div className="hidden h-fit rounded-2xl border border-surface-border bg-white p-5 shadow-sm lg:block">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border pb-4">
        <h2 className="text-lg font-bold text-ink-strong">필터</h2>
        <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={onReset} type="button">
          초기화
        </button>
      </div>
      <OpportunityFiltersPanel filters={filters} onReset={onReset} setFilters={setFilters} />
    </div>
  )
}
