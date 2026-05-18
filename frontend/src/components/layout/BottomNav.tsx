import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { bottomNavItems } from './navigation'

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-border bg-white/95 px-2 pb-2 pt-1 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {bottomNavItems.map(({ label, to, icon: Icon }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition',
                isActive ? 'text-brand-600' : 'text-ink-muted hover:text-ink-strong',
              )
            }
            key={to}
            to={to}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition',
                    isActive ? 'bg-brand-50' : '',
                  )}
                >
                  <Icon size={20} />
                </span>
                <span className="leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
