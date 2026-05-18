import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  ListChecks,
  Plus,
  Rocket,
  LogOut,
  Settings,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { Avatar } from '../../components/common/Avatar'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Input, Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { ProjectDeleteModal } from '../../components/projects/ProjectDeleteModal'
import { ProjectLeaveModal } from '../../components/projects/ProjectLeaveModal'
import { ProjectRolesPanel } from '../../components/projects/ProjectRolesPanel'
import { TeamInviteModal } from '../../components/projects/TeamInviteModal'
import { hasProjectPermission, isGuestProjectViewer } from '../../lib/projectPermissions'
import type { ProjectPermission } from '../../types/projectRole'
import { cn } from '../../lib/cn'
import {
  addProjectActivity,
  addProjectFile,
  addProjectTask,
  assignMemberRole,
  createProject,
  deleteProject,
  getProject,
  getProjects,
  leaveProject,
  updateProject,
  updateProjectTask,
} from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'
import type { Project, ProjectTask } from '../../types/project'

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toFormDate(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

function projectHealth(project: Project) {
  const completedTasks = project.tasks.filter((task) => task.status === 'DONE').length
  const taskScore = project.tasks.length > 0 ? Math.round((completedTasks / project.tasks.length) * 100) : 0
  const activityScore = project.activities.length > 0 ? 80 : 30
  const fileScore = project.files.length > 0 ? 80 : 40
  return Math.round((project.progress + taskScore + activityScore + fileScore) / 4)
}

export function ProjectsPage() {
  const { projectId } = useParams()
  const token = useAuthStore((state) => state.token)

  return projectId ? (
    <ProjectDetail token={token ?? ''} projectId={projectId} />
  ) : (
    <ProjectList token={token ?? ''} />
  )
}

function ProjectList({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    description: '',
    objective: '',
    readme: '',
    skills: '',
    visibility: 'private',
  })
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(token),
    enabled: Boolean(token),
  })
  const createMutation = useMutation({
    mutationFn: () =>
      createProject(token, {
        title: form.title,
        description: emptyToNull(form.description),
        objective: emptyToNull(form.objective),
        readme: emptyToNull(form.readme),
        visibility: form.visibility as 'private' | 'team' | 'public',
        skills: splitTags(form.skills),
      }),
    onSuccess: () => {
      setForm({ title: '', description: '', objective: '', readme: '', skills: '', visibility: 'private' })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card className="rounded-2xl border-surface-border shadow-sm">
            <CardHeader>
              <CardTitle>프로젝트 생성</CardTitle>
              <CardDescription>새 프로젝트를 만들고 팀 컨텍스트를 구조화합니다.</CardDescription>
            </CardHeader>
            <form
              className="grid gap-4"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                createMutation.mutate()
              }}
            >
              <Input
                label="프로젝트명"
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
                value={form.title}
              />
              <Textarea
                label="설명"
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                value={form.description}
              />
              <Textarea
                label="목표"
                onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))}
                value={form.objective}
              />
              <Input
                label="기술스택"
                onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))}
                placeholder="React, Node.js, PostgreSQL"
                value={form.skills}
              />
              <Select
                label="공개 범위"
                onChange={(event) => setForm((prev) => ({ ...prev, visibility: event.target.value }))}
                value={form.visibility}
              >
                <option value="private">Private</option>
                <option value="team">Team</option>
                <option value="public">Public</option>
              </Select>
              <Textarea
                label="Project Readme"
                onChange={(event) => setForm((prev) => ({ ...prev, readme: event.target.value }))}
                value={form.readme}
              />
              {createMutation.error ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {createMutation.error.message}
                </p>
              ) : null}
              <Button disabled={createMutation.isPending} type="submit">
                {createMutation.isPending ? '생성 중' : '프로젝트 생성'}
              </Button>
            </form>
          </Card>

          <Card className="rounded-2xl border-surface-border shadow-sm">
            <CardHeader>
              <CardTitle>프로젝트 목록</CardTitle>
              <CardDescription>소유·참여·공개 프로젝트를 한곳에서 관리합니다.</CardDescription>
            </CardHeader>
            {projectsQuery.isLoading ? <LoadingState /> : null}
            {projectsQuery.data?.projects.length === 0 ? (
              <EmptyState description="첫 프로젝트를 생성하면 이곳에 표시됩니다." title="프로젝트가 없습니다" />
            ) : null}
            <div className="grid gap-4">
              {projectsQuery.data?.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}

function ProjectProgressRing({ pct }: { pct: number }) {
  const gid = useId().replace(/:/g, '')
  const r = 38
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" fill="none" r={r} stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={r}
          stroke={`url(#${gid})`}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="8"
        />
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-ink-strong">{pct}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">Progress</span>
      </span>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const health = projectHealth(project)

  return (
    <Link
      className="block rounded-2xl border border-surface-border bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
      to={`/projects/${project.id}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink-strong">{project.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">
            {project.description ?? '프로젝트 설명이 없습니다.'}
          </p>
        </div>
        <Badge tone={project.status === 'ACTIVE' ? 'green' : 'purple'}>{project.status}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Progress" value={`${project.progress}%`} />
        <Metric label="Tasks" value={`${project.tasks.length}`} />
        <Metric label="Health" value={`${health}`} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {project.skills.slice(0, 5).map((skill) => (
          <Badge key={skill} tone="blue">
            {skill}
          </Badge>
        ))}
      </div>
    </Link>
  )
}

function ProjectDetail({ token, projectId }: { token: string; projectId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [teamInviteOpen, setTeamInviteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const projectQuery = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(token, projectId),
    enabled: Boolean(token),
  })
  const project = projectQuery.data?.project
  const pendingInvites = projectQuery.data?.pendingInvites ?? []
  const myPermissions = projectQuery.data?.myPermissions ?? []
  const isOwner = projectQuery.data?.isOwner ?? false
  const projectRoles = project?.roles ?? []
  const can = (permission: ProjectPermission) => hasProjectPermission(myPermissions, permission)
  const guestViewer =
    projectQuery.data?.isGuestViewer ?? isGuestProjectViewer(myPermissions, isOwner)
  const canViewTasks = can('tasks.view')
  const canViewFiles = can('files.view')
  const canViewActivities = can('activities.create')
  const [editForm, setEditForm] = useState({ progress: 0, status: 'planning' })
  const [taskForm, setTaskForm] = useState({ title: '', description: '', dueDate: '' })
  const [activityForm, setActivityForm] = useState({ title: '', description: '' })
  const [fileForm, setFileForm] = useState({ name: '', url: '', fileType: '' })
  const [detailTab, setDetailTab] = useState('overview')

  useEffect(() => {
    if (project) {
      setEditForm({ progress: project.progress, status: project.status.toLowerCase() })
    }
  }, [project])

  useEffect(() => {
    setDetailTab('overview')
  }, [projectId])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
  const updateMutation = useMutation({
    mutationFn: () =>
      updateProject(token, projectId, {
        progress: editForm.progress,
        status: editForm.status as 'planning' | 'active' | 'completed' | 'archived',
      }),
    onSuccess: invalidate,
  })
  const taskMutation = useMutation({
    mutationFn: () =>
      addProjectTask(token, projectId, {
        title: taskForm.title,
        description: emptyToNull(taskForm.description),
        dueDate: emptyToNull(taskForm.dueDate),
      }),
    onSuccess: () => {
      setTaskForm({ title: '', description: '', dueDate: '' })
      invalidate()
    },
  })
  const activityMutation = useMutation({
    mutationFn: () =>
      addProjectActivity(token, projectId, {
        title: activityForm.title,
        description: emptyToNull(activityForm.description),
      }),
    onSuccess: () => {
      setActivityForm({ title: '', description: '' })
      invalidate()
    },
  })
  const fileMutation = useMutation({
    mutationFn: () => addProjectFile(token, projectId, fileForm),
    onSuccess: () => {
      setFileForm({ name: '', url: '', fileType: '' })
      invalidate()
    },
  })
  const taskStatusMutation = useMutation({
    mutationFn: ({ task, status }: { task: ProjectTask; status: 'todo' | 'in_progress' | 'done' | 'blocked' }) =>
      updateProjectTask(token, projectId, task.id, { status }),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (password: string) => deleteProject(token, projectId, password),
    onSuccess: () => {
      setDeleteOpen(false)
      setDeleteError(null)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
    onError: (error: Error) => {
      setDeleteError(error.message)
    },
  })
  const leaveMutation = useMutation({
    mutationFn: () => leaveProject(token, projectId),
    onSuccess: () => {
      setLeaveOpen(false)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate('/projects')
    },
  })
  const assignRoleMutation = useMutation({
    mutationFn: ({ memberId, roleId }: { memberId: string; roleId: string }) =>
      assignMemberRole(token, projectId, memberId, roleId),
    onSuccess: invalidate,
  })

  const isMember = Boolean(
    currentUserId &&
      project?.members.some((member) => member.userId === currentUserId && member.userId !== project.ownerId),
  )

  if (projectQuery.isLoading) {
    return (
      <AppLayout>
        <LoadingState />
      </AppLayout>
    )
  }

  if (!project) {
    return (
      <AppLayout>
        <EmptyState description="접근 권한이 없거나 존재하지 않는 프로젝트입니다." title="프로젝트를 찾을 수 없습니다" />
      </AppLayout>
    )
  }

  const doneTaskCount = project.tasks.filter((task) => task.status === 'DONE').length

  const showSettingsTab =
    can('project.settings') ||
    can('roles.manage') ||
    can('members.invite') ||
    can('members.assign_role') ||
    can('project.delete') ||
    isMember

  const detailTabs: Array<{ id: string; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    ...(canViewTasks ? [{ id: 'tasks', label: 'Tasks', count: project.tasks.length }] : []),
    ...(canViewFiles ? [{ id: 'files', label: 'Files', count: project.files.length }] : []),
    ...(showSettingsTab ? [{ id: 'settings', label: 'Settings' }] : []),
  ]

  const effectiveDetailTab = detailTabs.some((tab) => tab.id === detailTab) ? detailTab : 'overview'

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Link
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-surface-border bg-white text-ink-strong shadow-sm transition hover:border-brand-200"
              to="/projects"
            >
              <ArrowLeft size={18} />
            </Link>
            <span className="font-medium text-ink-strong">Projects</span>
            <span>/</span>
            <span className="font-semibold text-brand-600">{project.title}</span>
          </div>
        </div>

        <Card className="overflow-hidden rounded-2xl border-surface-border shadow-sm">
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-600 text-white shadow-md">
                <Rocket size={28} />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-ink-strong">{project.title}</h1>
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
                  {project.description ?? project.id}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone="purple">{project.status}</Badge>
                  <Badge tone="blue">{project.visibility}</Badge>
                </div>
              </div>
            </div>
            <ProjectProgressRing pct={project.progress} />
          </div>

          <div className="flex gap-1 overflow-x-auto border-t border-surface-border px-2">
            {detailTabs.map((tab) => (
              <button
                className={cn(
                  'relative shrink-0 px-4 py-3 text-sm font-semibold transition',
                  effectiveDetailTab === tab.id ? 'text-brand-600' : 'text-ink-muted hover:text-ink-strong',
                )}
                key={tab.id}
                onClick={() => setDetailTab(tab.id)}
                type="button"
              >
                <span className="flex items-center gap-2">
                  {tab.id === 'settings' ? <Settings className="text-ink-muted" size={16} /> : null}
                  {tab.label}
                  {tab.count !== undefined ? (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-ink-muted">
                      {tab.count}
                    </span>
                  ) : null}
                </span>
                {effectiveDetailTab === tab.id ? (
                  <span className="absolute inset-x-2 bottom-0 block h-0.5 rounded-full bg-brand-600" />
                ) : null}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-6">
            {effectiveDetailTab === 'overview' ? (
              <>
                <Card className="rounded-2xl border-surface-border shadow-sm">
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="text-brand-600" size={20} />
                      <CardTitle>Project Readme</CardTitle>
                    </div>
                  </CardHeader>
                  <div className="rounded-xl border border-surface-border bg-surface-muted/50 p-5 font-mono text-sm leading-relaxed text-ink-body">
                    <p className="font-semibold text-brand-600">## Objective</p>
                    <p className="mt-2 whitespace-pre-wrap">{project.objective ?? '목표가 아직 입력되지 않았습니다.'}</p>
                    <p className="mt-4 font-semibold text-brand-600">## Key Features</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                      {project.skills.length > 0 ? (
                        project.skills.map((skill) => <li key={skill}>{skill}</li>)
                      ) : (
                        <li>기술스택을 추가하면 Readme에 반영됩니다.</li>
                      )}
                    </ul>
                    <p className="mt-4 font-semibold text-brand-600">## Current Sprint</p>
                    <p className="mt-2 whitespace-pre-wrap">
                      {project.description ?? '프로젝트 설명과 최근 활동을 기록하세요.'}
                    </p>
                  </div>
                </Card>

                {canViewActivities ? (
                  <Card className="rounded-2xl border-surface-border shadow-sm">
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    {can('activities.create') ? (
                      <form
                        className="mb-4 grid gap-3 border-b border-surface-border pb-4"
                        onSubmit={(event) => {
                          event.preventDefault()
                          activityMutation.mutate()
                        }}
                      >
                        <Input
                          label="활동 제목"
                          onChange={(event) =>
                            setActivityForm((prev) => ({ ...prev, title: event.target.value }))
                          }
                          required
                          value={activityForm.title}
                        />
                        <Textarea
                          label="설명"
                          onChange={(event) =>
                            setActivityForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          value={activityForm.description}
                        />
                        <Button className="w-fit rounded-full" type="submit">
                          활동 추가
                        </Button>
                      </form>
                    ) : null}
                    <List
                      items={project.activities.map((activity) => ({
                        id: activity.id,
                        title: activity.title,
                        meta: `${activity.type} · ${activity.user?.name ?? 'unknown'}`,
                      }))}
                    />
                  </Card>
                ) : guestViewer ? (
                  <Card className="rounded-2xl border-surface-border bg-surface-muted/30 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">공개 프로젝트</CardTitle>
                      <CardDescription>
                        팀 멤버가 아니면 활동·파일·태스크는 볼 수 없습니다. 초대를 받으면 전체 내용을 확인할 수
                        있습니다.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : null}
              </>
            ) : null}

            {effectiveDetailTab === 'tasks' ? (
              <Panel icon={<ListChecks size={20} />} title="Tasks">
                {can('tasks.create') ? (
                <form
                  className="grid gap-4 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    taskMutation.mutate()
                  }}
                >
                  <Input
                    label="태스크"
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                    required
                    value={taskForm.title}
                  />
                  <Input
                    label="마감일"
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    type="date"
                    value={taskForm.dueDate}
                  />
                  <Textarea
                    className="md:col-span-2"
                    label="설명"
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                    value={taskForm.description}
                  />
                  <Button className="rounded-full" type="submit">
                    태스크 추가
                  </Button>
                </form>
                ) : (
                  <p className="mb-4 text-sm text-ink-muted">태스크를 생성할 권한이 없습니다.</p>
                )}
                <div className="mt-4 space-y-2">
                  {project.tasks.map((task) => (
                    <div className="rounded-xl bg-surface-muted p-4" key={task.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-ink-strong">{task.title}</p>
                          <p className="mt-1 text-sm text-ink-muted">
                            {task.description ?? '설명 없음'} · {toFormDate(task.dueDate) || '마감일 없음'}
                          </p>
                        </div>
                        {can('tasks.edit') ? (
                        <Select
                          className="mt-0"
                          label="상태"
                          onChange={(event) =>
                            taskStatusMutation.mutate({
                              task,
                              status: event.target.value as 'todo' | 'in_progress' | 'done' | 'blocked',
                            })
                          }
                          value={task.status.toLowerCase()}
                        >
                          <option value="todo">Todo</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                          <option value="blocked">Blocked</option>
                        </Select>
                        ) : (
                          <Badge>{task.status}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {effectiveDetailTab === 'files' && canViewFiles ? (
              <Panel icon={<FileText size={20} />} title="Files">
                {can('files.upload') ? (
                  <form
                    className="grid gap-4 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      fileMutation.mutate()
                    }}
                  >
                    <Input
                      label="파일명"
                      onChange={(event) => setFileForm((prev) => ({ ...prev, name: event.target.value }))}
                      required
                      value={fileForm.name}
                    />
                    <Input
                      label="파일 타입"
                      onChange={(event) => setFileForm((prev) => ({ ...prev, fileType: event.target.value }))}
                      required
                      value={fileForm.fileType}
                    />
                    <Input
                      className="md:col-span-2"
                      label="URL"
                      onChange={(event) => setFileForm((prev) => ({ ...prev, url: event.target.value }))}
                      required
                      type="url"
                      value={fileForm.url}
                    />
                    <Button className="rounded-full" type="submit">
                      파일 추가
                    </Button>
                  </form>
                ) : (
                  <p className="mb-4 text-sm text-ink-muted">파일을 업로드할 권한이 없습니다.</p>
                )}
                <List
                  items={project.files.map((file) => ({
                    id: file.id,
                    title: file.name,
                    meta: `${file.fileType} · ${file.url}`,
                  }))}
                />
              </Panel>
            ) : null}

            {effectiveDetailTab === 'settings' ? (
              <div className="space-y-6">
                {can('roles.manage') ? (
                  <ProjectRolesPanel
                    onUpdated={invalidate}
                    projectId={projectId}
                    roles={projectRoles}
                    token={token}
                  />
                ) : null}
                <Panel icon={<UsersRound size={20} />} title="팀">
                  <p className="mb-4 text-sm text-ink-muted">
                    팀 초대는 사이드바의 + 버튼에서 팔로잉·팔로워·맞팔로우 목록으로 보낼 수 있습니다.
                  </p>
                  {can('members.invite') && pendingInvites.length > 0 ? (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">초대 대기</p>
                      <List
                        items={pendingInvites.map((invite) => ({
                          id: invite.id,
                          title: invite.invitee.name,
                          meta: `${invite.role} · 응답 대기`,
                        }))}
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {project.members.map((member) => {
                      const isProjectOwner = member.userId === project.ownerId
                      const assignableRoles = projectRoles.filter((role) => role.slug !== 'owner')
                      return (
                        <div
                          className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                          key={member.id}
                        >
                          <div>
                            <p className="font-semibold text-ink-strong">{member.user.name}</p>
                            <p className="text-sm text-ink-muted">{member.user.email}</p>
                          </div>
                          {can('members.assign_role') && !isProjectOwner && assignableRoles.length > 0 ? (
                            <Select
                              className="min-w-[10rem]"
                              label="역할"
                              onChange={(event) =>
                                assignRoleMutation.mutate({
                                  memberId: member.id,
                                  roleId: event.target.value,
                                })
                              }
                              value={member.roleId ?? assignableRoles[0]?.id ?? ''}
                            >
                              {assignableRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <Badge tone="blue">{member.role}</Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Panel>

                {can('project.settings') ? (
                <Card className="rounded-2xl border-surface-border shadow-sm">
                  <CardHeader>
                    <CardTitle>진행 상태</CardTitle>
                    <CardDescription>진행률과 프로젝트 단계를 저장합니다.</CardDescription>
                  </CardHeader>
                  <form
                    className="grid gap-4 md:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      updateMutation.mutate()
                    }}
                  >
                    <Input
                      label="진행률"
                      max={100}
                      min={0}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, progress: Number(event.target.value) }))}
                      type="number"
                      value={editForm.progress}
                    />
                    <Select
                      label="상태"
                      onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}
                      value={editForm.status}
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </Select>
                    <div className="md:col-span-2">
                      <Button className="rounded-full" disabled={updateMutation.isPending} type="submit">
                        상태 저장
                      </Button>
                    </div>
                  </form>
                </Card>
                ) : null}

                {can('project.delete') ? (
                  <Card className="rounded-2xl border-red-200 bg-red-50/40 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-red-700">위험 구역</CardTitle>
                      <CardDescription>프로젝트를 영구 삭제합니다. 복구할 수 없습니다.</CardDescription>
                    </CardHeader>
                    <Button onClick={() => setDeleteOpen(true)} type="button" variant="danger">
                      <Trash2 size={16} />
                      프로젝트 삭제
                    </Button>
                  </Card>
                ) : isMember ? (
                  <Card className="rounded-2xl border-surface-border shadow-sm">
                    <CardHeader>
                      <CardTitle>프로젝트 나가기</CardTitle>
                      <CardDescription>멤버에서 제외되며, 다시 초대받아야 합니다.</CardDescription>
                    </CardHeader>
                    <Button onClick={() => setLeaveOpen(true)} type="button" variant="secondary">
                      <LogOut size={16} />
                      프로젝트 나가기
                    </Button>
                  </Card>
                ) : null}
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            <Card className="rounded-2xl border-surface-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">팀</CardTitle>
                {can('members.invite') ? (
                  <button
                    aria-label="팀 초대"
                    className="rounded-full p-1 text-ink-muted hover:bg-surface-muted"
                    onClick={() => setTeamInviteOpen(true)}
                    type="button"
                  >
                    <Plus size={18} />
                  </button>
                ) : null}
              </CardHeader>
              <div className="space-y-3 px-5 pb-5">
                {project.members.slice(0, 6).map((member) => (
                  <div className="flex items-center gap-3" key={member.id}>
                    <Avatar name={member.user.name} src={member.user.avatarUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-ink-strong">{member.user.name}</p>
                      <p className="truncate text-xs text-ink-muted">{member.role}</p>
                    </div>
                  </div>
                ))}
                {can('members.invite') && pendingInvites.length > 0
                  ? pendingInvites.slice(0, 3).map((invite) => (
                      <div className="flex items-center gap-3 opacity-70" key={invite.id}>
                        <Avatar name={invite.invitee.name} src={invite.invitee.avatarUrl} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink-strong">{invite.invitee.name}</p>
                          <p className="truncate text-xs text-amber-700">초대 대기 · {invite.role}</p>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            </Card>

            <Card className="rounded-2xl border-surface-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Project Health</CardTitle>
              </CardHeader>
              <div className="space-y-4 px-5 pb-5">
                <div>
                  <div className="mb-1 flex justify-between text-xs font-semibold">
                    <span className="text-emerald-700">On Track</span>
                    <span className="text-ink-muted">{project.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(100, project.progress)}%` }}
                    />
                  </div>
                </div>
                {canViewTasks ? (
                  <p className="text-sm text-ink-body">
                    <span className="font-semibold text-ink-strong">Tasks Completed:</span>{' '}
                    {doneTaskCount}/{project.tasks.length || 0}
                  </p>
                ) : null}
              </div>
            </Card>

            {canViewFiles ? (
              <Card className="rounded-2xl border-surface-border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Resources</CardTitle>
                  {can('files.upload') ? (
                    <button
                      className="text-ink-muted hover:text-ink-strong"
                      onClick={() => setDetailTab('files')}
                      type="button"
                    >
                      <Plus size={18} />
                    </button>
                  ) : null}
                </CardHeader>
                <div className="px-5 pb-5">
                  {project.files.length === 0 ? (
                    <p className="text-sm text-ink-muted">연결된 리소스가 없습니다.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {project.files.slice(0, 5).map((file) => (
                        <li className="truncate text-ink-body" key={file.id}>
                          <span className="font-semibold text-ink-strong">{file.name}</span>
                          <span className="text-ink-muted"> · {file.fileType}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>

      <ProjectDeleteModal
        error={deleteError}
        isPending={deleteMutation.isPending}
        onClose={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        onConfirm={(password) => deleteMutation.mutate(password)}
        open={deleteOpen}
        projectTitle={project.title}
      />
      <ProjectLeaveModal
        isPending={leaveMutation.isPending}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => leaveMutation.mutate()}
        open={leaveOpen}
        projectTitle={project.title}
      />
      {can('members.invite') ? (
        <TeamInviteModal
          onClose={() => setTeamInviteOpen(false)}
          open={teamInviteOpen}
          projectId={projectId}
          projectTitle={project.title}
          roles={projectRoles}
          token={token}
        />
      ) : null}
    </AppLayout>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-muted p-4">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink-strong">{value}</p>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 text-brand-600">{icon}</div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  )
}

function List({ items }: { items: Array<{ id: string; title: string; meta: string }> }) {
  if (items.length === 0) {
    return <p className="mt-4 rounded-2xl bg-surface-muted p-4 text-sm text-ink-muted">아직 기록이 없습니다.</p>
  }

  return (
    <div className="mt-4 space-y-2">
      {items.map((item) => (
        <div className="rounded-2xl bg-surface-muted p-4" key={item.id}>
          <p className="font-bold text-ink-strong">{item.title}</p>
          <p className="mt-1 break-all text-sm text-ink-muted">{item.meta}</p>
        </div>
      ))}
    </div>
  )
}
