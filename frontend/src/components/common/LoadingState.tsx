import { cn } from '../../lib/cn'

type LoadingStateProps = {
  label?: string
  className?: string
}

export function LoadingState({ label = '데이터를 불러오는 중입니다', className = '' }: LoadingStateProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-muted', className)}>
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-100 border-t-brand-600" />
      <span>{label}</span>
    </div>
  )
}
