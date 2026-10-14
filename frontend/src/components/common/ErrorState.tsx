import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from './Button'

type ErrorStateProps = {
  error?: unknown
  message?: string
  onRetry?: () => void
  className?: string
}

/** Inline failure notice. Announced to screen readers and, when the data can be refetched, retryable in place. */
export function ErrorState({ error, message, onRetry, className }: ErrorStateProps) {
  const text = message ?? (error instanceof Error && error.message ? error.message : '불러오지 못했습니다.')
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm font-medium text-red-700', className)}
      role="alert"
    >
      <span className="min-w-0 flex-1">{text}</span>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" variant="secondary">
          <RefreshCw aria-hidden size={14} />
          다시 시도
        </Button>
      ) : null}
    </div>
  )
}
