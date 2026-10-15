import { useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { TASK_STATUS_META, TASK_STATUSES, taskDue } from '../../../lib/projectDisplay'
import { emptyToNull } from '../../../lib/projectForm'
import { addProjectTask, updateProjectTask, type TaskPayload } from '../../../services/projectService'
import { useAuthStore } from '../../../stores/authStore'
import { showToast } from '../../../stores/toastStore'
import type { ProjectTask, ProjectTaskStatus } from '../../../types/project'
import { Badge } from '../../common/Badge'
import { Button } from '../../common/Button'
import { Input, Select, Textarea } from '../../common/Input'
import { chipClass } from '../../jobs/jobsStyles'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

type Filter = 'all' | 'mine' | ProjectTaskStatus

const compactSelect =
  'h-9 rounded-lg border border-surface-border bg-white px-2 text-sm font-semibold text-ink-strong outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:opacity-60'

const emptyForm = { title: '', description: '', dueDate: '', assigneeId: '' }

/** Unfinished work first, soonest due first (undated last); finished work at the end. */
const taskOrder = (a: ProjectTask, b: ProjectTask) =>
  Number(a.status === 'DONE') - Number(b.status === 'DONE') ||
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  a.createdAt.localeCompare(b.createdAt)

/** `composeRequest` changes each time a quick action asks for the add form; 0 means no request. */
export function ProjectTasksTab({ ctx, composeRequest }: { ctx: ProjectDetailContext; composeRequest: number }) {
  const { project, token, can, invalidate } = ctx
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [seenRequest, setSeenRequest] = useState(0)
  if (composeRequest !== seenRequest) {
    setSeenRequest(composeRequest)
    if (composeRequest) setFormOpen(true)
  }
  const canCreate = can('tasks.create')
  const canEdit = can('tasks.edit')

  const create = useMutation({
    mutationFn: () =>
      addProjectTask(token, project.id, {
        title: form.title,
        description: emptyToNull(form.description),
        dueDate: emptyToNull(form.dueDate),
        assigneeId: form.assigneeId || null,
      }),
    onSuccess: () => {
      setForm(emptyForm)
      setFormOpen(false)
      showToast('작업을 추가했습니다.', 'success')
      invalidate()
    },
  })
  const update = useMutation({
    mutationFn: ({ task, payload }: { task: ProjectTask; payload: Partial<TaskPayload> }) => updateProjectTask(token, project.id, task.id, payload),
    onSuccess: invalidate,
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, project.tasks.filter((task) => task.status === status).length])) as Record<
    ProjectTaskStatus,
    number
  >
  const mineCount = project.tasks.filter((task) => task.assigneeId === currentUserId).length
  const visible = project.tasks
    .filter((task) => (filter === 'all' ? true : filter === 'mine' ? task.assigneeId === currentUserId : task.status === filter))
    .sort(taskOrder)

  return (
    <div className="space-y-4">
      <ProjectSection
        actions={
          canCreate && !formOpen ? (
            <Button onClick={() => setFormOpen(true)} size="sm" type="button">
              <Plus aria-hidden size={15} />
              작업 추가
            </Button>
          ) : null
        }
        description="상태를 바꿔 진행 상황을 기록합니다. 우선순위는 아직 지원하지 않아 마감일 순으로 정렬합니다."
        title="작업"
      >
        {formOpen ? (
          <form
            aria-label="새 작업"
            className="mb-4 grid gap-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              create.mutate()
            }}
          >
            <div className="sm:col-span-2">
              <Input
                autoFocus
                label="작업 이름"
                maxLength={200}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                required
                value={form.title}
              />
            </div>
            <Input label="마감일" onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))} type="date" value={form.dueDate} />
            <Select label="담당자" onChange={(event) => setForm((prev) => ({ ...prev, assigneeId: event.target.value }))} value={form.assigneeId}>
              <option value="">담당자 없음</option>
              {project.members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Textarea
                className="min-h-20"
                label="설명 (선택)"
                maxLength={1000}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                rows={2}
                value={form.description}
              />
            </div>
            {create.error ? (
              <p className="text-sm font-medium text-danger-700 sm:col-span-2" role="alert">
                {create.error.message}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                onClick={() => {
                  setFormOpen(false)
                  setForm(emptyForm)
                }}
                type="button"
                variant="secondary"
              >
                취소
              </Button>
              <Button loading={create.isPending} type="submit">
                작업 추가
              </Button>
            </div>
          </form>
        ) : null}

        <div aria-label="작업 상태" className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">
          <button aria-pressed={filter === 'all'} className={chipClass(filter === 'all')} onClick={() => setFilter('all')} type="button">
            전체 {project.tasks.length}
          </button>
          {TASK_STATUSES.map((status) => (
            <button aria-pressed={filter === status} className={chipClass(filter === status)} key={status} onClick={() => setFilter(status)} type="button">
              {TASK_STATUS_META[status].label} {counts[status]}
            </button>
          ))}
          <button aria-pressed={filter === 'mine'} className={chipClass(filter === 'mine')} onClick={() => setFilter('mine')} type="button">
            내 작업 {mineCount}
          </button>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl bg-surface-muted/60 p-4 text-sm text-ink-muted">
            {project.tasks.length === 0 ? (canCreate ? '첫 작업을 추가해 보세요.' : '등록된 작업이 없습니다.') : '이 조건의 작업이 없습니다.'}
          </p>
        ) : (
          <ul aria-label="작업 목록" className="divide-y divide-surface-border rounded-xl border border-surface-border">
            {visible.map((task) => {
              const due = taskDue(task)
              return (
                <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" key={task.id}>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${task.status === 'DONE' ? 'text-ink-muted line-through' : 'text-ink-strong'}`}>{task.title}</p>
                    {task.description ? <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{task.description}</p> : null}
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                      <span>{task.assignee ? `담당 ${task.assignee.name}` : '담당자 없음'}</span>
                      <span className={due?.overdue ? 'font-semibold text-danger-700' : undefined}>{due ? due.label : '마감일 없음'}</span>
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <select
                        aria-label={`${task.title} 상태`}
                        className={compactSelect}
                        disabled={update.isPending}
                        onChange={(event) => update.mutate({ task, payload: { status: event.target.value as TaskPayload['status'] } })}
                        value={task.status.toLowerCase()}
                      >
                        {TASK_STATUSES.map((status) => (
                          <option key={status} value={status.toLowerCase()}>
                            {TASK_STATUS_META[status].label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`${task.title} 담당자`}
                        className={`${compactSelect} max-w-[9rem]`}
                        disabled={update.isPending}
                        onChange={(event) => update.mutate({ task, payload: { assigneeId: event.target.value || null } })}
                        value={task.assigneeId ?? ''}
                      >
                        <option value="">담당자 없음</option>
                        {project.members.map((member) => (
                          <option key={member.userId} value={member.userId}>
                            {member.user.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <Badge tone={TASK_STATUS_META[task.status].tone}>{TASK_STATUS_META[task.status].label}</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </ProjectSection>
    </div>
  )
}
