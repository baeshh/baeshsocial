import { apiRequest } from '../lib/api'
import type { AppNotification } from '../types/notification'

export function getNotifications(token: string) {
  return apiRequest<{ notifications: AppNotification[] }>('/notifications', { token })
}

export function getUnreadNotificationCount(token: string) {
  return apiRequest<{ count: number }>('/notifications/unread-count', { token })
}

export function markNotificationRead(token: string, notificationId: string) {
  return apiRequest<{ notification: AppNotification }>(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
    token,
  })
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ ok: boolean }>('/notifications/read-all', {
    method: 'PATCH',
    token,
  })
}
