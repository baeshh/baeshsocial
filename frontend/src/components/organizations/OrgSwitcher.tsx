import { Check, ChevronDown, Gauge, LifeBuoy, Plus, Settings, ShieldCheck, UserRound, UserSearch } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMyOrganizations } from '../../hooks/useMyOrganizations'
import { cn } from '../../lib/cn'
import { ORG_ROLE_LABEL, ORG_TYPE_META } from '../../lib/organizations'
import { useAuthStore } from '../../stores/authStore'
import { useOrgContextStore } from '../../stores/orgContextStore'

export function OrgSwitcher() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const { activeOrgId, setActiveOrg } = useOrgContextStore()
  const { activeMemberships, pendingMemberships } = useMyOrganizations()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const routeOrgId = location.pathname.match(/^\/org\/([^/]+)/)?.[1] ?? null
  const currentOrgId = routeOrgId ?? activeOrgId
  const current = activeMemberships.find((membership) => membership.organization.id === currentOrgId) ?? null
  const CurrentIcon = current ? ORG_TYPE_META[current.organization.type].icon : UserRound

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  const selectPersonal = () => {
    setActiveOrg(null)
    go('/network')
  }

  const selectOrganization = (orgId: string) => {
    setActiveOrg(orgId)
    go(`/org/${orgId}`)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex h-10 max-w-[11rem] items-center gap-2 rounded-full border px-3 text-sm font-semibold transition sm:max-w-[14rem]',
          current
            ? 'border-brand-100 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'border-surface-border bg-white text-ink-strong hover:bg-surface-muted',
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <CurrentIcon className="shrink-0" size={16} />
        <span className="truncate lg:hidden xl:inline">{current ? current.organization.name : '개인'}</span>
        <ChevronDown className={cn('shrink-0 transition', open && 'rotate-180')} size={14} />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-surface-border bg-white py-2 shadow-card"
          role="menu"
        >
          <p className="px-4 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">작업 공간 전환</p>
          <button
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
            onClick={selectPersonal}
            role="menuitem"
            type="button"
          >
            <UserRound className="text-ink-muted" size={18} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-ink-strong">{user?.name ?? '개인 계정'}</span>
              <span className="block text-xs text-ink-muted">개인</span>
            </span>
            {!current ? <Check className="text-brand-600" size={16} /> : null}
          </button>

          {activeMemberships.map((membership) => {
            const meta = ORG_TYPE_META[membership.organization.type]
            const Icon = meta.icon
            const selected = current?.organization.id === membership.organization.id
            return (
              <button
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-muted"
                key={membership.id}
                onClick={() => selectOrganization(membership.organization.id)}
                role="menuitem"
                type="button"
              >
                <Icon className="text-ink-muted" size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink-strong">{membership.organization.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {meta.label} · {ORG_ROLE_LABEL[membership.role]}
                    {membership.organization.verificationStatus !== 'approved' ? ' · 인증 전' : ''}
                  </span>
                </span>
                {selected ? <Check className="text-brand-600" size={16} /> : null}
              </button>
            )
          })}

          {pendingMemberships.length > 0 ? (
            <p className="px-4 py-2 text-xs text-ink-muted">가입 승인 대기 {pendingMemberships.length}건</p>
          ) : null}

          <div className="my-1 border-t border-surface-border" />
          <button
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
            onClick={() => go('/organizations')}
            role="menuitem"
            type="button"
          >
            <Plus size={18} />
            조직 등록 · 가입
          </button>
          {user?.role === 'admin' ? (
            <>
              <button
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted"
                onClick={() => go('/admin/ops')}
                role="menuitem"
                type="button"
              >
                <Gauge size={18} />
                운영자 콘솔
              </button>
              <button
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted"
                onClick={() => go('/admin/organizations')}
                role="menuitem"
                type="button"
              >
                <ShieldCheck size={18} />
                조직 인증 심사
              </button>
            </>
          ) : null}
          {activeMemberships.some((m) => m.organization.type === 'company' && m.organization.verificationStatus === 'approved') ? (
            <button
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted"
              onClick={() => go('/talent-db')}
              role="menuitem"
              type="button"
            >
              <UserSearch size={18} />
              인재 검색
            </button>
          ) : null}
          <div className="my-1 border-t border-surface-border" />
          <button
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted"
            onClick={() => go('/support')}
            role="menuitem"
            type="button"
          >
            <LifeBuoy size={18} />
            고객 지원
          </button>
          <button
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted"
            onClick={() => go('/settings')}
            role="menuitem"
            type="button"
          >
            <Settings size={18} />
            계정·보안 설정
          </button>
        </div>
      ) : null}
    </div>
  )
}
