import { apiRequest } from '../lib/api'
import type { AuthUser } from '../types/auth'
import type { FollowListUser } from '../types/user'

export type UpdateUserPayload = {
  name?: string
  avatarUrl?: string | null
  coverUrl?: string | null
}

export function updateMe(token: string, payload: UpdateUserPayload) {
  return apiRequest<{ user: AuthUser }>('/users/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function followUser(token: string, userId: string) {
  return apiRequest<{ ok: boolean }>(`/users/${userId}/follow`, {
    method: 'POST',
    token,
  })
}

export function unfollowUser(token: string, userId: string) {
  return apiRequest<void>(`/users/${userId}/follow`, {
    method: 'DELETE',
    token,
  })
}

export function getFollowers(token: string, userId: string) {
  return apiRequest<{ users: FollowListUser[] }>(`/users/${userId}/followers`, { token })
}

export function getFollowing(token: string, userId: string) {
  return apiRequest<{ users: FollowListUser[] }>(`/users/${userId}/following`, { token })
}
