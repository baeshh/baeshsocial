import type { AuthUser } from './auth'

export type FollowListUser = Pick<AuthUser, 'id' | 'name' | 'avatarUrl' | 'email' | 'role'> & {
  isFollowing: boolean
}
