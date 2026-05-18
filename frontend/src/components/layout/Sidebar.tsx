import { NavLink } from 'react-router-dom'
import { BaeshLogo } from '../common/BaeshLogo'
import { cn } from '../../lib/cn'
import { generalNavItems } from './navigation'

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-surface-border bg-white px-4 py-5 lg:block">
      <BaeshLogo className="px-2" imageClassName="h-10 w-10" to="/dashboard" />

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
