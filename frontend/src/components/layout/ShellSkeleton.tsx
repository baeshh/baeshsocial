import { BaeshLogo } from '../common/BaeshLogo'

/**
 * Neutral frame shown while access is still being resolved, so neither the personal menus nor the
 * staff menus flash before the server says which one applies.
 */
export function ShellSkeleton({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-surface-canvas">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-white">
        <div className="flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6">
          <BaeshLogo imageClassName="h-9 w-9 sm:h-10 sm:w-10" to="" />
          <span className="h-4 w-32 animate-pulse rounded bg-surface-muted" />
          <span className="ml-auto h-9 w-9 animate-pulse rounded-full bg-surface-muted" />
        </div>
      </header>
      <main aria-busy="true" className="mx-auto max-w-[1200px] px-4 pt-6 sm:px-6">
        <p className="sr-only" role="status">
          {label}
        </p>
        <div className="space-y-4">
          <span className="block h-8 w-64 max-w-full animate-pulse rounded-lg bg-surface-muted" />
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <span className="block h-24 animate-pulse rounded-2xl bg-white ring-1 ring-surface-border" key={key} />
            ))}
          </div>
          <span className="block h-64 animate-pulse rounded-2xl bg-white ring-1 ring-surface-border" />
        </div>
      </main>
    </div>
  )
}
