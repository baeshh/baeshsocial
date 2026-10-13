import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, ExternalLink, Plus, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PROJECT_STATUS_LABEL, formatPeriod, toDateInput } from '../../lib/programs'
import {
  assignTeamMembers,
  createProgramProject,
  getOrganizationPrograms,
  getProgramParticipants,
  getProgramProjects,
  moveProgramProject,
  removeTeamMember,
  updateProgramProject,
  type ProgramProjectPayload,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program, ProgramAccess, ProgramProject, ProgramProjectStatus, TeamRole } from '../../types/program'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { Input, Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'

type Props = { program: Program; access: ProgramAccess }

type ProjectForm = {
  title: string
  teamName: string
  objective: string
  description: string
  status: ProgramProjectStatus
  startDate: string
  endDate: string
}

const toForm = (project?: ProgramProject): ProjectForm => ({
  title: project?.title ?? '',
  teamName: project?.teamName ?? '',
  objective: project?.objective ?? '',
  description: project?.description ?? '',
  status: project?.status ?? 'active',
  startDate: toDateInput(project?.startDate),
  endDate: toDateInput(project?.endDate),
})

const toPayload = (form: ProjectForm): ProgramProjectPayload => ({
  title: form.title.trim(),
  teamName: form.teamName.trim() || null,
  objective: form.objective.trim() || null,
  description: form.description.trim() || null,
  status: form.status,
  startDate: form.startDate || null,
  endDate: form.endDate || null,
})

function ProjectFormModal({ program, project, onClose }: { program: Program; project?: ProgramProject; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => toForm(project))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      project
        ? updateProgramProject(token!, program.id, project.id, toPayload(form))
        : createProgramProject(token!, program.id, toPayload(form)),
    onSuccess: () => {
      showToast(project ? '프로젝트를 수정했습니다.' : '프로젝트를 만들었습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Modal
      description={project ? undefined : '비워 둔 기간은 프로그램 기간을 그대로 사용합니다.'}
      onClose={onClose}
      open
      title={project ? '프로젝트 수정' : '프로그램 프로젝트 추가'}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          save.mutate()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Input label="팀 이름" maxLength={60} onChange={(e) => set('teamName', e.target.value)} placeholder="1조" value={form.teamName} />
          <Input label="프로젝트 이름" maxLength={120} minLength={2} onChange={(e) => set('title', e.target.value)} required value={form.title} />
        </div>
        <Textarea label="프로젝트 목표" maxLength={2000} onChange={(e) => set('objective', e.target.value)} value={form.objective} />
        <Textarea label="설명" maxLength={4000} onChange={(e) => set('description', e.target.value)} value={form.description} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="상태" onChange={(e) => set('status', e.target.value as ProgramProjectStatus)} value={form.status}>
            {Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="시작일" onChange={(e) => set('startDate', e.target.value)} type="date" value={form.startDate} />
          <Input label="종료일" onChange={(e) => set('endDate', e.target.value)} type="date" value={form.endDate} />
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}
        <div className="flex justify-end">
          <Button disabled={save.isPending} type="submit">
            {save.isPending ? '저장 중…' : project ? '저장' : '추가'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AssignModal({ program, project, onClose }: { program: Program; project: ProgramProject; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [teamRole, setTeamRole] = useState<TeamRole>('member')
  const [search, setSearch] = useState('')

  const participantsQuery = useQuery({
    queryKey: ['programs', program.id, 'participants'],
    queryFn: () => getProgramParticipants(token!, program.id),
    enabled: Boolean(token),
  })
  const available = useMemo(
    () =>
      (participantsQuery.data?.participants ?? [])
        .filter((p) => !p.team)
        .filter((p) => {
          const q = search.trim().toLowerCase()
          return !q || [p.user.name, p.user.email, p.studentNo ?? ''].some((v) => v.toLowerCase().includes(q))
        }),
    [participantsQuery.data, search],
  )

  const assign = useMutation({
    mutationFn: () => assignTeamMembers(token!, program.id, project.id, selected, teamRole),
    onSuccess: (result) => {
      showToast(
        result.skipped.length
          ? `${result.added.length}명 배정 · ${result.skipped.length}명 제외 (${result.skipped[0].reason})`
          : `${result.added.length}명을 배정했습니다.`,
        result.skipped.length ? 'info' : 'success',
      )
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <Modal
      description="프로그램 참여 학생 중 아직 팀이 없는 학생만 표시됩니다. 한 프로그램에서 학생은 한 팀에만 속할 수 있습니다."
      onClose={onClose}
      open
      title={`${project.teamName ?? project.title} 팀원 배정`}
    >
      {participantsQuery.isLoading ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              className="h-10 flex-1 rounded-full border border-surface-border px-4 text-sm outline-none focus:border-brand-500"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·이메일·학번 검색"
              value={search}
            />
            <select
              aria-label="팀 역할"
              className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm font-semibold"
              onChange={(e) => setTeamRole(e.target.value as TeamRole)}
              value={teamRole}
            >
              <option value="member">팀원으로</option>
              <option value="leader">팀장으로</option>
            </select>
          </div>
          {available.length === 0 ? (
            <p className="rounded-2xl bg-surface-muted/60 p-4 text-sm text-ink-muted">
              배정 가능한 학생이 없습니다. 참여자 탭에서 학생을 먼저 등록해 주세요.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-surface-border overflow-y-auto rounded-2xl border border-surface-border">
              {available.map((p) => {
                const checked = selected.includes(p.userId)
                return (
                  <li key={p.userId}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-surface-muted/50">
                      <input
                        checked={checked}
                        onChange={() => setSelected((prev) => (checked ? prev.filter((id) => id !== p.userId) : [...prev, p.userId]))}
                        type="checkbox"
                      />
                      <Avatar name={p.user.name} size="sm" src={p.user.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-strong">{p.user.name}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {[p.studentNo, p.department, p.user.email].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">{selected.length}명 선택</span>
            <Button disabled={selected.length === 0 || assign.isPending} onClick={() => assign.mutate()}>
              배정
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function MoveModal({ program, project, onClose }: { program: Program; project: ProgramProject; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [target, setTarget] = useState('')
  const programsQuery = useQuery({
    queryKey: ['programs', 'org', program.organizationId],
    queryFn: () => getOrganizationPrograms(token!, program.organizationId),
    enabled: Boolean(token),
  })
  const options = (programsQuery.data?.programs ?? []).filter(
    (item) => item.id !== program.id && item.myAccess.isStaff && item.status !== 'archived',
  )
  const move = useMutation({
    mutationFn: () => moveProgramProject(token!, program.id, project.id, target),
    onSuccess: () => {
      showToast('프로젝트를 이동했습니다. 팀원은 대상 프로그램 참여자로 등록됩니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <Modal description="같은 조직 안에서 내가 관리하는 프로그램으로만 이동할 수 있습니다. 증빙과 이력은 그대로 유지됩니다." onClose={onClose} open title="다른 프로그램으로 이동">
      <div className="space-y-4">
        <Select label="대상 프로그램" onChange={(e) => setTarget(e.target.value)} value={target}>
          <option value="">선택하세요</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
              {item.term ? ` · ${item.term}` : ''}
            </option>
          ))}
        </Select>
        {programsQuery.isSuccess && options.length === 0 ? <p className="text-sm text-ink-muted">이동할 수 있는 프로그램이 없습니다.</p> : null}
        <div className="flex justify-end">
          <Button disabled={!target || move.isPending} onClick={() => move.mutate()}>
            이동
          </Button>
        </div>
      </div>
    </Modal>
  )
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'edit'; project: ProgramProject }
  | { kind: 'assign'; project: ProgramProject }
  | { kind: 'move'; project: ProgramProject }

export function ProgramProjectsPanel({ program, access }: Props) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<ModalState | null>(null)
  const writable = program.status !== 'archived'

  const projectsQuery = useQuery({
    queryKey: ['programs', program.id, 'projects'],
    queryFn: () => getProgramProjects(token!, program.id),
    enabled: Boolean(token),
  })
  const unassign = useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      removeTeamMember(token!, program.id, projectId, userId),
    onSuccess: () => {
      showToast('팀에서 제외했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (projectsQuery.isLoading) return <LoadingState />
  if (projectsQuery.isError) return <p className="text-sm text-red-700">{(projectsQuery.error as Error).message}</p>

  const projects = projectsQuery.data?.projects ?? []

  return (
    <div className="space-y-5">
      {access.isStaff ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            프로젝트 {projects.length}개 · 배정 학생 {projects.reduce((sum, p) => sum + p.members.length, 0)}명
          </p>
          {writable ? (
            <Button onClick={() => setModal({ kind: 'create' })}>
              <Plus className="mr-1" size={16} /> 프로젝트 추가
            </Button>
          ) : null}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <EmptyState
          description={access.isStaff ? '팀 단위 프로젝트를 추가한 뒤 참여 학생을 배정하세요.' : '아직 배정된 팀이 없습니다. 담당자가 팀을 배정하면 표시됩니다.'}
          title={access.isStaff ? '프로젝트가 없습니다' : '배정된 팀이 없습니다'}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {projects.map((project) => (
            <Card className="flex flex-col rounded-2xl p-5" key={project.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink-strong">
                    {project.teamName ? <span className="mr-1 text-brand-600">{project.teamName}</span> : null}
                    {project.title}
                  </p>
                  <p className="text-xs text-ink-muted">{formatPeriod(project.startDate, project.endDate)}</p>
                </div>
                <Badge tone={project.status === 'completed' ? 'green' : project.status === 'active' ? 'blue' : 'gray'}>
                  {PROJECT_STATUS_LABEL[project.status]}
                </Badge>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${project.progress}%` }} />
                </div>
                <span className="text-xs font-semibold text-ink-strong">{project.progress}%</span>
                <span className="text-xs text-ink-muted">
                  태스크 {project.taskStats.done}/{project.taskStats.total}
                </span>
              </div>

              {project.evidenceStats ? (
                <p className="mt-2 text-xs text-ink-muted">
                  증빙 대기 <b className="text-accent-600">{project.evidenceStats.submitted}</b> · 승인{' '}
                  <b className="text-emerald-700">{project.evidenceStats.approved}</b> · 반려{' '}
                  <b className="text-red-600">{project.evidenceStats.rejected}</b>
                </p>
              ) : null}

              <ul className="mt-3 flex flex-wrap gap-1.5">
                {project.members.length === 0 ? <li className="text-xs text-ink-muted">배정된 팀원이 없습니다.</li> : null}
                {project.members.map((member) => (
                  <li
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-muted/50 py-0.5 pl-1 pr-2 text-xs font-medium text-ink-strong"
                    key={member.userId}
                  >
                    <Avatar className="h-5 w-5 text-[10px]" name={member.name} size="sm" src={member.avatarUrl} />
                    {member.teamRole === 'leader' ? <Crown className="text-amber-500" size={12} /> : null}
                    {member.name}
                    {access.isStaff && writable ? (
                      <button
                        aria-label={`${member.name} 팀에서 제외`}
                        className="ml-0.5 rounded-full text-ink-muted hover:text-red-600"
                        onClick={() => {
                          if (window.confirm(`${member.name}님을 팀에서 제외할까요?`)) unassign.mutate({ projectId: project.id, userId: member.userId })
                        }}
                        type="button"
                      >
                        <X size={12} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-4">
                <Button className="min-h-9 px-4" to={`/projects/${project.id}?tab=evidence`} variant="secondary">
                  <ExternalLink className="mr-1" size={14} /> 열기
                </Button>
                {access.isStaff && writable ? (
                  <>
                    <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'assign', project })} variant="secondary">
                      <UserPlus className="mr-1" size={14} /> 팀원 배정
                    </Button>
                    <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'edit', project })} variant="ghost">
                      수정
                    </Button>
                    <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'move', project })} variant="ghost">
                      이동
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {modal?.kind === 'create' ? <ProjectFormModal onClose={() => setModal(null)} program={program} /> : null}
      {modal?.kind === 'edit' ? <ProjectFormModal onClose={() => setModal(null)} program={program} project={modal.project} /> : null}
      {modal?.kind === 'assign' ? <AssignModal onClose={() => setModal(null)} program={program} project={modal.project} /> : null}
      {modal?.kind === 'move' ? <MoveModal onClose={() => setModal(null)} program={program} project={modal.project} /> : null}
    </div>
  )
}
