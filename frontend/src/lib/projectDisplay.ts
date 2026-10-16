import type { ProjectActivityType, ProjectStatus, ProjectTask, ProjectTaskStatus } from '../types/project'
import type { ProjectPermission } from '../types/projectRole'
import { daysUntil, shortDateLabel } from './serviceDate'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'amber' | 'red'

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: '진행 중', tone: 'green' },
  PLANNING: { label: '기획 중', tone: 'purple' },
  COMPLETED: { label: '완료', tone: 'blue' },
  ARCHIVED: { label: '보관', tone: 'gray' },
}

/** List filter order. */
export const PROJECT_STATUSES: ProjectStatus[] = ['ACTIVE', 'PLANNING', 'COMPLETED', 'ARCHIVED']

export const TASK_STATUS_META: Record<ProjectTaskStatus, { label: string; tone: Tone }> = {
  TODO: { label: '할 일', tone: 'gray' },
  IN_PROGRESS: { label: '진행 중', tone: 'blue' },
  BLOCKED: { label: '차단됨', tone: 'red' },
  DONE: { label: '완료', tone: 'green' },
}

export const TASK_STATUSES: ProjectTaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']

export const ACTIVITY_TYPE_LABEL: Record<ProjectActivityType, string> = {
  UPDATE: '진행 업데이트',
  TASK: '작업',
  FILE: '파일',
  MILESTONE: '마일스톤',
  INSIGHT: '회고·인사이트',
}

/** Types a member can pick when writing an activity; TASK and FILE entries come from those features. */
export const WRITABLE_ACTIVITY_TYPES: ProjectActivityType[] = ['UPDATE', 'MILESTONE', 'INSIGHT']

/** Due date of an unfinished task relative to today in Korea. */
export function taskDue(task: Pick<ProjectTask, 'dueDate' | 'status'>, now = new Date()) {
  if (!task.dueDate) return null
  const dateLabel = shortDateLabel(task.dueDate)
  if (task.status === 'DONE') return { overdue: false, label: dateLabel }
  const days = daysUntil(task.dueDate, now)
  if (days < 0) return { overdue: true, label: `${dateLabel} · ${-days}일 지남` }
  if (days === 0) return { overdue: false, label: `${dateLabel} · 오늘 마감` }
  return { overdue: false, label: `${dateLabel} · D-${days}` }
}

export function taskSummary(tasks: Pick<ProjectTask, 'status' | 'dueDate'>[], now = new Date()) {
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === 'DONE').length,
    blocked: tasks.filter((task) => task.status === 'BLOCKED').length,
    overdue: tasks.filter((task) => taskDue(task, now)?.overdue).length,
  }
}

/** One plain-language line per permission group, so members can see what a role may do. */
export function permissionSummary(permissions: ProjectPermission[]) {
  const has = (permission: ProjectPermission) => permissions.includes(permission)
  const lines: string[] = []
  if (has('project.settings') || has('roles.manage')) lines.push('설정·역할 관리')
  if (has('members.invite') || has('members.assign_role') || has('members.remove')) lines.push('팀원 관리')
  if (has('tasks.create') || has('tasks.edit')) lines.push('작업 편집')
  else if (has('tasks.view')) lines.push('작업 보기')
  if (has('files.upload')) lines.push('파일 추가')
  else if (has('files.view')) lines.push('파일 보기')
  if (has('activities.create')) lines.push('활동 기록')
  return lines.length > 0 ? lines : ['개요 보기']
}

export const relativeUpdated = (iso: string, now = new Date()) => {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return '방금 수정'
  if (minutes < 60) return `${minutes}분 전 수정`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전 수정`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전 수정`
  return `${new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })} 수정`
}

export const dateTimeLabel = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
