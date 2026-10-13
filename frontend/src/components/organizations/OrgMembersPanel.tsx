import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { MY_ORGANIZATIONS_QUERY_KEY } from '../../hooks/useMyOrganizations'
import { canManageMember, hasOrgRole, ORG_ROLE_LABEL } from '../../lib/organizations'
import {
  decideMemberRequest,
  getOrganizationMembers,
  leaveOrganization,
  removeMember,
  updateMemberRole,
} from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { useOrgContextStore } from '../../stores/orgContextStore'
import { showToast } from '../../stores/toastStore'
import type { Organization, OrganizationRole } from '../../types/organization'

type Props = {
  organization: Organization
  myRole: OrganizationRole
}

const ASSIGNABLE_ROLES: Array<Exclude<OrganizationRole, 'owner'>> = ['admin', 'manager', 'member']

export function OrgMembersPanel({ organization, myRole }: Props) {
  const token = useAuthStore((state) => state.token)
  const me = useAuthStore((state) => state.user)
  const setActiveOrg = useOrgContextStore((state) => state.setActiveOrg)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const approved = organization.verificationStatus === 'approved'
  const canDecide = approved && hasOrgRole(myRole, 'manager')
  const canManage = approved && hasOrgRole(myRole, 'admin')

  const membersQuery = useQuery({
    queryKey: ['organizations', organization.id, 'members'],
    queryFn: () => getOrganizationMembers(token!, organization.id),
    enabled: Boolean(token),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['organizations', organization.id] })
  }
  const onError = (error: Error) => showToast(error.message, 'error')

  const decision = useMutation({
    mutationFn: ({ memberId, value }: { memberId: string; value: 'approve' | 'reject' }) =>
      decideMemberRequest(token!, organization.id, memberId, value),
    onSuccess: (_data, { value }) => {
      showToast(value === 'approve' ? '가입을 승인했습니다.' : '가입 신청을 거절했습니다.', value === 'approve' ? 'success' : 'info')
      invalidate()
    },
    onError,
  })

  const roleChange = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Exclude<OrganizationRole, 'owner'> }) =>
      updateMemberRole(token!, organization.id, memberId, role),
    onSuccess: () => {
      showToast('역할을 변경했습니다.')
      invalidate()
    },
    onError,
  })

  const removal = useMutation({
    mutationFn: (memberId: string) => removeMember(token!, organization.id, memberId),
    onSuccess: () => {
      showToast('구성원을 내보냈습니다.', 'info')
      invalidate()
    },
    onError,
  })

  const leave = useMutation({
    mutationFn: () => leaveOrganization(token!, organization.id),
    onSuccess: () => {
      setActiveOrg(null)
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
      showToast('조직에서 나왔습니다.', 'info')
      navigate('/organizations')
    },
    onError,
  })

  if (membersQuery.isLoading) {
    return <LoadingState />
  }
  if (membersQuery.isError) {
    return <p className="text-sm text-red-700">{(membersQuery.error as Error).message}</p>
  }

  const { members, pendingRequests } = membersQuery.data!

  return (
    <div className="space-y-5">
      {canDecide ? (
        <Card>
          <CardHeader>
            <CardTitle>가입 신청 {pendingRequests.length}건</CardTitle>
            <CardDescription>담당자 이상이 승인하면 구성원(MEMBER)으로 합류합니다.</CardDescription>
          </CardHeader>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-ink-muted">대기 중인 신청이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {pendingRequests.map((request) => (
                <li className="flex flex-wrap items-center gap-3 py-3" key={request.id}>
                  <Avatar name={request.user?.name ?? '?'} size="sm" src={request.user?.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-strong">{request.user?.name}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {request.title ?? request.user?.email}
                      {request.message ? ` · ${request.message}` : ''}
                    </p>
                  </div>
                  <Button
                    className="min-h-9 px-4"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate({ memberId: request.id, value: 'approve' })}
                  >
                    승인
                  </Button>
                  <Button
                    className="min-h-9 px-4"
                    disabled={decision.isPending}
                    onClick={() => decision.mutate({ memberId: request.id, value: 'reject' })}
                    variant="danger"
                  >
                    거절
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>구성원 {members.length}명</CardTitle>
          <CardDescription>
            {canManage
              ? '관리자 이상은 자신보다 낮은 역할의 구성원에게 하위 역할을 부여하거나 내보낼 수 있습니다.'
              : approved
                ? '역할 변경은 조직 관리자 이상만 할 수 있습니다.'
                : '조직이 승인되면 구성원 초대·승인과 역할 관리가 활성화됩니다.'}
          </CardDescription>
        </CardHeader>
        <ul className="divide-y divide-surface-border">
          {members.map((member) => {
            const isMe = member.userId === me?.id
            const manageable = canManage && !isMe && canManageMember(myRole, member.role)
            return (
              <li className="flex flex-wrap items-center gap-3 py-3" key={member.id}>
                <Avatar name={member.user?.name ?? '?'} size="sm" src={member.user?.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-strong">
                    {member.user?.name}
                    {isMe ? <span className="ml-1 text-xs font-medium text-ink-muted">(나)</span> : null}
                  </p>
                  <p className="truncate text-xs text-ink-muted">{member.title ?? member.user?.email}</p>
                </div>
                {manageable ? (
                  <>
                    <select
                      aria-label={`${member.user?.name} 역할`}
                      className="h-9 rounded-full border border-surface-border bg-white px-3 text-sm font-semibold text-ink-strong"
                      disabled={roleChange.isPending}
                      onChange={(event) =>
                        roleChange.mutate({
                          memberId: member.id,
                          role: event.target.value as Exclude<OrganizationRole, 'owner'>,
                        })
                      }
                      value={member.role}
                    >
                      {ASSIGNABLE_ROLES.filter((role) => canManageMember(myRole, role)).map((role) => (
                        <option key={role} value={role}>
                          {ORG_ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="min-h-9 px-4"
                      disabled={removal.isPending}
                      onClick={() => {
                        if (window.confirm(`${member.user?.name}님을 조직에서 내보낼까요?`)) removal.mutate(member.id)
                      }}
                      variant="ghost"
                    >
                      내보내기
                    </Button>
                  </>
                ) : (
                  <Badge tone={member.role === 'owner' || member.role === 'admin' ? 'blue' : 'gray'}>
                    {ORG_ROLE_LABEL[member.role]}
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={leave.isPending}
            onClick={() => {
              if (window.confirm(`${organization.name}에서 나갈까요?`)) leave.mutate()
            }}
            variant="ghost"
          >
            조직 나가기
          </Button>
        </div>
      </Card>
    </div>
  )
}
