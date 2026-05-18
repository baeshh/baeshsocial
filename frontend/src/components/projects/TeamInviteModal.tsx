import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { Select } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { cn } from '../../lib/cn'
import { getProjectTeamCandidates, inviteProjectMember } from '../../services/projectService'
import type { TeamCandidate, TeamCandidateRelation } from '../../types/project'
import type { ProjectRole } from '../../types/projectRole'

type TeamInviteTab = 'mutual' | 'following' | 'followers'

const tabLabels: Record<TeamInviteTab, string> = {
  mutual: '맞팔로우',
  following: '팔로잉',
  followers: '팔로워',
}

const relationLabels: Record<TeamCandidateRelation, string> = {
  mutual: '맞팔로우',
  following: '팔로잉',
  follower: '팔로워',
}

type TeamInviteModalProps = {
  open: boolean
  projectId: string
  projectTitle: string
  token: string
  roles: ProjectRole[]
  onClose: () => void
}

export function TeamInviteModal({
  open,
  projectId,
  projectTitle,
  token,
  roles,
  onClose,
}: TeamInviteModalProps) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<TeamInviteTab>('mutual')
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  const inviteRoles = useMemo(() => roles.filter((role) => role.slug !== 'owner'), [roles])
  const defaultRoleId = inviteRoles.find((role) => role.slug === 'editor')?.id ?? inviteRoles[0]?.id ?? ''
  const [roleId, setRoleId] = useState(defaultRoleId)

  useEffect(() => {
    if (open) {
      setRoleId(defaultRoleId)
    }
  }, [open, defaultRoleId])

  const candidatesQuery = useQuery({
    queryKey: ['projects', projectId, 'team-candidates'],
    queryFn: () => getProjectTeamCandidates(token, projectId),
    enabled: open && Boolean(token),
  })

  const inviteMutation = useMutation({
    mutationFn: (user: TeamCandidate) =>
      inviteProjectMember(token, projectId, {
        userId: user.id,
        roleId,
      }),
    onSuccess: (_data, user) => {
      setInvitedIds((prev) => new Set(prev).add(user.id))
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'team-candidates'] })
    },
  })

  const candidates = candidatesQuery.data
  const list =
    tab === 'mutual'
      ? candidates?.mutual ?? []
      : tab === 'following'
        ? candidates?.following ?? []
        : candidates?.followers ?? []

  return (
    <Modal
      description={`「${projectTitle}」에 초대할 사람을 선택하세요. 초대를 수락하면 선택한 역할 권한으로 팀에 합류합니다.`}
      onClose={onClose}
      open={open}
      title="팀 초대"
      wide
    >
      <div className="mb-4">
        <Select
          label="부여할 역할"
          onChange={(event) => setRoleId(event.target.value)}
          required
          value={roleId}
        >
          {inviteRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
              {role.description ? ` — ${role.description}` : ''}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-surface-border pb-4">
        {(Object.keys(tabLabels) as TeamInviteTab[]).map((key) => (
          <button
            className={cn(
              'rounded-full px-4 py-2 text-sm font-semibold transition',
              tab === key
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-surface-muted text-ink-muted hover:text-ink-strong',
            )}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            {tabLabels[key]}
            {candidates ? (
              <span className="ml-1 opacity-80">
                (
                {key === 'mutual'
                  ? candidates.mutual.length
                  : key === 'following'
                    ? candidates.following.length
                    : candidates.followers.length}
                )
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {candidatesQuery.isLoading ? <LoadingState /> : null}
      {candidatesQuery.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {candidatesQuery.error.message}
        </p>
      ) : null}

      {!candidatesQuery.isLoading && !candidatesQuery.error ? (
        <ul className="max-h-[min(20rem,50vh)] space-y-2 overflow-y-auto">
          {list.length === 0 ? (
            <li className="py-8 text-center text-sm text-ink-muted">
              {tab === 'mutual'
                ? '맞팔로우한 사람이 없습니다.'
                : tab === 'following'
                  ? '초대할 팔로잉이 없습니다.'
                  : '초대할 팔로워가 없습니다.'}
            </li>
          ) : (
            list.map((user) => {
              const sent = invitedIds.has(user.id)
              return (
                <li
                  className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5"
                  key={user.id}
                >
                  <Avatar name={user.name} size="sm" src={user.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-strong">{user.name}</p>
                    <p className="truncate text-xs text-ink-muted">{relationLabels[user.relation]}</p>
                  </div>
                  <Button
                    className="shrink-0 rounded-full text-xs"
                    disabled={sent || inviteMutation.isPending || !roleId}
                    onClick={() => inviteMutation.mutate(user)}
                    type="button"
                    variant={sent ? 'secondary' : 'primary'}
                  >
                    {sent ? '초대됨' : '초대'}
                  </Button>
                </li>
              )
            })
          )}
        </ul>
      ) : null}

      <div className="mt-5 flex justify-end border-t border-surface-border pt-4">
        <Button onClick={onClose} type="button" variant="secondary">
          닫기
        </Button>
      </div>
    </Modal>
  )
}
