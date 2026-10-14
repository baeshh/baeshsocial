import { useMutation } from '@tanstack/react-query'
import { LifeBuoy, LogOut, Settings, UserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout as logoutRequest } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'
import type { AuthUser } from '../../types/auth'
import { Avatar } from '../common/Avatar'

export function AccountMenu({ user }: { user: AuthUser }) {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const clearSession = useAuthStore((state) => state.clearSession)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const logoutMutation = useMutation({
    mutationFn: () => logoutRequest(token),
    onSettled: clearSession,
  })

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
      }
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

  const itemClass =
    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-body hover:bg-surface-muted focus-visible:bg-surface-muted'

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="계정 메뉴"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-brand-100"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Avatar name={user.name} size="sm" src={user.avatarUrl} />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-surface-border bg-white py-2 shadow-overlay"
          id={menuId}
          role="menu"
        >
          <div className="border-b border-surface-border px-4 pb-3 pt-1">
            <p className="truncate text-sm font-bold text-ink-strong">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <div className="py-1">
            <button className={itemClass} onClick={() => go('/profile')} role="menuitem" type="button">
              <UserRound size={18} />내 프로필
            </button>
            <button className={itemClass} onClick={() => go('/settings')} role="menuitem" type="button">
              <Settings size={18} />
              계정·보안 설정
            </button>
            <button className={itemClass} onClick={() => go('/support')} role="menuitem" type="button">
              <LifeBuoy size={18} />
              고객 지원
            </button>
          </div>
          <div className="border-t border-surface-border pt-1">
            <button
              className={itemClass}
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              role="menuitem"
              type="button"
            >
              <LogOut size={18} />
              로그아웃
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
