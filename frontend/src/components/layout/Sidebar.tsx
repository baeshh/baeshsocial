import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { generalNavItems } from './navigation'

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-surface-border bg-white px-4 py-5 lg:block">
      <NavLink className="flex items-center gap-3 px-2" to="/">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-strong text-sm font-bold text-white">
          B
        </span>
        <div>
          <p className="text-base font-bold tracking-tight text-ink-strong">BAESH</p>
          <p className="text-xs font-medium text-ink-muted">Career Data Platform</p>
        </div>
      </NavLink>

      <nav className="mt-8 space-y-1">
        {generalNavItems.map(({ label, to, icon: Icon }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink-strong',
              )
            }
            key={to}
            to={to}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
