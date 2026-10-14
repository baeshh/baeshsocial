import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type TabItem = {
  id: string
  label: string
  content: ReactNode
}

type TabsProps = {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
  variant?: 'pills' | 'underline'
  /** Accessible name for the tab list. */
  label?: string
}

export function Tabs({ tabs, activeTab, onChange, className = '', variant = 'pills', label }: TabsProps) {
  const baseId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content
  const tabId = (id: string) => `${baseId}-tab-${id}`
  const panelId = `${baseId}-panel`

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key) || tabs.length === 0) return
    event.preventDefault()
    const index = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab))
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    const next = tabs[nextIndex]
    onChange(next.id)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${CSS.escape(next.id)}"]`)?.focus()
  }

  const tabButton = (tab: TabItem, classes: string) => (
    <button
      aria-controls={panelId}
      aria-selected={activeTab === tab.id}
      className={classes}
      data-tab-id={tab.id}
      id={tabId(tab.id)}
      key={tab.id}
      onClick={() => onChange(tab.id)}
      role="tab"
      tabIndex={activeTab === tab.id ? 0 : -1}
      type="button"
    >
      {tab.label}
    </button>
  )

  const panel = (spacing: string) => (
    <div aria-labelledby={tabId(activeTab)} className={spacing} id={panelId} role="tabpanel" tabIndex={0}>
      {activeContent}
    </div>
  )

  if (variant === 'underline') {
    return (
      <div className={className}>
        <div className="-mb-px overflow-x-auto border-b border-surface-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div aria-label={label} className="flex min-w-full gap-1" onKeyDown={onKeyDown} ref={listRef} role="tablist">
            {tabs.map((tab) =>
              tabButton(
                tab,
                cn(
                  'relative min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition focus-visible:outline-offset-[-2px]',
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-ink-muted hover:text-ink-strong',
                ),
              ),
            )}
          </div>
        </div>
        {panel('mt-6 focus-visible:outline-none')}
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <div
          aria-label={label}
          className="inline-flex min-w-full gap-2 rounded-2xl bg-surface-muted p-1"
          onKeyDown={onKeyDown}
          ref={listRef}
          role="tablist"
        >
          {tabs.map((tab) =>
            tabButton(
              tab,
              cn(
                'min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition',
                activeTab === tab.id ? 'bg-white text-ink-strong shadow-sm' : 'text-ink-muted hover:text-ink-strong',
              ),
            ),
          )}
        </div>
      </div>
      {panel('mt-5 focus-visible:outline-none')}
    </div>
  )
}
