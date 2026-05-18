import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { getFollowers, getFollowing, followUser, unfollowUser } from '../../services/userService'
import { useAuthStore } from '../../stores/authStore'
import type { FollowListUser } from '../../types/user'

type FollowListKind = 'followers' | 'following'

type ProfileFollowListModalProps = {
  open: boolean
  kind: FollowListKind
  profileUserId: string
  profileUserName: string
  token: string
  onClose: () => void
  onFollowChanged?: () => void
}

export function ProfileFollowListModal({
  open,
  kind,
  profileUserId,
  profileUserName,
  token,
  onClose,
  onFollowChanged,
}: ProfileFollowListModalProps) {
  const sessionUserId = useAuthStore((state) => state.user?.id)
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['users', profileUserId, kind],
    queryFn: () =>
      kind === 'followers'
        ? getFollowers(token, profileUserId)
        : getFollowing(token, profileUserId),
    enabled: open && Boolean(token && profileUserId),
  })

  const followMutation = useMutation({
    mutationFn: async (user: FollowListUser) => {
      if (user.isFollowing) {
        await unfollowUser(token, user.id)
        return
      }
      await followUser(token, user.id)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', profileUserId] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      onFollowChanged?.()
    },
  })

  const title = kind === 'followers' ? '팔로워' : '팔로잉'
  const description =
    kind === 'followers'
      ? `${profileUserName}님을 팔로우하는 사람`
      : `${profileUserName}님이 팔로우하는 사람`

  return (
    <Modal description={description} onClose={onClose} open={open} title={title}>
      {listQuery.isLoading ? <LoadingState /> : null}
      {listQuery.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {listQuery.error.message}
        </p>
      ) : null}

      {!listQuery.isLoading && !listQuery.error ? (
        <FollowUserList
          emptyMessage={kind === 'followers' ? '아직 팔로워가 없습니다.' : '아직 팔로잉이 없습니다.'}
          onClose={onClose}
          onToggleFollow={(user) => followMutation.mutate(user)}
          pendingUserId={followMutation.isPending ? followMutation.variables?.id : undefined}
          sessionUserId={sessionUserId}
          users={listQuery.data?.users ?? []}
        />
      ) : null}
    </Modal>
  )
}

function FollowUserList({
  users,
  emptyMessage,
  sessionUserId,
  onClose,
  onToggleFollow,
  pendingUserId,
}: {
  users: FollowListUser[]
  emptyMessage: string
  sessionUserId?: string
  onClose: () => void
  onToggleFollow: (user: FollowListUser) => void
  pendingUserId?: string
}) {
  if (users.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">{emptyMessage}</p>
  }

  return (
    <ul className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto pr-1">
      {users.map((user) => {
        const isSelf = user.id === sessionUserId
        return (
          <li
            className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface-muted/30 p-3"
            key={user.id}
          >
            <Link className="shrink-0" onClick={onClose} to={`/profile/${user.id}`}>
              <Avatar name={user.name} size="md" src={user.avatarUrl} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                className="block truncate font-semibold text-ink-strong hover:text-brand-600"
                onClick={onClose}
                to={`/profile/${user.id}`}
              >
                {user.name}
              </Link>
            </div>
            {isSelf ? null : (
              <Button
                className="shrink-0 rounded-full text-xs"
                disabled={pendingUserId === user.id}
                onClick={() => onToggleFollow(user)}
                type="button"
                variant={user.isFollowing ? 'secondary' : 'primary'}
              >
                {pendingUserId === user.id
                  ? '처리 중…'
                  : user.isFollowing
                    ? '팔로잉'
                    : '팔로우'}
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
