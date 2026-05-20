import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Search, X } from 'lucide-react'
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [search, setSearch] = useState('')

  const submitSearch = () => {
    const trimmed = search.trim()
    setDrawerOpen(false)
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
      <div className="mx-auto flex min-h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label="메뉴 열기"
            className="h-10 min-h-10 w-10 px-0 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            variant="ghost"
          >
            <Menu size={20} />
          </Button>
          <BaeshLogo to="/dashboard" />
        </div>

        <nav className="ml-2 hidden flex-1 items-center gap-1 overflow-x-auto lg:flex lg:gap-0.5">
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

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <NotificationBell />
          {user ? (
            <>
              <Button
                className="hidden gap-2 text-ink-body sm:inline-flex"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
                variant="ghost"
              >
                <LogOut size={18} />
                <span className="font-semibold">로그아웃</span>
              </Button>
              <Avatar className="hidden sm:inline-flex" name={user.name} src={user.avatarUrl} />
            </>
          ) : (
            <Button to="/auth/login" variant="secondary">
              로그인
            </Button>
          )}
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-ink-strong/40"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <aside className="relative h-full w-[min(100vw-3rem,20rem)] max-w-[86vw] border-r border-surface-border bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <BaeshLogo imageClassName="h-10 w-10" onClick={() => setDrawerOpen(false)} to="/dashboard" />
              <Button
                aria-label="닫기"
                className="h-10 min-h-10 w-10 px-0"
                onClick={() => setDrawerOpen(false)}
                variant="ghost"
              >
                <X size={18} />
              </Button>
            </div>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                submitSearch()
              }}
            >
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-ink-muted"
                  size={18}
                />
                <input
                  className="h-11 w-full rounded-full border border-surface-border bg-surface-muted pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-brand-600/20"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search skills, people..."
                  type="search"
                  value={search}
                />
              </div>
            </form>

            <nav className="mt-6 space-y-1">
              {generalNavItems.map(({ label, to, icon: Icon }) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted hover:text-ink-strong',
                    )
                  }
                  key={to}
                  onClick={() => setDrawerOpen(false)}
                  to={to}
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
              {user ? (
                <Button
                  className="mt-4 w-full justify-start gap-2"
                  disabled={logoutMutation.isPending}
                  onClick={() => {
                    setDrawerOpen(false)
                    logoutMutation.mutate()
                  }}
                  variant="secondary"
                >
                  <LogOut size={18} />
                  로그아웃
                </Button>
              ) : null}
            </nav>
          </aside>
        </div>
      ) : null}
    </header>
  )
}
