import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'

type LoadMoreProps = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  /** Load automatically when the sentinel scrolls into view; the button stays as a fallback. */
  auto?: boolean
  label?: string
  className?: string
}

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  auto = true,
  label = '더 보기',
  className,
}: LoadMoreProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onLoadMoreRef = useRef(onLoadMore)

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore
  }, [onLoadMore])

  useEffect(() => {
    const node = sentinelRef.current
    if (!auto || !hasNextPage || isFetchingNextPage || !node || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [auto, hasNextPage, isFetchingNextPage])

  if (!hasNextPage) {
    return null
  }

  return (
    <div className={cn('flex justify-center pt-2', className)} ref={sentinelRef}>
      <button
        className="min-h-10 rounded-full border border-surface-border bg-white px-5 text-sm font-semibold text-ink-body transition hover:border-brand-200 hover:text-brand-700 disabled:opacity-60"
        disabled={isFetchingNextPage}
        onClick={onLoadMore}
        type="button"
      >
        {isFetchingNextPage ? '불러오는 중…' : label}
      </button>
    </div>
  )
}
