import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BadgeTone = 'blue' | 'purple' | 'gray' | 'green' | 'amber' | 'red'

const toneClasses: Record<BadgeTone, string> = {
  blue: 'border-brand-100 bg-brand-50 text-brand-700',
  purple: 'border-accent-100 bg-accent-50 text-accent-600',
  gray: 'border-surface-border bg-surface-muted text-ink-body',
  green: 'border-success-100 bg-success-50 text-success-700',
  amber: 'border-warning-100 bg-warning-50 text-warning-700',
  red: 'border-danger-100 bg-danger-50 text-danger-700',
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: BadgeTone
  /** Status must not rely on color alone; pass an icon or keep the text explicit. */
  icon?: ReactNode
}

export function Badge({ children, tone = 'gray', icon, className = '', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}
