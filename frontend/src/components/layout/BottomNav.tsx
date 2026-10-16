import { NavLink, useLocation } from 'react-router-dom'
import { dispatchNetworkScrollTop } from '../../lib/feedScroll'
import { cn } from '../../lib/cn'
import { personalNavItems } from './navigation'

/** Personal workspace only, below 768px. Management shells never render it. */
export function BottomNav() {
  const location = useLocation()

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-border bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
        {personalNavItems.map(({ label, to, icon: Icon }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition',
                isActive ? 'text-brand-600' : 'text-ink-muted hover:text-ink-strong',
              )
            }
            key={to}
            onClick={(event) => {
              if (to === '/network' && location.pathname === '/network') {
                event.preventDefault()
                dispatchNetworkScrollTop()
              }
            }}
            to={to}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn('flex h-8 w-12 items-center justify-center rounded-full transition', isActive ? 'bg-brand-50' : '')}
                >
                  <Icon aria-hidden size={20} />
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
