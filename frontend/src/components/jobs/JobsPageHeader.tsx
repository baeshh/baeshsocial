import type { ReactNode } from 'react'

export type JobsView = 'browse' | 'my'

const VIEWS: { id: JobsView; label: string }[] = [
  { id: 'browse', label: '기회 탐색' },
  { id: 'my', label: '내 지원 현황' },
]

/** Title, the browse / my-applications switch (signed in only) and room for account-specific actions. */
export function JobsPageHeader({
  view,
  onViewChange,
  showViews,
  actions,
}: {
  view: JobsView
  onViewChange: (view: JobsView) => void
  showViews: boolean
  actions?: ReactNode
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink-strong sm:text-2xl">나에게 맞는 기회 찾기</h1>
          <p className="mt-1 text-sm text-ink-muted">프로그램 · 인턴십 · 채용 · 공모전</p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {showViews ? (
        <nav aria-label="기회 화면" className="flex gap-1 border-b border-surface-border">
          {VIEWS.map((item) => (
            <button
              aria-current={view === item.id ? 'page' : undefined}
              className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold transition ${
                view === item.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink-strong'
              }`}
              key={item.id}
              onClick={() => onViewChange(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  )
}
