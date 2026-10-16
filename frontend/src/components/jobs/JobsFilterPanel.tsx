import { SlidersHorizontal } from 'lucide-react'
import { useId } from 'react'
import {
  JOBS_PANEL_DEFAULTS,
  JOBS_SOURCE_LABEL,
  SKILL_PRESETS,
  countPanelFilters,
  type JobsSearch,
  type JobsSource,
} from '../../lib/jobsSearch'
import { DELIVERY_MODE_LABEL, PROGRAM_AUDIENCE_LABEL } from '../../lib/programs'
import type { DeliveryMode, ProgramAudience } from '../../types/program'
import { Modal } from '../common/Modal'
import { chipClass } from './jobsStyles'

type PanelProps = {
  search: JobsSearch
  onChange: (next: Partial<JobsSearch>) => void
  /** Posted opportunities need a signed-in viewer, so their filters are hidden otherwise. */
  signedIn: boolean
}

const groupTitle = 'text-xs font-bold uppercase tracking-wide text-ink-muted'
const selectClass =
  'mt-1.5 h-10 w-full rounded-xl border border-surface-border bg-white px-3 text-sm text-ink-strong outline-none focus:border-brand-200 focus:ring-2 focus:ring-brand-100'

/** Detail filters: which kind of result to list, then conditions that only one kind supports. */
export function JobsFilterFields({ search, onChange, signedIn }: PanelProps) {
  const name = useId()
  const showPostingFilters = signedIn && search.source !== 'programs'
  const showProgramFilters = search.source !== 'postings'

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className={groupTitle}>결과 유형</legend>
        <div className="mt-2 space-y-1">
          {(Object.keys(JOBS_SOURCE_LABEL) as JobsSource[]).map((source) => (
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-ink-body hover:bg-surface-muted" key={source}>
              <input
                checked={search.source === source}
                className="h-4 w-4 border-surface-border text-brand-600"
                name={name}
                onChange={() => onChange({ source })}
                type="radio"
              />
              {JOBS_SOURCE_LABEL[source]}
            </label>
          ))}
        </div>
      </fieldset>

      {showPostingFilters ? (
        <fieldset className="border-t border-surface-border pt-4">
          <legend className={`${groupTitle} float-left w-full`}>일반 공고 조건</legend>
          <p className="clear-both pt-1 text-xs text-ink-muted">일반 공고에만 적용됩니다. 선택하면 기관 프로그램은 결과에서 빠집니다.</p>
          <p className="mt-3 text-sm font-semibold text-ink-strong">요구 스킬</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SKILL_PRESETS.map((skill) => (
              <button
                aria-pressed={search.skill === skill}
                className={chipClass(search.skill === skill)}
                key={skill}
                onClick={() => onChange({ skill: search.skill === skill ? '' : skill })}
                type="button"
              >
                {skill}
              </button>
            ))}
          </div>
          <label className="mt-3 flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
            <input
              checked={search.remote}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
              onChange={(event) => onChange({ remote: event.target.checked })}
              type="checkbox"
            />
            원격 근무 가능
          </label>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-ink-body">
            <input
              checked={search.saved}
              className="h-4 w-4 rounded border-surface-border text-brand-600"
              onChange={(event) => onChange({ saved: event.target.checked })}
              type="checkbox"
            />
            저장한 공고만
          </label>
        </fieldset>
      ) : null}

      {showProgramFilters ? (
        <fieldset className="border-t border-surface-border pt-4">
          <legend className={`${groupTitle} float-left w-full`}>기관 프로그램 조건</legend>
          <p className="clear-both pt-1 text-xs text-ink-muted">기관 프로그램에만 적용됩니다. 선택하면 일반 공고는 결과에서 빠집니다.</p>
          <label className="mt-3 block text-sm font-semibold text-ink-strong">
            진행 방식
            <select className={selectClass} onChange={(event) => onChange({ mode: event.target.value as DeliveryMode | '' })} value={search.mode}>
              <option value="">전체</option>
              {(Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {DELIVERY_MODE_LABEL[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold text-ink-strong">
            지원 대상
            <select className={selectClass} onChange={(event) => onChange({ audience: event.target.value as ProgramAudience | '' })} value={search.audience}>
              <option value="">전체</option>
              {(Object.keys(PROGRAM_AUDIENCE_LABEL) as ProgramAudience[]).map((audience) => (
                <option key={audience} value={audience}>
                  {PROGRAM_AUDIENCE_LABEL[audience]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      ) : null}
    </div>
  )
}

/** Desktop: the detail filters stay open beside the results. */
export function JobsFilterSidebar(props: PanelProps) {
  const active = countPanelFilters(props.search)
  return (
    <aside aria-label="상세 필터" className="hidden h-fit rounded-2xl border border-surface-border bg-white p-5 shadow-sm lg:block">
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-surface-border pb-3">
        <h2 className="text-base font-bold text-ink-strong">상세 필터</h2>
        {active > 0 ? (
          <button className="text-sm font-semibold text-brand-600 hover:underline" onClick={() => props.onChange(JOBS_PANEL_DEFAULTS)} type="button">
            상세 필터 초기화
          </button>
        ) : null}
      </div>
      <JobsFilterFields {...props} />
    </aside>
  )
}

/** Phones and tablets: the same filters in a dialog. */
export function JobsFilterButton({ open, setOpen, ...props }: PanelProps & { open: boolean; setOpen: (open: boolean) => void }) {
  const active = countPanelFilters(props.search)
  return (
    <>
      <button
        aria-haspopup="dialog"
        className="relative inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-surface-border bg-white px-4 text-sm font-semibold text-ink-strong transition hover:border-brand-200 hover:bg-brand-50"
        onClick={() => setOpen(true)}
        type="button"
      >
        <SlidersHorizontal aria-hidden size={16} />
        상세 필터
        {active > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
            {active}
            <span className="sr-only">개 적용됨</span>
          </span>
        ) : null}
      </button>
      <Modal description="결과 유형과 공고·프로그램별 조건을 고릅니다. 바꾸는 즉시 결과에 반영됩니다." onClose={() => setOpen(false)} open={open} title="상세 필터">
        <JobsFilterFields {...props} />
        <div className="mt-6 flex gap-2">
          <button
            className="min-h-11 flex-1 rounded-full border border-surface-border text-sm font-semibold text-ink-strong disabled:text-ink-muted"
            disabled={active === 0}
            onClick={() => props.onChange(JOBS_PANEL_DEFAULTS)}
            type="button"
          >
            초기화
          </button>
          <button className="min-h-11 flex-[2] rounded-full bg-brand-600 text-sm font-semibold text-white" onClick={() => setOpen(false)} type="button">
            결과 보기
          </button>
        </div>
      </Modal>
    </>
  )
}
