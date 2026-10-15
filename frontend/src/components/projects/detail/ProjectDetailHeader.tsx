import { ArrowLeft, Eye, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { REGISTRATION_STATUS_META, VISIBILITY_META } from '../../../lib/programs'
import { PROJECT_STATUS_META, taskSummary } from '../../../lib/projectDisplay'
import { PROJECT_KIND_LABEL } from '../../../lib/projectSearch'
import type { Project } from '../../../types/project'
import { Badge } from '../../common/Badge'
import type { ProjectDetailContext } from './projectDetailContext'

function visibilityLabel(project: Pick<Project, 'visibility' | 'program'>) {
  const option = project.visibility.toLowerCase() as keyof typeof VISIBILITY_META
  if (option === 'public' && project.program && project.program.allowPublicProjects === false) {
    return `${VISIBILITY_META.team.label} (전체 공개 미허용)`
  }
  return VISIBILITY_META[option]?.label ?? project.visibility
}

export function ProjectDetailHeader({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, registration, guestViewer, restricted, isProgramStaff, can } = ctx
  const status = PROJECT_STATUS_META[project.status]
  const showTasks = can('tasks.view') && !restricted
  const tasks = taskSummary(project.tasks)
  const linkedRegistration = !project.program && registration && registration.status !== 'removed' && registration.status !== 'withdrawn' ? registration : null

  return (
    <header className="rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-5">
      <Link className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink-strong" to="/projects">
        <ArrowLeft aria-hidden size={16} />
        프로젝트 목록
      </Link>
      <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge icon={project.visibility === 'PRIVATE' ? <Lock aria-hidden size={12} /> : undefined} tone="gray">
              {visibilityLabel(project)}
            </Badge>
            <Badge tone={project.program ? 'green' : 'gray'}>{project.program ? PROJECT_KIND_LABEL.program : PROJECT_KIND_LABEL.personal}</Badge>
            {isProgramStaff ? (
              <Badge icon={<Eye aria-hidden size={12} />} tone="purple">
                기관 담당자 열람
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-2 break-words text-xl font-bold tracking-tight text-ink-strong sm:text-2xl">{project.title}</h1>
          {project.description ? <p className="mt-1 text-sm leading-6 text-ink-muted">{project.description}</p> : null}
          {project.program ? (
            <p className="mt-2 text-sm">
              <Link className="font-semibold text-success-700 hover:underline" to={`/org/${project.program.organization.id}/programs/${project.program.id}`}>
                {project.program.organization.name} · {project.program.title}
              </Link>
              {project.teamName ? <span className="text-ink-muted"> · {project.teamName}</span> : null}
            </p>
          ) : null}
          {linkedRegistration ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-body">
              프로그램 연결 요청
              <Badge tone={REGISTRATION_STATUS_META[linkedRegistration.status].tone}>{REGISTRATION_STATUS_META[linkedRegistration.status].label}</Badge>
              <span className="text-ink-muted">
                {linkedRegistration.program.organizationName} · {linkedRegistration.program.title}
              </span>
            </p>
          ) : null}
          {!project.program && registration?.status === 'rejected' && registration.reviewNote ? (
            <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-700">반려 사유: {registration.reviewNote}</p>
          ) : null}
          {!project.program && registration?.status === 'pending' ? (
            <p className="mt-2 text-xs text-ink-muted">담당자가 승인하면 이 프로젝트가 그대로 프로그램에 연결됩니다. 승인 전까지는 개인 프로젝트입니다.</p>
          ) : null}
          {guestViewer ? (
            <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-body">
              {restricted
                ? '팀장이 비공개로 설정한 프로젝트입니다. 팀장이 열람 권한을 지정하면 전체 내용을 볼 수 있습니다.'
                : '팀 멤버가 아니면 개요와 팀 구성만 볼 수 있습니다. 활동·파일·작업은 초대를 받은 팀원에게만 보입니다.'}
            </p>
          ) : null}
        </div>

        {!guestViewer ? (
          <div className="grid w-full shrink-0 grid-cols-2 gap-2 lg:w-72" aria-label="진행 요약" role="group">
            <div className="rounded-xl bg-surface-muted/70 p-3">
              <p className="text-xs font-semibold text-ink-muted">팀이 입력한 진행률</p>
              <p className="mt-0.5 text-lg font-bold text-ink-strong">{project.progress}%</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, project.progress))}%` }} />
              </div>
            </div>
            <div className="rounded-xl bg-surface-muted/70 p-3">
              <p className="text-xs font-semibold text-ink-muted">작업 완료</p>
              {showTasks ? (
                <>
                  <p className="mt-0.5 text-lg font-bold text-ink-strong">
                    {tasks.done}
                    <span className="text-sm font-semibold text-ink-muted">/{tasks.total}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {tasks.blocked > 0 ? `차단 ${tasks.blocked}` : '차단 없음'}
                    {tasks.overdue > 0 ? <span className="font-semibold text-danger-700"> · 마감 지남 {tasks.overdue}</span> : null}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-ink-muted">작업 열람 권한이 없습니다.</p>
              )}
            </div>
            <p className="col-span-2 text-[11px] leading-4 text-ink-muted">진행률은 팀이 설정에서 직접 입력한 값으로, 작업 완료 수로 자동 계산되지 않습니다.</p>
          </div>
        ) : null}
      </div>
    </header>
  )
}
