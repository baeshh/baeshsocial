import { useId, type ReactNode } from 'react'
import { cn } from '../../../lib/cn'

/** A titled block inside a project tab; the heading names the region for assistive technology. */
export function ProjectSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-5', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink-strong" id={id}>
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm leading-6 text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
