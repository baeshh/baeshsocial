import { cn } from '../../../lib/cn'
import type { ProjectTabId } from './projectDetailContext'

export type ProjectTab = { id: ProjectTabId; label: string; count?: number }

/** Section menu; stays reachable while scrolling and scrolls sideways on narrow screens. */
export function ProjectTabNav({ tabs, active, onSelect }: { tabs: ProjectTab[]; active: ProjectTabId; onSelect: (id: ProjectTabId) => void }) {
  return (
    <nav aria-label="프로젝트 메뉴" className="sticky top-14 z-20 -mx-1 rounded-2xl bg-surface-canvas/95 px-1 py-1.5 backdrop-blur lg:top-20">
      <ul className="flex gap-1 overflow-x-auto rounded-xl border border-surface-border bg-white p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <li className="shrink-0" key={tab.id}>
            <button
              aria-current={active === tab.id ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
                active === tab.id ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted hover:text-ink-strong',
              )}
              onClick={() => onSelect(tab.id)}
              type="button"
            >
              {tab.label}
              {tab.count !== undefined ? <span className="rounded-full bg-surface-muted px-1.5 text-xs font-bold text-ink-muted">{tab.count}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
