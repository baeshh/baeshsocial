import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'

const ADMIN_LINKS = [
  { to: '/admin/ops', label: '운영 관제' },
  { to: '/admin/billing', label: '과금·계약' },
  { to: '/admin/organizations', label: '조직 인증' },
  { to: '/admin/users', label: '사용자' },
  { to: '/admin/audit', label: '감사 로그' },
  { to: '/admin/support', label: '지원·공지' },
  { to: '/admin/ai', label: 'AI 운영' },
]

export function AdminTabs() {
  return (
    <nav aria-label="운영자 메뉴" className="flex flex-wrap gap-1.5">
        {ADMIN_LINKS.map((link) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                isActive ? 'bg-ink-strong text-white' : 'border border-surface-border bg-white text-ink-body hover:bg-surface-muted',
              )
            }
            key={link.to}
            to={link.to}
          >
            {link.label}
          </NavLink>
        ))}
    </nav>
  )
}

export function AdminNav({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-4">
      <AdminTabs />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">{title}</h1>
        {description ? <p className="mt-2 text-sm text-ink-body">{description}</p> : null}
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'red' | 'green' }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold', tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-ink-strong')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  )
}
