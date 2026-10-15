/** Card-shaped placeholders while a result list loads for the first time. */
export function JobsResultSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div aria-busy="true" className="grid gap-3 sm:grid-cols-2" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div aria-hidden className="animate-pulse rounded-2xl border border-surface-border bg-white p-4" key={index}>
          <div className="flex gap-1.5">
            <div className="h-5 w-24 rounded-full bg-surface-muted" />
            <div className="h-5 w-14 rounded-full bg-surface-muted" />
          </div>
          <div className="mt-3 h-5 w-4/5 rounded bg-surface-muted" />
          <div className="mt-2 h-4 w-3/5 rounded bg-surface-muted" />
          <div className="mt-5 flex justify-between">
            <div className="h-5 w-16 rounded-full bg-surface-muted" />
            <div className="h-5 w-20 rounded bg-surface-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
