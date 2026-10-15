import { Lock, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PROJECT_STATUS_META, relativeUpdated, TASK_STATUS_META, taskDue } from '../../lib/projectDisplay'
import { PROJECT_KIND_LABEL } from '../../lib/projectSearch'
import type { ProjectSummary } from '../../types/project'
import { Badge } from '../common/Badge'

function NextTaskLine({ project }: { project: ProjectSummary }) {
  const { tasks, doneTasks } = project.counts
  if (project.nextTask) {
    const due = taskDue(project.nextTask)
    return (
      <p className="flex min-w-0 items-baseline gap-1.5 text-xs text-ink-body">
        <span className="shrink-0 font-semibold text-ink-strong">다음 작업</span>
        <span className="truncate">{project.nextTask.title}</span>
        <span className="shrink-0 text-ink-muted">· {TASK_STATUS_META[project.nextTask.status].label}</span>
        {due ? <span className={`shrink-0 ${due.overdue ? 'font-semibold text-danger-700' : 'text-ink-muted'}`}>· {due.label}</span> : null}
      </p>
    )
  }
  // Without a next task the counts tell "none open" apart from "not allowed to see tasks".
  if (project.restricted) return null
  if (tasks === 0) return <p className="text-xs text-ink-muted">등록된 작업이 없습니다.</p>
  if (doneTasks === tasks) return <p className="text-xs text-ink-muted">모든 작업을 완료했습니다.</p>
  return null
}

export function ProjectListCard({ project }: { project: ProjectSummary }) {
  const status = PROJECT_STATUS_META[project.status]
  const { tasks, doneTasks, members } = project.counts

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-surface-border bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge tone={project.program ? 'green' : 'gray'}>{project.program ? PROJECT_KIND_LABEL.program : PROJECT_KIND_LABEL.personal}</Badge>
        {project.restricted ? (
          <Badge icon={<Lock aria-hidden size={12} />} tone="amber">
            열람 제한
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-2 text-base font-bold leading-snug text-ink-strong">
        <Link className="hover:text-brand-700 focus-visible:underline focus-visible:outline-none" to={`/projects/${project.id}`}>
          {project.title}
        </Link>
      </h3>
      {project.program ? (
        <p className="mt-0.5 truncate text-xs font-semibold text-success-700">
          {project.program.organization.name} · {project.program.title}
          {project.teamName ? ` · ${project.teamName}` : ''}
        </p>
      ) : null}
      <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-ink-muted">{project.description ?? '프로젝트 설명이 없습니다.'}</p>

      <div className="mt-3 space-y-1.5 rounded-xl bg-surface-muted/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-ink-body">팀이 입력한 진행률</span>
          <span className="font-bold text-ink-strong">{project.progress}%</span>
        </div>
        <div
          aria-label="팀이 입력한 진행률"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={project.progress}
          className="h-1.5 overflow-hidden rounded-full bg-white"
          role="progressbar"
        >
          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} />
        </div>
        {!project.restricted ? (
          <p className="text-xs text-ink-body">
            작업 완료 <span className="font-semibold text-ink-strong">{doneTasks}</span>/{tasks}
          </p>
        ) : null}
        <NextTaskLine project={project} />
        {project.restricted ? <p className="text-xs text-warning-700">비공개 프로젝트입니다. 팀장이 열람을 허용하면 내용을 볼 수 있습니다.</p> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          {project.myRole?.name ? <span className="font-semibold text-ink-body">내 역할 {project.myRole.name}</span> : null}
          <span className="inline-flex items-center gap-1">
            <UsersRound aria-hidden size={12} />
            {members}명
          </span>
          <span>{relativeUpdated(project.updatedAt)}</span>
        </p>
        <Link
          aria-label={`${project.title} 상세 보기`}
          className="inline-flex min-h-9 items-center rounded-lg border border-surface-border px-3 text-sm font-semibold text-ink-strong transition hover:border-brand-200 hover:text-brand-700"
          to={`/projects/${project.id}`}
        >
          상세 보기
        </Link>
      </div>
    </article>
  )
}
