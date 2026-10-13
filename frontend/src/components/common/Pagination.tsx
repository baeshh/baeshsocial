import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

type PaginationProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
  className?: string
}

type PageItem = number | 'gap-start' | 'gap-end'

/** Always shows the first and last page, plus a window around the current one. */
function pageItems(page: number, totalPages: number, siblings = 1): PageItem[] {
  if (totalPages <= 5 + siblings * 2) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }
  const start = Math.max(2, page - siblings)
  const end = Math.min(totalPages - 1, page + siblings)
  const items: PageItem[] = [1]
  if (start > 2) items.push('gap-start')
  for (let current = start; current <= end; current += 1) items.push(current)
  if (end < totalPages - 1) items.push('gap-end')
  items.push(totalPages)
  return items
}

const buttonClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'

export function Pagination({ page, totalPages, onPageChange, disabled = false, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <nav aria-label="페이지 이동" className={cn('flex items-center justify-center gap-1', className)}>
      <button
        aria-label="이전 페이지"
        className={cn(buttonClass, 'text-ink-body hover:bg-surface-muted')}
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        type="button"
      >
        <ChevronLeft size={18} />
      </button>
      {pageItems(page, totalPages).map((item) =>
        typeof item === 'number' ? (
          <button
            aria-current={item === page ? 'page' : undefined}
            aria-label={`${item} 페이지`}
            className={cn(
              buttonClass,
              item === page ? 'bg-brand-600 text-white' : 'text-ink-body hover:bg-surface-muted',
            )}
            disabled={disabled}
            key={item}
            onClick={() => item !== page && onPageChange(item)}
            type="button"
          >
            {item}
          </button>
        ) : (
          <span aria-hidden className="px-1 text-sm text-ink-muted" key={item}>
            …
          </span>
        ),
      )}
      <button
        aria-label="다음 페이지"
        className={cn(buttonClass, 'text-ink-body hover:bg-surface-muted')}
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        type="button"
      >
        <ChevronRight size={18} />
      </button>
    </nav>
  )
}
