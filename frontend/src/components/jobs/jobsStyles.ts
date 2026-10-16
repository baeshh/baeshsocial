export const chipClass = (active: boolean) =>
  `inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 ${
    active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink-body hover:border-brand-200'
  }`
