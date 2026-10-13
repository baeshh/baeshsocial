import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, ExternalLink, Plus, ShieldCheck, UserPlus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PROJECT_STATUS_LABEL, SUPERVISION_META, VISIBILITY_META, formatPeriod, toDateInput } from '../../lib/programs'
import {
  assignTeamMembers,
  createProgramProject,
  decideProjectRequest,
  getOrganizationPrograms,
  getProgramParticipants,
  getProgramProjects,
  getProjectRequests,
  moveProgramProject,
  removeProgramProject,
  removeTeamMember,
  updateProgramProject,
  type ProgramProjectPayload,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type {
  Program,
  ProgramAccess,
  ProgramProject,
  ProgramProjectsSummary,
  ProgramProjectStatus,
  SupervisionHealth,
  TeamRole,
} from '../../types/program'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { Input, Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { RegistrationCard } from './ProgramRequestsPanel'
import { StudentProjectRequestModal } from './StudentProjectRequestModal'

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
  const allowMultiple = program.policy.allowMultipleProjects
  const available = useMemo(() => {
    const onThisTeam = new Set(project.members.map((m) => m.userId))
    const q = search.trim().toLowerCase()
    return (participantsQuery.data?.participants ?? [])
      .filter((p) => !onThisTeam.has(p.userId) && (allowMultiple || p.teams.length === 0))
      .filter((p) => !q || [p.user.name, p.user.email, p.studentNo ?? ''].some((v) => v.toLowerCase().includes(q)))
  }, [participantsQuery.data, search, project.members, allowMultiple])

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
      description={
        program.policy.allowMultipleProjects
          ? '프로그램 참여 학생 중 이 팀에 없는 학생이 표시됩니다.'
          : '프로그램 참여 학생 중 아직 팀이 없는 학생만 표시됩니다. 한 프로그램에서 학생은 한 팀에만 속할 수 있습니다.'
      }
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

function RemoveModal({ program, project, onClose }: { program: Program; project: ProgramProject; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const remove = useMutation({
    mutationFn: () => removeProgramProject(token!, program.id, project.id, reason.trim()),
    onSuccess: () => {
      showToast('프로그램에서 제거했습니다. 학생의 프로젝트는 개인 프로젝트로 남습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  return (
    <Modal
      description="프로젝트를 삭제하지 않고 프로그램 연결만 해제합니다. 승인된 증빙과 인증 기록은 유지되며, 사유는 팀에 전달되고 감사 로그에 남습니다."
      onClose={onClose}
      open
      title={`${project.title} 프로그램에서 제거`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          remove.mutate()
        }}
      >
        <Textarea label="제거 사유 (필수)" maxLength={1000} minLength={2} onChange={(e) => setReason(e.target.value)} required value={reason} />
        <div className="flex justify-end">
          <Button disabled={remove.isPending || reason.trim().length < 2} type="submit" variant="danger">
            제거
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function SupervisionSummary({
  summary,
  filter,
  onFilter,
}: {
  summary: ProgramProjectsSummary
  filter: SupervisionHealth | null
  onFilter: (value: SupervisionHealth | null) => void
}) {
  const stats = [
    { label: '프로젝트', value: summary.projects, sub: `학생 주도 ${summary.studentProjects}` },
    { label: '참여 학생', value: summary.students, sub: `등록 학생 ${summary.participants}` },
    { label: '증빙 검토 대기', value: summary.pendingEvidence, sub: '검토 탭에서 처리', tone: summary.pendingEvidence ? 'text-accent-600' : '' },
    { label: '등록 요청', value: summary.pendingRequests, sub: '승인 대기', tone: summary.pendingRequests ? 'text-accent-600' : '' },
    { label: '성과 인증', value: summary.verified, sub: '기관 공식 인증 완료' },
  ]
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((stat) => (
          <Card className="rounded-2xl p-4" key={stat.label}>
            <p className="text-xs font-semibold text-ink-muted">{stat.label}</p>
            <p className={`mt-1 text-2xl font-bold text-ink-strong ${stat.tone ?? ''}`}>{stat.value}</p>
            <p className="text-xs text-ink-muted">{stat.sub}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === null ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body'}`}
          onClick={() => onFilter(null)}
          type="button"
        >
          전체 {summary.projects}
        </button>
        {(Object.keys(SUPERVISION_META) as SupervisionHealth[]).map((key) => (
          <button
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body'}`}
            key={key}
            onClick={() => onFilter(filter === key ? null : key)}
            title={SUPERVISION_META[key].hint}
            type="button"
          >
            {SUPERVISION_META[key].label} {summary.byHealth[key]}
          </button>
        ))}
      </div>
    </div>
  )
}

function MyRequests({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const requestsQuery = useQuery({
    queryKey: ['programs', program.id, 'project-requests', 'mine'],
    queryFn: () => getProjectRequests(token!, program.id, 'all'),
    enabled: Boolean(token),
  })
  const withdraw = useMutation({
    mutationFn: (requestId: string) => decideProjectRequest(token!, program.id, requestId, 'withdraw'),
    onSuccess: () => {
      showToast('등록 요청을 철회했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const requests = (requestsQuery.data?.requests ?? []).filter((r) => r.status !== 'approved' || !r.project.inProgram)
  if (requests.length === 0) return null
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-ink-strong">내 등록 요청</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {requests.map((request) => (
          <RegistrationCard
            actions={
              <>
                <Button className="min-h-9 px-4" to={`/projects/${request.project.id}`} variant="secondary">
                  <ExternalLink className="mr-1" size={14} /> 프로젝트 열기
                </Button>
                {request.status === 'pending' ? (
                  <Button
                    className="min-h-9 px-4"
                    disabled={withdraw.isPending}
                    onClick={() => {
                      if (window.confirm('등록 요청을 철회할까요? 프로젝트는 그대로 남습니다.')) withdraw.mutate(request.id)
                    }}
                    variant="ghost"
                  >
                    철회
                  </Button>
                ) : null}
              </>
            }
            key={request.id}
            request={request}
          />
        ))}
      </div>
    </section>
  )
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'request' }
  | { kind: 'edit'; project: ProgramProject }
  | { kind: 'assign'; project: ProgramProject }
  | { kind: 'move'; project: ProgramProject }
  | { kind: 'remove'; project: ProgramProject }

export function ProgramProjectsPanel({ program, access }: Props) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<ModalState | null>(null)
  const [healthFilter, setHealthFilter] = useState<SupervisionHealth | null>(null)
  const writable = program.status !== 'archived'
  const openForStudents = program.status !== 'archived' && program.status !== 'completed'

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

  const allProjects = projectsQuery.data?.projects ?? []
  const summary = projectsQuery.data?.summary ?? null
  const projects = healthFilter ? allProjects.filter((p) => p.supervision?.health === healthFilter) : allProjects
  const canStartProject =
    access.isParticipant &&
    program.policy.allowStudentProjects &&
    openForStudents &&
    (program.policy.allowMultipleProjects || allProjects.length === 0)

  return (
    <div className="space-y-5">
      {access.isStaff ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {program.policy.allowStudentProjects
              ? '학생이 직접 만든 프로젝트와 기관이 배정한 프로젝트를 함께 감독합니다. 학생 주도 프로젝트는 피드백·수정 요청으로 관여합니다.'
              : '팀 단위 프로젝트를 만들고 참여 학생을 배정합니다.'}
          </p>
          {writable ? (
            <Button onClick={() => setModal({ kind: 'create' })}>
              <Plus className="mr-1" size={16} /> 기관 프로젝트 추가
            </Button>
          ) : null}
        </div>
      ) : canStartProject ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="text-sm text-ink-body">
            이 프로그램은 학생이 직접 프로젝트를 만들거나 기존 프로젝트를 연결할 수 있습니다.
            {program.policy.requireProjectApproval ? ' 담당자 승인 후 프로그램 프로젝트가 됩니다.' : ''}
          </p>
          <Button onClick={() => setModal({ kind: 'request' })}>
            <Plus className="mr-1" size={16} /> 프로젝트 만들기·연결
          </Button>
        </div>
      ) : null}

      {summary ? <SupervisionSummary filter={healthFilter} onFilter={setHealthFilter} summary={summary} /> : null}

      {!access.isStaff ? <MyRequests program={program} /> : null}

      {projects.length === 0 ? (
        <EmptyState
          description={
            access.isStaff
              ? healthFilter
                ? '이 상태의 프로젝트가 없습니다.'
                : '기관 프로젝트를 추가하거나 학생 프로젝트 등록을 허용하세요.'
              : canStartProject
                ? '새 프로젝트를 만들거나 진행 중인 프로젝트를 연결해 보세요.'
                : '아직 배정된 팀이 없습니다. 담당자가 팀을 배정하면 표시됩니다.'
          }
          title={access.isStaff ? '프로젝트가 없습니다' : '참여 중인 팀이 없습니다'}
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
                  <p className="text-xs text-ink-muted">
                    {formatPeriod(project.startDate, project.endDate)} · {project.origin === 'student' ? '학생 주도' : '기관 배정'} ·{' '}
                    {project.visibility === 'public' && !program.policy.allowPublicProjects
                      ? `${VISIBILITY_META.team.label} (전체 공개 미허용)`
                      : VISIBILITY_META[project.visibility].label}
                  </p>
                </div>
                <Badge tone={project.status === 'completed' ? 'green' : project.status === 'active' ? 'blue' : 'gray'}>
                  {PROJECT_STATUS_LABEL[project.status]}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {project.supervision ? (
                  <Badge title={SUPERVISION_META[project.supervision.health].hint} tone={SUPERVISION_META[project.supervision.health].tone}>
                    {SUPERVISION_META[project.supervision.health].label}
                  </Badge>
                ) : null}
                {project.verification ? (
                  <Badge tone="green">
                    <ShieldCheck className="mr-1" size={12} /> 기관 공식 인증 완료
                  </Badge>
                ) : project.registration?.status === 'approved' ? (
                  <Badge tone="gray">등록 승인 · 성과 인증 전</Badge>
                ) : null}
                {project.supervision?.overdueTasks ? <Badge tone="red">기한 지난 태스크 {project.supervision.overdueTasks}</Badge> : null}
                {project.supervision?.openRemovalRequests ? <Badge tone="red">제외·제거 요청 {project.supervision.openRemovalRequests}</Badge> : null}
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
                    {access.isStaff && writable && !(project.origin === 'student' && member.teamRole === 'leader') ? (
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
                <Button className="min-h-9 px-4" to={`/projects/${project.id}?tab=${access.isStaff ? 'reviews' : 'overview'}`} variant="secondary">
                  <ExternalLink className="mr-1" size={14} /> {access.isStaff ? '감독하기' : '열기'}
                </Button>
                {access.isStaff && writable ? (
                  <>
                    <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'assign', project })} variant="secondary">
                      <UserPlus className="mr-1" size={14} /> 팀원 배정
                    </Button>
                    {project.origin === 'institution' ? (
                      <>
                        <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'edit', project })} variant="ghost">
                          수정
                        </Button>
                        <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'move', project })} variant="ghost">
                          이동
                        </Button>
                      </>
                    ) : (
                      <Button className="min-h-9 px-4" onClick={() => setModal({ kind: 'remove', project })} variant="ghost">
                        프로그램에서 제거
                      </Button>
                    )}
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
      {modal?.kind === 'remove' ? <RemoveModal onClose={() => setModal(null)} program={program} project={modal.project} /> : null}
      {modal?.kind === 'request' ? <StudentProjectRequestModal onClose={() => setModal(null)} program={program} /> : null}
    </div>
  )
}
