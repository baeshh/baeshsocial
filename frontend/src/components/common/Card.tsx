import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <section
      className={cn('rounded-3xl border border-surface-border bg-white p-6 shadow-card', className)}
      {...props}
    >
      {children}
    </section>
  )
}

export function CardHeader({ children, className = '', ...props }: CardProps) {
  return (
    <div className={cn('mb-5 flex flex-col gap-2', className)} {...props}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '', ...props }: CardProps) {
  return (
    <h2 className={cn('text-xl font-bold tracking-tight text-ink-strong', className)} {...props}>
      {children}
    </h2>
  )
}

export function CardDescription({ children, className = '', ...props }: CardProps) {
  return (
    <p className={cn('text-sm leading-6 text-ink-muted', className)} {...props}>
      {children}
    </p>
  )
}
