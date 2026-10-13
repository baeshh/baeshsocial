import type { UseQueryResult } from '@tanstack/react-query'
import type { DiscoverProgramsPage } from '../../types/program'
import { Pagination } from '../common/Pagination'
import { ProgramCard } from './ProgramCard'

export function InstitutionProgramsSection({
  query,
  filtered,
  onPageChange,
}: {
  query: UseQueryResult<DiscoverProgramsPage>
  /** Whether the Jobs search narrows the list; an empty filtered result still gets a note. */
  filtered: boolean
  onPageChange: (page: number) => void
}) {
  const data = query.data
  if (!data || (data.total === 0 && !filtered)) return null

  return (
    <section className="scroll-mt-40 space-y-3" id="institution-programs">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-surface-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-ink-strong">기관 프로그램</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            인증된 기관이 BAESH에서 직접 운영하는 프로그램입니다.{data.openCount ? ` 지금 ${data.openCount}개 모집 중` : ''}
          </p>
        </div>
        {data.total > 0 ? (
          <p className="text-xs text-ink-muted">
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} / {data.total}개
          </p>
        ) : null}
      </div>
      {data.total === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">조건에 맞는 기관 프로그램이 없습니다.</p>
      ) : (
        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
          {data.programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
      <Pagination
        disabled={query.isPlaceholderData}
        onPageChange={(next) => {
          onPageChange(next)
          document.getElementById('institution-programs')?.scrollIntoView({ behavior: 'smooth' })
        }}
        page={data.page}
        totalPages={data.totalPages}
      />
    </section>
  )
}
