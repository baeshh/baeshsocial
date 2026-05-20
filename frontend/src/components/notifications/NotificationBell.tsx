import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Heart, MessageCircle, UserPlus, UsersRound, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { cn } from '../../lib/cn'
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService'
import { acceptProjectInvite, declineProjectInvite } from '../../services/projectService'
import type { AppNotification, NotificationType } from '../../types/notification'
import { useAuthStore } from '../../stores/authStore'

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) {
    return '방금 전'
  }
  if (minutes < 60) {
    return `${minutes}분 전`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}시간 전`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}일 전`
  }
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function notificationIcon(type: NotificationType) {
  switch (type) {
    case 'POST_LIKE':
      return <Heart className="text-rose-500" size={16} />
    case 'POST_COMMENT':
    case 'COMMENT_REPLY':
      return <MessageCircle className="text-brand-600" size={16} />
    case 'FOLLOW':
      return <UserPlus className="text-emerald-600" size={16} />
    case 'PROJECT_INVITE':
      return <UsersRound className="text-violet-600" size={16} />
    default:
      return <Bell className="text-ink-muted" size={16} />
  }
}

function parseProjectInviteId(link: string | null) {
  if (!link) {
    return null
  }
  const match = link.match(/^\/project-invites\/([^/]+)$/)
  return match?.[1] ?? null
}

type NotificationPanelProps = {
  unreadCount: number
  notifications: AppNotification[]
  isLoading: boolean
  hasError: boolean
  markAllPending: boolean
  onMarkAll: () => void
  onClose: () => void
  onSelect: (notification: AppNotification) => void
  acceptInviteMutation: ReturnType<typeof useMutation<unknown, Error, { inviteId: string; notificationId: string }>>
  declineInviteMutation: ReturnType<typeof useMutation<unknown, Error, { inviteId: string; notificationId: string }>>
}

function NotificationPanel({
  unreadCount,
  notifications,
  isLoading,
  hasError,
  markAllPending,
  onMarkAll,
  onClose,
  onSelect,
  acceptInviteMutation,
  declineInviteMutation,
}: NotificationPanelProps) {
  const invitePending =
    acceptInviteMutation.isPending || declineInviteMutation.isPending

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3 md:px-4">
        <p className="text-sm font-bold text-ink-strong">알림</p>
        <div className="flex items-center gap-1">
          {unreadCount > 0 ? (
            <Button
              className="h-8 px-2 text-xs"
              disabled={markAllPending}
              onClick={onMarkAll}
              type="button"
              variant="ghost"
            >
              모두 읽음
            </Button>
          ) : null}
          <button
            aria-label="알림 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong md:hidden"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">불러오는 중…</p>
        ) : hasError ? (
          <p className="px-4 py-8 text-center text-sm text-red-600">알림을 불러오지 못했습니다.</p>
        ) : notifications.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-muted">새 알림이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {notifications.map((notification) => {
              const inviteId =
                notification.type === 'PROJECT_INVITE'
                  ? parseProjectInviteId(notification.link)
                  : null

              return (
                <li key={notification.id}>
                  <div
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left',
                      !notification.read && 'bg-brand-50/50',
                      notification.type !== 'PROJECT_INVITE' && 'cursor-pointer hover:bg-surface-muted/60',
                    )}
                    onClick={() => {
                      if (notification.type !== 'PROJECT_INVITE') {
                        void onSelect(notification)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && notification.type !== 'PROJECT_INVITE') {
                        void onSelect(notification)
                      }
                    }}
                    role={notification.type === 'PROJECT_INVITE' ? undefined : 'button'}
                    tabIndex={notification.type === 'PROJECT_INVITE' ? undefined : 0}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        name={notification.actor?.name ?? notification.title}
                        size="sm"
                        src={notification.actor?.avatarUrl}
                      />
                      <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow ring-1 ring-surface-border">
                        {notificationIcon(notification.type)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-strong">{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-body">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-ink-muted">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                      {inviteId ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            className="h-8 rounded-full px-3 text-xs"
                            disabled={invitePending}
                            onClick={(event) => {
                              event.stopPropagation()
                              acceptInviteMutation.mutate({ inviteId, notificationId: notification.id })
                            }}
                            type="button"
                          >
                            수락
                          </Button>
                          <Button
                            className="h-8 rounded-full px-3 text-xs"
                            disabled={invitePending}
                            onClick={(event) => {
                              event.stopPropagation()
                              declineInviteMutation.mutate({ inviteId, notificationId: notification.id })
                            }}
                            type="button"
                            variant="secondary"
                          >
                            거절
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {!notification.read ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-surface-border px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <Link
          className="block text-center text-xs font-semibold text-brand-600 hover:underline"
          onClick={onClose}
          to="/network"
        >
          Network에서 활동 보기
        </Link>
      </div>
    </>
  )
}

function NotificationOverlay({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <>
      <button
        aria-label="알림 닫기"
        className="fixed inset-0 z-[100] bg-ink-strong/40 backdrop-blur-[1px] md:bg-ink-strong/20"
        onClick={onClose}
        type="button"
      />
      <div
        ref={panelRef}
        aria-label="알림"
        className={cn(
          'fixed z-[101] flex flex-col overflow-hidden border border-surface-border bg-white shadow-xl',
          'inset-x-0 bottom-0 max-h-[min(88dvh,100%)] rounded-t-2xl',
          'md:inset-x-auto md:bottom-auto md:right-4 md:top-[3.5rem] md:w-[min(22rem,calc(100vw-2rem))] md:max-h-[min(28rem,calc(100dvh-5rem))] md:rounded-2xl',
          'lg:right-6 xl:right-8',
        )}
        role="dialog"
      >
        <div className="flex justify-center pt-2 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-surface-border" />
        </div>
        {children}
      </div>
    </>,
    document.body,
  )
}

export function NotificationBell() {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => getUnreadNotificationCount(token!),
    enabled: Boolean(token),
    refetchInterval: 30_000,
  })

  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => getNotifications(token!),
    enabled: Boolean(token) && open,
  })

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(token!, notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const acceptInviteMutation = useMutation({
    mutationFn: async ({ inviteId, notificationId }: { inviteId: string; notificationId: string }) => {
      const result = await acceptProjectInvite(token!, inviteId)
      await markNotificationRead(token!, notificationId)
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setOpen(false)
      navigate(`/projects/${result.projectId}`)
    },
  })

  const declineInviteMutation = useMutation({
    mutationFn: async ({ inviteId, notificationId }: { inviteId: string; notificationId: string }) => {
      await declineProjectInvite(token!, inviteId)
      await markNotificationRead(token!, notificationId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const handleSelect = async (notification: AppNotification) => {
    if (notification.type === 'PROJECT_INVITE') {
      return
    }

    if (!notification.read) {
      await markReadMutation.mutateAsync(notification.id)
    }
    setOpen(false)
    if (notification.link) {
      navigate(notification.link)
    }
  }

  const unreadCount = unreadQuery.data?.count ?? 0
  const notifications = listQuery.data?.notifications ?? []

  if (!token) {
    return null
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="알림"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell size={20} />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      <NotificationOverlay onClose={() => setOpen(false)} open={open}>
        <NotificationPanel
          acceptInviteMutation={acceptInviteMutation}
          declineInviteMutation={declineInviteMutation}
          hasError={Boolean(listQuery.error)}
          isLoading={listQuery.isLoading}
          markAllPending={markAllMutation.isPending}
          notifications={notifications}
          onClose={() => setOpen(false)}
          onMarkAll={() => markAllMutation.mutate()}
          onSelect={handleSelect}
          unreadCount={unreadCount}
        />
      </NotificationOverlay>
    </>
  )
}
