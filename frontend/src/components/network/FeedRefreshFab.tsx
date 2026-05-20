import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'

type FeedRefreshFabProps = {
  visible: boolean
  loading?: boolean
  onRefresh: () => void
}

export function FeedRefreshFab({ visible, loading, onRefresh }: FeedRefreshFabProps) {
  return (
    <button
      aria-label="피드 새로고침"
      className={cn(
        'fixed left-1/2 z-30 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-surface-border bg-white/95 text-ink-strong shadow-lg shadow-black/10 backdrop-blur-md transition',
        'hover:border-brand-200 hover:bg-white hover:text-brand-700',
        'top-[calc(3.5rem+env(safe-area-inset-top,0px))] md:top-[4.25rem]',
        visible ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
      )}
      disabled={loading}
      onClick={onRefresh}
      type="button"
    >
      <RefreshCw className={cn('h-5 w-5', loading && 'animate-spin')} />
    </button>
  )
}
