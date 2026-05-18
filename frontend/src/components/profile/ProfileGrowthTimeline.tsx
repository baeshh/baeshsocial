import { useState } from 'react'
import { Button } from '../common/Button'
import { CardDescription, CardHeader, CardTitle } from '../common/Card'
import { cn } from '../../lib/cn'
import type { GrowthTimelineItem } from '../../types/profile'

const PREVIEW_COUNT = 6

type ProfileGrowthTimelineProps = {
  items: GrowthTimelineItem[]
  formatDate: (value: string) => string
}

export function ProfileGrowthTimeline({ items, formatDate }: ProfileGrowthTimelineProps) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = items.length > PREVIEW_COUNT
  const visibleItems = expanded ? items : items.slice(0, PREVIEW_COUNT)

  return (
    <>
      <CardHeader>
        <CardTitle>Growth Timeline</CardTitle>
        <CardDescription>공개 프로젝트·자격·경력 활동 흐름입니다.</CardDescription>
      </CardHeader>
      <div className="relative pl-2">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-surface-border" aria-hidden />
        <div
          className={cn(
            'relative space-y-0',
            expanded && hasMore && 'max-h-[min(24rem,50vh)] overflow-y-auto pr-1',
          )}
        >
          {items.length === 0 ? (
            <p className="pb-4 text-sm text-ink-muted">
              공개 프로젝트·이력·프로그램 활동이 쌓이면 타임라인이 표시됩니다.
            </p>
          ) : null}
          {visibleItems.map((item, i) => (
            <div className="relative flex gap-4 pb-6 pl-6" key={item.id}>
              <span
                className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${
                  i === 0 ? 'bg-brand-600' : 'border-2 border-brand-300 bg-white'
                }`}
              />
              <div>
                <p className="font-bold text-ink-strong">{item.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                <p className="mt-2 text-xs font-semibold text-brand-600">{formatDate(item.date)}</p>
              </div>
            </div>
          ))}
        </div>
        {hasMore ? (
          <div className="mt-1 border-t border-surface-border pt-3">
            <Button
              className="h-9 w-full rounded-full text-sm"
              onClick={() => setExpanded((value) => !value)}
              type="button"
              variant="ghost"
            >
              {expanded ? '접기' : `더 보기 (${items.length - PREVIEW_COUNT}개 더)`}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  )
}
