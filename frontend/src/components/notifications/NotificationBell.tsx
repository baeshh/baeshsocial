import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Heart, MessageCircle, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

export function NotificationBell() {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

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
    <div className="relative" ref={panelRef}>
      <button
        aria-expanded={open}
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

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-surface-border bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <p className="text-sm font-bold text-ink-strong">알림</p>
            {unreadCount > 0 ? (
              <Button
                className="h-8 px-2 text-xs"
                disabled={markAllMutation.isPending}
                onClick={() => markAllMutation.mutate()}
                type="button"
                variant="ghost"
              >
                모두 읽음
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {listQuery.isLoading ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">불러오는 중…</p>
            ) : listQuery.error ? (
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
                  const invitePending =
                    Boolean(inviteId) &&
                    (acceptInviteMutation.isPending || declineInviteMutation.isPending)

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
                            void handleSelect(notification)
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && notification.type !== 'PROJECT_INVITE') {
                            void handleSelect(notification)
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

          <div className="border-t border-surface-border px-4 py-2.5">
            <Link
              className="block text-center text-xs font-semibold text-brand-600 hover:underline"
              onClick={() => setOpen(false)}
              to="/network"
            >
              Network에서 활동 보기
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
