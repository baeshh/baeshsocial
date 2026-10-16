import { useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Menu, PanelLeftOpen } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../stores/authStore'
import { BaeshLogo } from '../common/BaeshLogo'
import { Drawer } from '../common/Drawer'
import { NotificationBell } from '../notifications/NotificationBell'
import { OrgSwitcher } from '../organizations/OrgSwitcher'
import { AccountMenu } from './AccountMenu'
import { AnnouncementBanner } from './AnnouncementBanner'

export type ManagementNavItem = {
  id: string
  label: string
  to: string
  icon: LucideIcon
  active: boolean
  /** Pending work count shown next to the label; null hides it. */
  count?: number | null
}

export type ManagementNavGroup = {
  id: string
  label: string
  items: ManagementNavItem[]
}

type ManagementAppShellProps = {
  workspace: { name: string; caption: string; icon: LucideIcon; homeTo: string }
  nav: ManagementNavGroup[]
  children: ReactNode
}

function NavList({ nav, compact, onNavigate }: { nav: ManagementNavGroup[]; compact: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="관리 메뉴" className={cn('flex flex-col gap-4', compact ? 'px-2 py-3' : 'px-3 py-4')}>
      {nav.map((group) => (
        <div key={group.id}>
          <p
            className={cn(
              'px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted',
              compact && 'hidden lg:block',
            )}
          >
            {group.label}
          </p>
          {compact ? <div aria-hidden className="mx-3 mb-2 border-t border-surface-border lg:hidden" /> : null}
          <ul className="space-y-0.5">
            {group.items.map(({ id, label, to, icon: Icon, active, count }) => (
              <li key={id}>
                <Link
                  aria-current={active ? 'page' : undefined}
                  aria-label={compact ? (count ? `${label} (${count})` : label) : undefined}
                  className={cn(
                    'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
                    compact && 'justify-center lg:justify-start',
                    active ? 'bg-brand-50 text-brand-700' : 'text-ink-body hover:bg-surface-muted hover:text-ink-strong',
                  )}
                  onClick={onNavigate}
                  title={compact ? label : undefined}
                  to={to}
                >
                  <Icon aria-hidden className={active ? 'text-brand-600' : 'text-ink-muted group-hover:text-ink-strong'} size={18} />
                  <span className={cn('min-w-0 flex-1 truncate', compact && 'hidden lg:block')}>{label}</span>
                  {count ? (
                    <span
                      className={cn(
                        'rounded-full bg-warning-50 px-2 text-xs font-bold leading-5 text-warning-700',
                        compact && 'absolute right-1 top-1 px-1.5 text-[10px] leading-4 lg:static lg:px-2 lg:text-xs lg:leading-5',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Organization / company workspace shell: left sidebar ≥1024px, icon rail 768–1023px,
 * header drawer below 768px. Never renders the personal top menu or bottom tabs.
 */
export function ManagementAppShell({ workspace, nav, children }: ManagementAppShellProps) {
  const { token, user } = useAuthStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const WorkspaceIcon = workspace.icon

  if (!token) {
    return <Navigate replace to="/auth/login" />
  }

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-body">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:px-4 lg:px-6">
          <button
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            aria-label="관리 메뉴"
            className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-surface-border px-2.5 text-sm font-semibold text-ink-strong transition hover:bg-surface-muted md:hidden"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <Menu aria-hidden size={18} />
            <span aria-hidden className="hidden sm:inline">관리 메뉴</span>
          </button>
          <BaeshLogo className="hidden sm:inline-flex" imageClassName="h-9 w-9 sm:h-10 sm:w-10" to={workspace.homeTo} />
          <Link className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-surface-muted" to={workspace.homeTo}>
            <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 sm:flex">
              <WorkspaceIcon aria-hidden size={17} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink-strong sm:text-[15px]">{workspace.name}</span>
              <span className="hidden truncate text-xs text-ink-muted sm:block">{workspace.caption}</span>
            </span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {user ? <OrgSwitcher /> : null}
            <NotificationBell />
            {user ? <AccountMenu user={user} /> : null}
          </div>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-rail shrink-0 flex-col overflow-y-auto border-r border-surface-border bg-white md:flex lg:w-sidebar">
          <NavList compact nav={nav} />
          <button
            aria-label="메뉴 펼치기"
            className="mx-auto mb-4 mt-auto flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong lg:hidden"
            onClick={() => setDrawerOpen(true)}
            title="메뉴 펼치기"
            type="button"
          >
            <PanelLeftOpen size={20} />
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pt-6 lg:px-8">
          <div className="mx-auto max-w-[1200px]">
            <AnnouncementBanner />
            {children}
          </div>
        </main>
      </div>

      <Drawer onClose={() => setDrawerOpen(false)} open={drawerOpen} title={workspace.name}>
        <NavList compact={false} nav={nav} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
    </div>
  )
}
