import { SearchX } from 'lucide-react'
import { Button } from '../common/Button'

/** No result for the whole search: says whether the conditions are the cause and offers to clear them. */
export function JobsEmptyState({ narrowed, onReset }: { narrowed: boolean; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-border bg-white px-5 py-10 text-center">
      <SearchX aria-hidden className="mx-auto text-ink-muted" size={28} />
      <h3 className="mt-3 text-base font-bold text-ink-strong">{narrowed ? '조건에 맞는 기회가 없습니다' : '아직 등록된 기회가 없습니다'}</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-ink-muted">
        {narrowed ? '검색어를 줄이거나 분류·필터를 넓혀 보세요.' : '기관과 기업이 프로그램이나 공고를 올리면 여기에 표시됩니다.'}
      </p>
      {narrowed ? (
        <div className="mt-5 flex justify-center">
          <Button onClick={onReset} size="sm" variant="secondary">
            검색 조건 초기화
          </Button>
        </div>
      ) : null}
    </div>
  )
}
