import { ACTIVITY_TYPE_LABEL, dateTimeLabel, TASK_STATUS_META, taskDue } from '../../../lib/projectDisplay'
import { Badge } from '../../common/Badge'
import { ProjectLinksPanel } from '../ProjectLinksPanel'
import type { ProjectDetailContext, ProjectTabId } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const byDueDate = (a: { dueDate: string | null; createdAt: string }, b: { dueDate: string | null; createdAt: string }) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.createdAt.localeCompare(b.createdAt)

function MoreButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="min-h-9 text-sm font-semibold text-brand-700 hover:underline" onClick={onClick} type="button">
      {label}
    </button>
  )
}

export function ProjectOverviewTab({ ctx, onSelectTab }: { ctx: ProjectDetailContext; onSelectTab: (id: ProjectTabId) => void }) {
  const { project, can, guestViewer, restricted } = ctx
  const openTasks = project.tasks.filter((task) => task.status !== 'DONE').sort(byDueDate).slice(0, 3)
  const showTasks = can('tasks.view') && !restricted
  const showActivity = !guestViewer

  return (
    <div className="space-y-4">
      <ProjectSection title="목표와 소개">
        <div className="space-y-4 text-sm leading-6 text-ink-body">
          <div>
            <h3 className="text-xs font-bold text-ink-muted">목표</h3>
            <p className="mt-1 whitespace-pre-wrap">{project.objective ?? '아직 목표를 입력하지 않았습니다.'}</p>
          </div>
          {project.readme ? (
            <div>
              <h3 className="text-xs font-bold text-ink-muted">README</h3>
              <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-muted/60 p-3">{project.readme}</p>
            </div>
          ) : null}
          <div>
            <h3 className="text-xs font-bold text-ink-muted">기술스택</h3>
            {project.skills.length > 0 ? (
              <ul aria-label="기술스택" className="mt-1.5 flex flex-wrap gap-1.5">
                {project.skills.map((skill) => (
                  <li className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-ink-body" key={skill}>
                    {skill}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-ink-muted">아직 기술스택을 입력하지 않았습니다.</p>
            )}
          </div>
        </div>
      </ProjectSection>

      {showTasks ? (
        <ProjectSection actions={<MoreButton label="작업 전체 보기" onClick={() => onSelectTab('tasks')} />} title="다가오는 작업">
          {openTasks.length === 0 ? (
            <p className="text-sm text-ink-muted">{project.tasks.length === 0 ? '등록된 작업이 없습니다.' : '남은 작업이 없습니다.'}</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {openTasks.map((task) => {
                const due = taskDue(task)
                return (
                  <li className="flex flex-wrap items-center justify-between gap-2 py-2.5" key={task.id}>
                    <span className="min-w-0 text-sm font-semibold text-ink-strong">{task.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      <Badge tone={TASK_STATUS_META[task.status].tone}>{TASK_STATUS_META[task.status].label}</Badge>
                      {task.assignee ? <span>{task.assignee.name}</span> : null}
                      {due ? <span className={due.overdue ? 'font-semibold text-danger-700' : undefined}>{due.label}</span> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </ProjectSection>
      ) : null}

      {showActivity ? (
        <ProjectSection actions={<MoreButton label="활동 전체 보기" onClick={() => onSelectTab('activity')} />} title="최근 활동">
          {project.activities.length === 0 ? (
            <p className="text-sm text-ink-muted">아직 활동 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {project.activities.slice(0, 3).map((activity) => (
                <li className="py-2.5" key={activity.id}>
                  <p className="text-sm font-semibold text-ink-strong">{activity.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {ACTIVITY_TYPE_LABEL[activity.type]} · {activity.user?.name ?? '알 수 없음'} · {dateTimeLabel(activity.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ProjectSection>
      ) : null}

      <ProjectLinksPanel
        canEdit={can('project.edit') && project.program?.status !== 'ARCHIVED'}
        links={project.externalLinks ?? []}
        onChanged={ctx.invalidate}
        projectId={project.id}
        token={ctx.token}
      />
    </div>
  )
}
