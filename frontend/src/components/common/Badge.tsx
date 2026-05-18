import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BadgeTone = 'blue' | 'purple' | 'gray' | 'green' | 'red'

const toneClasses: Record<BadgeTone, string> = {
  blue: 'border-brand-100 bg-brand-50 text-brand-700',
  purple: 'border-accent-100 bg-accent-50 text-accent-600',
  gray: 'border-surface-border bg-surface-muted text-ink-body',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  red: 'border-red-200 bg-red-50 text-red-700',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: BadgeTone
}

export function Badge({ children, tone = 'gray', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
