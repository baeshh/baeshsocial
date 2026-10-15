import { useMutation } from '@tanstack/react-query'
import { LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { permissionSummary } from '../../../lib/projectDisplay'
import { assignMemberRole, setMemberPrivateAccess } from '../../../services/projectService'
import { useAuthStore } from '../../../stores/authStore'
import { showToast } from '../../../stores/toastStore'
import type { ProjectPermission } from '../../../types/projectRole'
import { Avatar } from '../../common/Avatar'
import { Badge } from '../../common/Badge'
import { Button } from '../../common/Button'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const isLeaderSlug = (slug: string | null | undefined) => slug === 'owner' || slug === 'admin'

const compactSelect =
  'h-9 rounded-lg border border-surface-border bg-white px-2 text-sm font-semibold text-ink-strong outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:opacity-60'

export function ProjectMembersTab({ ctx, onInvite, onLeave }: { ctx: ProjectDetailContext; onInvite: () => void; onLeave: () => void }) {
  const { project, token, can, isLeader, isMember, pendingInvites, invalidate } = ctx
  const currentUserId = useAuthStore((state) => state.user?.id)
  const roles = project.roles ?? []
  const assignableRoles = roles.filter((role) => role.slug !== 'owner')
  const isPrivate = project.visibility === 'PRIVATE'

  const assignRole = useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) => assignMemberRole(token, project.id, memberId, roleId),
    onSuccess: () => {
      showToast('역할을 변경했습니다.', 'success')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const privateAccess = useMutation({
    mutationFn: ({ memberId, allowed }: { memberId: string; allowed: boolean }) => setMemberPrivateAccess(token, project.id, memberId, allowed),
    onSuccess: invalidate,
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const teamNote = project.program
    ? project.program.allowStudentTeams
      ? '기관 프로그램 프로젝트입니다. 팀장은 이 프로그램 참여자만 초대할 수 있고, 그 밖의 팀 구성은 프로그램 담당자가 관리합니다.'
      : '기관 프로그램 프로젝트의 팀 구성은 프로그램 담당자가 관리합니다.'
    : '팔로잉·팔로워 중에서 초대하고, 초대받은 사람이 수락하면 팀원이 됩니다.'

  return (
    <div className="space-y-4">
      <ProjectSection
        actions={
          can('members.invite') ? (
            <Button onClick={onInvite} size="sm" type="button">
              <UserPlus aria-hidden size={15} />
              팀원 초대
            </Button>
          ) : null
        }
        description={
          <>
            {teamNote}
            {isPrivate && isLeader ? ' 비공개 상태에서는 “비공개 열람”을 허용한 팀원만 내용을 볼 수 있습니다.' : ''}
          </>
        }
        title={`팀원 ${project.members.length}명`}
      >
        <ul aria-label="팀원 목록" className="divide-y divide-surface-border rounded-xl border border-surface-border">
          {project.members.map((member) => {
            const isProjectOwner = member.userId === project.ownerId
            const leader = isLeaderSlug(member.projectRole?.slug)
            const permissions = (member.projectRole?.permissions ?? []) as ProjectPermission[]
            const roleName = member.projectRole?.name ?? member.role
            return (
              <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between" key={member.id}>
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={member.user.name} src={member.user.avatarUrl} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-strong">
                      {member.user.name}
                      {member.userId === currentUserId ? <span className="text-xs font-semibold text-ink-muted">(나)</span> : null}
                      {isProjectOwner && !project.program ? <Badge tone="purple">소유자</Badge> : leader ? <Badge tone="purple">팀장</Badge> : null}
                      {isPrivate && !leader && member.privateAccess ? <Badge tone="gray">비공개 열람</Badge> : null}
                    </p>
                    {member.user.email ? <p className="truncate text-xs text-ink-muted">{member.user.email}</p> : null}
                    {member.projectRole ? <p className="mt-0.5 text-xs text-ink-body">할 수 있는 일: {permissionSummary(permissions).join(' · ')}</p> : null}
                    {isLeader && isPrivate && !isProjectOwner && !leader ? (
                      <label className="mt-1.5 inline-flex min-h-8 items-center gap-2 text-xs font-medium text-ink-body">
                        <input
                          checked={Boolean(member.privateAccess)}
                          className="h-4 w-4"
                          disabled={privateAccess.isPending}
                          onChange={(event) => privateAccess.mutate({ memberId: member.id, allowed: event.target.checked })}
                          type="checkbox"
                        />
                        {member.user.name} 비공개 열람 허용
                      </label>
                    ) : null}
                  </div>
                </div>
                {can('members.assign_role') && !isProjectOwner && assignableRoles.length > 0 ? (
                  <select
                    aria-label={`${member.user.name} 역할`}
                    className={`${compactSelect} shrink-0 self-start sm:self-center`}
                    disabled={assignRole.isPending}
                    onChange={(event) => assignRole.mutate({ memberId: member.id, roleId: event.target.value })}
                    value={member.roleId ?? ''}
                  >
                    {member.roleId ? null : <option value="">역할 선택</option>}
                    {assignableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge className="shrink-0 self-start sm:self-center" tone="blue">
                    {roleName}
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>

        {can('members.invite') && pendingInvites.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-ink-muted">응답 대기 중인 초대 {pendingInvites.length}건</h3>
            <ul className="mt-2 space-y-1.5">
              {pendingInvites.map((invite) => (
                <li className="flex items-center gap-2 rounded-xl bg-warning-50/60 px-3 py-2 text-sm" key={invite.id}>
                  <Avatar name={invite.invitee.name} size="sm" src={invite.invitee.avatarUrl} />
                  <span className="font-semibold text-ink-strong">{invite.invitee.name}</span>
                  <span className="text-xs text-ink-muted">{invite.role} · 응답 대기</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ProjectSection>

      {project.program ? (
        <ProjectSection title="기관 담당자">
          <p className="flex gap-2 text-sm leading-6 text-ink-body">
            <ShieldCheck aria-hidden className="mt-1 shrink-0 text-success-700" size={16} />
            {project.program.organization.name}의 프로그램 담당자는 팀원 목록과 별개로 이 프로젝트를 열람하고, 팀이 제출한 활동 증빙을 검토해 승인하거나 반려합니다.
          </p>
        </ProjectSection>
      ) : null}

      {roles.length > 0 ? (
        <ProjectSection description="역할마다 프로젝트에서 할 수 있는 일이 다릅니다. 역할 구성은 설정에서 관리합니다." title="역할별 권한">
          <ul className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => (
              <li className="rounded-xl bg-surface-muted/60 p-3" key={role.id}>
                <p className="text-sm font-bold text-ink-strong">{role.name}</p>
                <p className="mt-0.5 text-xs text-ink-body">{permissionSummary(role.permissions as ProjectPermission[]).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </ProjectSection>
      ) : null}

      {isMember ? (
        <ProjectSection description="팀에서 제외되며, 다시 참여하려면 새로 초대받아야 합니다." title="프로젝트 나가기">
          <Button onClick={onLeave} type="button" variant="secondary">
            <LogOut aria-hidden size={16} />
            프로젝트 나가기
          </Button>
        </ProjectSection>
      ) : null}
    </div>
  )
}
