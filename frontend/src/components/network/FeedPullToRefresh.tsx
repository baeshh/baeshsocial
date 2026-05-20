import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const PULL_MAX = 88
const PULL_TRIGGER = 56
const SCROLL_TOP_EPS = 6

type FeedPullToRefreshProps = {
  children: ReactNode
  onRefresh: () => void | Promise<void>
  refreshing?: boolean
  disabled?: boolean
}

export function FeedPullToRefresh({
  children,
  onRefresh,
  refreshing = false,
  disabled = false,
}: FeedPullToRefreshProps) {
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  const touchStartY = useRef(0)
  const touchActive = useRef(false)
  const wheelPull = useRef(0)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshLock = useRef(false)

  const setPullDistance = useCallback((value: number) => {
    pullRef.current = value
    setPull(value)
  }, [])

  const isAtScrollTop = useCallback(() => window.scrollY <= SCROLL_TOP_EPS, [])

  const resetPull = useCallback(() => {
    wheelPull.current = 0
    setPullDistance(0)
  }, [setPullDistance])

  const runRefresh = useCallback(async () => {
    if (refreshLock.current || disabled) {
      return
    }
    refreshLock.current = true
    setPullDistance(PULL_TRIGGER)
    try {
      await onRefresh()
    } finally {
      refreshLock.current = false
      resetPull()
    }
  }, [disabled, onRefresh, resetPull, setPullDistance])

  useEffect(() => {
    if (disabled) {
      return
    }

    const onTouchStart = (event: TouchEvent) => {
      if (!isAtScrollTop() || refreshing || refreshLock.current) {
        touchActive.current = false
        return
      }
      touchStartY.current = event.touches[0]?.clientY ?? 0
      touchActive.current = true
    }

    const onTouchMove = (event: TouchEvent) => {
      if (!touchActive.current || refreshing || refreshLock.current) {
        return
      }
      if (!isAtScrollTop()) {
        touchActive.current = false
        resetPull()
        return
      }

      const currentY = event.touches[0]?.clientY ?? 0
      const delta = currentY - touchStartY.current

      if (delta <= 0) {
        setPullDistance(0)
        return
      }

      event.preventDefault()
      setPullDistance(Math.min(PULL_MAX, delta * 0.5))
    }

    const onTouchEnd = () => {
      if (!touchActive.current) {
        return
      }
      touchActive.current = false
      if (pullRef.current >= PULL_TRIGGER) {
        void runRefresh()
      } else {
        resetPull()
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (refreshing || refreshLock.current || disabled) {
        return
      }

      if (!isAtScrollTop()) {
        wheelPull.current = 0
        setPullDistance(0)
        return
      }

      if (event.deltaY >= 0) {
        return
      }

      const next = Math.min(PULL_MAX, wheelPull.current + Math.min(20, -event.deltaY * 0.14))
      wheelPull.current = next
      setPullDistance(next)

      if (wheelIdleTimer.current) {
        clearTimeout(wheelIdleTimer.current)
      }
      wheelIdleTimer.current = setTimeout(() => {
        if (wheelPull.current >= PULL_TRIGGER) {
          void runRefresh()
        } else {
          resetPull()
        }
      }, 200)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    document.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('wheel', onWheel)
      if (wheelIdleTimer.current) {
        clearTimeout(wheelIdleTimer.current)
      }
    }
  }, [disabled, isAtScrollTop, refreshing, resetPull, runRefresh, setPullDistance])

  useEffect(() => {
    if (!refreshing && !refreshLock.current) {
      resetPull()
    }
  }, [refreshing, resetPull])

  const ready = pull >= PULL_TRIGGER
  const hint =
    refreshing ? '새로고침 중…' : ready ? '놓으면 새로고침' : pull > 12 ? '당겨서 새로고침' : ''

  return (
    <div className="relative">
      <div
        aria-live="polite"
        className={cn(
          'flex items-center justify-center gap-2 overflow-hidden text-sm font-semibold text-brand-600 transition-[height] duration-200 ease-out',
          pull > 0 ? 'opacity-100' : 'opacity-0',
        )}
        style={{ height: pull > 0 ? pull : 0 }}
      >
        {pull > 16 ? (
          <>
            <RefreshCw className={cn('h-5 w-5 shrink-0', (refreshing || ready) && 'animate-spin')} />
            <span className="truncate">{hint}</span>
          </>
        ) : null}
      </div>
      <div
        className={cn(
          'transition-transform duration-200 ease-out',
          pull > 0 && 'will-change-transform',
        )}
      >
        {children}
      </div>
    </div>
  )
}
