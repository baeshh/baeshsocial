import { cn } from '../../lib/cn'
import type { UsageRow } from '../../types/commercial'

export function UsageBar({ row }: { row: UsageRow }) {
  const ratio = row.limit ? Math.min(1, row.used / row.limit) : 0
  const tone = row.exceeded || ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-brand-500'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-ink-body">{row.label}</span>
        <span className={cn('font-semibold', row.exceeded ? 'text-red-700' : 'text-ink-strong')}>
          {row.used.toLocaleString('ko-KR')}
          <span className="font-normal text-ink-muted"> / {row.limit === null ? '무제한' : row.limit.toLocaleString('ko-KR')}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted">
        {row.limit !== null ? <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(2, ratio * 100)}%` }} /> : null}
      </div>
    </div>
  )
}
