import type { ReactNode } from 'react'
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
}

export function Tabs({ tabs, activeTab, onChange, className = '', variant = 'pills' }: TabsProps) {
  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content

  if (variant === 'underline') {
    return (
      <div className={className}>
        <div className="-mb-px overflow-x-auto border-b border-surface-border">
          <div className="flex min-w-full gap-1">
            {tabs.map((tab) => (
              <button
                className={cn(
                  'relative min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 pb-3 pt-1 text-sm font-semibold transition',
                  activeTab === tab.id
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-ink-muted hover:text-ink-strong',
                )}
                key={tab.id}
                onClick={() => onChange(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6">{activeContent}</div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <div className="inline-flex min-w-full gap-2 rounded-2xl bg-surface-muted p-1">
          {tabs.map((tab) => (
            <button
              className={cn(
                'min-h-10 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition',
                activeTab === tab.id
                  ? 'bg-white text-ink-strong shadow-sm'
                  : 'text-ink-muted hover:text-ink-strong',
              )}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5">{activeContent}</div>
    </div>
  )
}
