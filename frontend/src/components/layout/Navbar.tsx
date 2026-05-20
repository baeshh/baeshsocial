import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Search } from 'lucide-react'
import { NotificationBell } from '../notifications/NotificationBell'
import { Avatar } from '../common/Avatar'
import { BaeshLogo } from '../common/BaeshLogo'
import { Button } from '../common/Button'
import { cn } from '../../lib/cn'
import type { AuthUser } from '../../types/auth'
import { logout as logoutRequest } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'
import { generalNavItems } from './navigation'

type NavbarProps = {
  user: AuthUser | null
}

export function Navbar({ user }: NavbarProps) {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [search, setSearch] = useState('')

  const submitSearch = () => {
    const trimmed = search.trim()
    if (trimmed) {
      navigate(`/find?q=${encodeURIComponent(trimmed)}`)
    } else {
      navigate('/find')
    }
  }

  const logoutMutation = useMutation({
    mutationFn: () => logoutRequest(token),
    onSettled: clearSession,
  })

  return (
    <header className="sticky top-0 z-40 border-b border-surface-border bg-white">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:h-16 sm:px-6 lg:gap-4 lg:px-8">
        <BaeshLogo className="-ml-0.5 md:ml-0" imageClassName="h-9 w-9 sm:h-10 sm:w-10" to="/network" />

        <nav className="ml-1 hidden flex-1 items-center gap-1 overflow-x-auto lg:flex lg:gap-0.5">
          {generalNavItems.map(({ label, to }) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'relative shrink-0 px-3 py-4 text-sm font-semibold transition',
                  isActive ? 'text-brand-600' : 'text-ink-muted hover:text-ink-strong',
                )
              }
              key={to}
              to={to}
            >
              {({ isActive }) => (
                <>
                  {label}
                  {isActive ? (
                    <span className="absolute inset-x-2 bottom-1 block h-0.5 rounded-full bg-brand-600" />
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <form
          className="mx-auto hidden w-full max-w-md lg:block lg:mx-0 lg:max-w-xs xl:max-w-md"
          onSubmit={(event) => {
            event.preventDefault()
            submitSearch()
          }}
        >
          <label className="sr-only" htmlFor="global-search">
            검색
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-ink-muted"
              size={18}
            />
            <input
              className="h-10 w-full rounded-full border border-surface-border bg-surface-muted pl-10 pr-4 text-sm text-ink-strong outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:bg-white focus:ring-2"
              id="global-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search skills, people..."
              type="search"
              value={search}
            />
          </div>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
          <NotificationBell />
          {user ? (
            <>
              <Button
                className="hidden gap-2 text-ink-body lg:inline-flex"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
                variant="ghost"
              >
                <LogOut size={18} />
                <span className="font-semibold">로그아웃</span>
              </Button>
              <Link
                aria-label="내 프로필"
                className="inline-flex shrink-0 rounded-full ring-2 ring-transparent transition hover:ring-brand-100 focus-visible:outline-none focus-visible:ring-brand-200"
                to="/profile"
              >
                <Avatar name={user.name} size="sm" src={user.avatarUrl} />
              </Link>
            </>
          ) : (
            <Button className="text-sm" to="/auth/login" variant="secondary">
              로그인
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
