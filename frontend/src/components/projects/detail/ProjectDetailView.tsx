import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListPlus, NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../../lib/api'
import { hasProjectPermission, isGuestProjectViewer } from '../../../lib/projectPermissions'
import { deleteProject, getProject, leaveProject } from '../../../services/projectService'
import { useAuthStore } from '../../../stores/authStore'
import type { ProjectPermission } from '../../../types/projectRole'
import { EmptyState } from '../../common/EmptyState'
import { ErrorState } from '../../common/ErrorState'
import { LoadingState } from '../../common/LoadingState'
import { ProjectInstitutionPanel } from '../ProjectInstitutionPanel'
import { ProjectDeleteModal } from '../ProjectDeleteModal'
import { ProjectLeaveModal } from '../ProjectLeaveModal'
import { TeamInviteModal } from '../TeamInviteModal'
import { ProjectActivityTab } from './ProjectActivityTab'
import type { ProjectDetailContext, ProjectTabId } from './projectDetailContext'
import { ProjectDetailHeader } from './ProjectDetailHeader'
import { ProjectEvidenceTab } from './ProjectEvidenceTab'
import { ProjectFilesTab } from './ProjectFilesTab'
import { ProjectMembersTab } from './ProjectMembersTab'
import { ProjectOverviewTab } from './ProjectOverviewTab'
import { ProjectSettingsTab } from './ProjectSettingsTab'
import { ProjectSummaryAside } from './ProjectSummaryAside'
import { ProjectTabNav, type ProjectTab } from './ProjectTabNav'
import { ProjectTasksTab } from './ProjectTasksTab'

export function ProjectDetailView({ token, projectId }: { token: string; projectId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [compose, setCompose] = useState<{ kind: 'task' | 'activity'; request: number } | null>(null)

  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(token, projectId),
    enabled: Boolean(token),
  })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }
  const remove = useMutation({
    mutationFn: (password: string) => deleteProject(token, projectId, password),
    onSuccess: () => {
      setDeleteOpen(false)
      setDeleteError(null)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
    onError: (error: Error) => setDeleteError(error.message),
  })
  const leave = useMutation({
    mutationFn: () => leaveProject(token, projectId),
    onSuccess: () => {
      setLeaveOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
  })

  if (projectQuery.isPending) return <LoadingState />
  const data = projectQuery.data
  if (!data) {
    const notFound = projectQuery.error instanceof ApiError && [403, 404].includes(projectQuery.error.status)
    return notFound || !projectQuery.error ? (
      <EmptyState description="접근 권한이 없거나 존재하지 않는 프로젝트입니다." title="프로젝트를 찾을 수 없습니다" />
    ) : (
      <ErrorState error={projectQuery.error} onRetry={() => void projectQuery.refetch()} />
    )
  }

  const { project } = data
  const myPermissions = data.myPermissions ?? []
  const can = (permission: ProjectPermission) => hasProjectPermission(myPermissions, permission)
  const isOwner = data.isOwner ?? false
  const ctx: ProjectDetailContext = {
    token,
    project,
    can,
    isOwner,
    isLeader: data.isLeader ?? isOwner,
    guestViewer: data.isGuestViewer ?? isGuestProjectViewer(myPermissions, isOwner),
    isProgramStaff: data.isProgramStaff ?? false,
    restricted: data.restricted ?? false,
    isMember: Boolean(currentUserId && project.members.some((member) => member.userId === currentUserId && member.userId !== project.ownerId)),
    registration: data.registration ?? null,
    pendingInvites: data.pendingInvites ?? [],
    invalidate,
  }

  const tabs: ProjectTab[] = [
    { id: 'overview', label: '개요' },
    ...(can('tasks.view') ? [{ id: 'tasks' as const, label: '작업', count: project.tasks.length }] : []),
    { id: 'members', label: '팀원', count: project.members.length },
    ...(!ctx.guestViewer ? [{ id: 'activity' as const, label: '활동' }] : []),
    ...(can('files.view') ? [{ id: 'files' as const, label: '파일', count: project.files.length }] : []),
    ...(!ctx.guestViewer ? [{ id: 'evidence' as const, label: '증빙' }] : []),
    ...(project.program && !ctx.guestViewer ? [{ id: 'reviews' as const, label: '기관 검증' }] : []),
    ...(can('project.edit') || can('project.settings') || can('roles.manage') || can('project.delete') ? [{ id: 'settings' as const, label: '설정' }] : []),
  ]
  const requested = searchParams.get('tab')
  const activeTab: ProjectTabId = tabs.find((tab) => tab.id === requested)?.id ?? 'overview'
  const selectTab = (id: ProjectTabId) => {
    const next = new URLSearchParams(window.location.search)
    if (id === 'overview') next.delete('tab')
    else next.set('tab', id)
    setCompose(null)
    setSearchParams(next)
  }
  const openCompose = (kind: 'task' | 'activity') => {
    const next = new URLSearchParams(window.location.search)
    next.set('tab', kind === 'task' ? 'tasks' : 'activity')
    setSearchParams(next)
    setCompose((prev) => ({ kind, request: (prev?.request ?? 0) + 1 }))
  }
  const quickActions = [
    ...(can('tasks.create') && !ctx.restricted ? [{ kind: 'task' as const, label: '작업 추가', icon: <ListPlus aria-hidden size={18} /> }] : []),
    ...(can('activities.create') && !ctx.restricted ? [{ kind: 'activity' as const, label: '활동 기록', icon: <NotebookPen aria-hidden size={18} /> }] : []),
  ]

  return (
    <div className={`space-y-4 ${quickActions.length > 0 ? 'pb-20 lg:pb-0' : ''}`}>
      <ProjectDetailHeader ctx={ctx} />
      <ProjectTabNav active={activeTab} onSelect={selectTab} tabs={tabs} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-6">
        <div className="min-w-0">
          {activeTab === 'overview' ? <ProjectOverviewTab ctx={ctx} onSelectTab={selectTab} /> : null}
          {activeTab === 'tasks' ? <ProjectTasksTab composeRequest={compose?.kind === 'task' ? compose.request : 0} ctx={ctx} /> : null}
          {activeTab === 'members' ? <ProjectMembersTab ctx={ctx} onInvite={() => setInviteOpen(true)} onLeave={() => setLeaveOpen(true)} /> : null}
          {activeTab === 'activity' ? <ProjectActivityTab composeRequest={compose?.kind === 'activity' ? compose.request : 0} ctx={ctx} /> : null}
          {activeTab === 'files' ? <ProjectFilesTab ctx={ctx} /> : null}
          {activeTab === 'evidence' ? <ProjectEvidenceTab ctx={ctx} /> : null}
          {activeTab === 'reviews' && project.program ? (
            <ProjectInstitutionPanel
              organizationName={project.program.organization.name}
              programId={project.program.id}
              programTitle={project.program.title}
              projectId={project.id}
            />
          ) : null}
          {activeTab === 'settings' ? <ProjectSettingsTab ctx={ctx} onDelete={() => setDeleteOpen(true)} /> : null}
        </div>
        <ProjectSummaryAside ctx={ctx} onInvite={() => setInviteOpen(true)} onSelectTab={selectTab} />
      </div>

      {quickActions.length > 0 ? (
        <div
          aria-label="빠른 작업"
          className="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-20 border-t border-surface-border bg-white/95 px-4 py-2 backdrop-blur md:bottom-0 lg:hidden"
          role="group"
        >
          <div className="mx-auto flex max-w-xl gap-2">
            {quickActions.map((action) => (
              <button
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 focus-visible:ring-offset-2"
                key={action.kind}
                onClick={() => openCompose(action.kind)}
                type="button"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ProjectDeleteModal
        error={deleteError}
        isPending={remove.isPending}
        onClose={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        onConfirm={(password) => remove.mutate(password)}
        open={deleteOpen}
        projectTitle={project.title}
      />
      <ProjectLeaveModal isPending={leave.isPending} onClose={() => setLeaveOpen(false)} onConfirm={() => leave.mutate()} open={leaveOpen} projectTitle={project.title} />
      {can('members.invite') ? (
        <TeamInviteModal
          onClose={() => setInviteOpen(false)}
          open={inviteOpen}
          programTitle={project.program?.title ?? null}
          projectId={projectId}
          projectTitle={project.title}
          roles={project.roles ?? []}
          token={token}
        />
      ) : null}
    </div>
  )
}
