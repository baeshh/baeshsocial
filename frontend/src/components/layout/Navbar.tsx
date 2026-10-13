import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { dispatchNetworkScrollTop } from '../../lib/feedScroll'
import { NotificationBell } from '../notifications/NotificationBell'
import { OrgSwitcher } from '../organizations/OrgSwitcher'
import { BaeshLogo } from '../common/BaeshLogo'
import { Button } from '../common/Button'
import { cn } from '../../lib/cn'
import type { AuthUser } from '../../types/auth'
import { useAuthStore } from '../../stores/authStore'
import { AccountMenu } from './AccountMenu'
import { PERSONAL_HOME, personalNavItems } from './navigation'

type NavbarProps = {
  user: AuthUser | null
}

/** Personal workspace header: 5 top menus from 768px; below that the bottom tabs take over. */
export function Navbar({ user }: NavbarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const [search, setSearch] = useState('')

  const submitSearch = () => {
    const trimmed = search.trim()
    navigate(trimmed ? `/find?q=${encodeURIComponent(trimmed)}` : '/find')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:h-16 sm:px-6 lg:gap-4 lg:px-8">
        <BaeshLogo imageClassName="h-9 w-9 sm:h-10 sm:w-10" to={PERSONAL_HOME} />

        <nav aria-label="주요 메뉴" className="ml-2 hidden items-center gap-0.5 md:flex">
          {personalNavItems.map(({ label, to }) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'relative shrink-0 rounded-lg px-3 py-2 text-[15px] font-semibold transition lg:px-3.5',
                  isActive ? 'text-brand-600' : 'text-ink-muted hover:bg-surface-muted hover:text-ink-strong',
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
                  {label}
                  {isActive ? (
                    <span aria-hidden className="absolute inset-x-3 -bottom-[9px] block h-0.5 rounded-full bg-brand-600 sm:-bottom-[13px]" />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <form
          className="ml-auto hidden w-full max-w-[14rem] lg:block xl:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault()
            submitSearch()
          }}
          role="search"
        >
          <label className="sr-only" htmlFor="global-search">
            사람·스킬 검색
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" size={18} />
            <input
              className="h-10 w-full rounded-xl border border-surface-border bg-surface-muted pl-10 pr-3 text-sm text-ink-strong outline-none transition placeholder:text-ink-muted focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-600/20"
              id="global-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="사람·스킬 검색"
              type="search"
              value={search}
            />
          </div>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2 lg:ml-0">
          <NavLink
            aria-label="검색"
            className={({ isActive }) =>
              cn(
                'inline-flex h-10 w-10 items-center justify-center rounded-full transition lg:hidden',
                isActive ? 'bg-brand-50 text-brand-600' : 'text-ink-body hover:bg-surface-muted',
              )
            }
            to="/find"
          >
            <Search size={20} />
          </NavLink>
          {user ? <OrgSwitcher /> : null}
          <NotificationBell />
          {user ? (
            <AccountMenu user={user} />
          ) : token ? (
            <span aria-hidden className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
          ) : (
            <Button size="sm" to="/auth/login" variant="secondary">
              로그인
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
