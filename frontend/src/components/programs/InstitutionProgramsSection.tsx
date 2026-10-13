import { useState } from 'react'
import { useDiscoverPrograms } from '../../hooks/useDiscoverPrograms'
import { PROGRAM_CATEGORY_LABEL } from '../../lib/programs'
import type { ProgramCategory } from '../../types/program'
import { Pagination } from '../common/Pagination'
import { ProgramCard } from './ProgramCard'

const chip = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body hover:border-brand-200'
  }`

export function InstitutionProgramsSection({
  token,
  page,
  onPageChange,
}: {
  token: string | null
  page: number
  onPageChange: (page: number) => void
}) {
  const [category, setCategory] = useState<ProgramCategory | null>(null)
  const [openOnly, setOpenOnly] = useState(false)
  const filtered = Boolean(category) || openOnly
  const query = useDiscoverPrograms(token, page, { category, openOnly })
  const data = query.data
  if (!data || (data.total === 0 && !filtered)) return null

  const setFilter = (next: () => void) => {
    next()
    onPageChange(1)
  }

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
      <div className="flex flex-wrap gap-1.5">
        <button className={chip(openOnly)} onClick={() => setFilter(() => setOpenOnly((value) => !value))} type="button">
          모집 중만
        </button>
        <span className="mx-1 w-px self-stretch bg-surface-border" />
        <button className={chip(!category)} onClick={() => setFilter(() => setCategory(null))} type="button">
          전체 유형
        </button>
        {(Object.keys(PROGRAM_CATEGORY_LABEL) as ProgramCategory[]).map((key) => (
          <button className={chip(category === key)} key={key} onClick={() => setFilter(() => setCategory(key))} type="button">
            {PROGRAM_CATEGORY_LABEL[key]}
          </button>
        ))}
      </div>
      {data.total === 0 ? (
        <p className="rounded-2xl bg-surface-muted px-4 py-6 text-center text-sm text-ink-muted">조건에 맞는 프로그램이 없습니다.</p>
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
