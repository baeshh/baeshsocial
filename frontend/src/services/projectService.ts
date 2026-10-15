import { apiRequest, withQuery } from '../lib/api'
import type { ProjectLink, ProjectLinkType } from '../types/profile'
import type { Project, ProjectInvite, ProjectRegistrationBrief, ProjectSummary, TeamCandidates } from '../types/project'
import type { PermissionCatalogItem, ProjectPermission, ProjectRole } from '../types/projectRole'

export type ProjectPayload = {
  title: string
  description?: string | null
  objective?: string | null
  readme?: string | null
  status?: 'planning' | 'active' | 'completed' | 'archived'
  progress?: number
  visibility?: 'private' | 'team' | 'public'
  skills?: string[]
}

export type MemberPayload = {
  email: string
  role: string
  contribution?: string | null
}

export type InvitePayload = {
  userId: string
  roleId: string
  contribution?: string | null
}

export type ProjectRolePayload = {
  name: string
  description?: string | null
  permissions: ProjectPermission[]
}

export type TaskPayload = {
  title: string
  description?: string | null
  status?: 'todo' | 'in_progress' | 'done' | 'blocked'
  assigneeId?: string | null
  dueDate?: string | null
}

export type ActivityPayload = {
  type?: 'update' | 'task' | 'file' | 'milestone' | 'insight'
  title: string
  description?: string | null
}

export type FilePayload = {
  name: string
  url: string
  fileType: string
}

export type ProjectListParams = {
  cursor?: string | null
  limit?: number
  q?: string
  status?: string
  kind?: 'personal' | 'program'
  sort?: 'updated' | 'created'
}

export function getProjects(token: string, params: ProjectListParams = {}) {
  return apiRequest<{
    projects: ProjectSummary[]
    nextCursor: string | null
    /** Totals across every page for the search and kind filters (not status); only sent with the first page. */
    statusCounts?: Record<ProjectSummary['status'], number>
  }>(
    withQuery('/projects', {
      limit: params.limit,
      cursor: params.cursor,
      q: params.q,
      status: params.status,
      kind: params.kind,
      sort: params.sort === 'updated' ? undefined : params.sort,
    }),
    { token },
  )
}

export type ProjectLinkPayload = {
  url: string
  type?: ProjectLinkType
  label?: string | null
  description?: string | null
}

export function getProjectLinks(token: string, projectId: string) {
  return apiRequest<{ links: ProjectLink[] }>(`/projects/${projectId}/links`, { token })
}

export function addProjectLink(token: string, projectId: string, payload: ProjectLinkPayload) {
  return apiRequest<{ link: ProjectLink }>(`/projects/${projectId}/links`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateProjectLink(
  token: string,
  projectId: string,
  linkId: string,
  payload: Partial<Omit<ProjectLinkPayload, 'url' | 'type'>>,
) {
  return apiRequest<{ link: ProjectLink }>(`/projects/${projectId}/links/${linkId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteProjectLink(token: string, projectId: string, linkId: string) {
  return apiRequest<void>(`/projects/${projectId}/links/${linkId}`, { method: 'DELETE', token })
}

export function getProject(token: string, projectId: string) {
  return apiRequest<{
    project: Project
    pendingInvites: ProjectInvite[]
    myPermissions: ProjectPermission[]
    isOwner: boolean
    isGuestViewer?: boolean
    isLeader?: boolean
    isProgramStaff?: boolean
    restricted?: boolean
    registration?: ProjectRegistrationBrief | null
  }>(`/projects/${projectId}`, {
    token,
  })
}

export function updateProjectVisibility(token: string, projectId: string, visibility: 'private' | 'team' | 'public') {
  return apiRequest<{ id: string; visibility: string }>(`/projects/${projectId}/visibility`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ visibility }),
  })
}

export function setMemberPrivateAccess(token: string, projectId: string, memberId: string, allowed: boolean) {
  return apiRequest<{ id: string; privateAccess: boolean }>(`/projects/${projectId}/members/${memberId}/private-access`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ allowed }),
  })
}

export function getPermissionCatalog(token: string) {
  return apiRequest<{ permissions: PermissionCatalogItem[] }>('/projects/permission-catalog', {
    token,
  })
}

export function getProjectRoles(token: string, projectId: string) {
  return apiRequest<{ roles: ProjectRole[] }>(`/projects/${projectId}/roles`, { token })
}

export function createProjectRole(token: string, projectId: string, payload: ProjectRolePayload) {
  return apiRequest<{ role: ProjectRole }>(`/projects/${projectId}/roles`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateProjectRole(
  token: string,
  projectId: string,
  roleId: string,
  payload: Partial<ProjectRolePayload>,
) {
  return apiRequest<{ role: ProjectRole }>(`/projects/${projectId}/roles/${roleId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteProjectRole(token: string, projectId: string, roleId: string) {
  return apiRequest<void>(`/projects/${projectId}/roles/${roleId}`, {
    method: 'DELETE',
    token,
  })
}

export function assignMemberRole(token: string, projectId: string, memberId: string, roleId: string) {
  return apiRequest(`/projects/${projectId}/members/${memberId}/role`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ roleId }),
  })
}

export function getProjectTeamCandidates(token: string, projectId: string) {
  return apiRequest<TeamCandidates>(`/projects/${projectId}/team-candidates`, { token })
}

export function inviteProjectMember(token: string, projectId: string, payload: InvitePayload) {
  return apiRequest<{ invite: ProjectInvite }>(`/projects/${projectId}/invites`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function acceptProjectInvite(token: string, inviteId: string) {
  return apiRequest<{ member: unknown; projectId: string }>(`/projects/invites/${inviteId}/accept`, {
    method: 'POST',
    token,
  })
}

export function declineProjectInvite(token: string, inviteId: string) {
  return apiRequest<{ ok: boolean }>(`/projects/invites/${inviteId}/decline`, {
    method: 'POST',
    token,
  })
}

export function createProject(token: string, payload: ProjectPayload) {
  return apiRequest<{ project: Project }>('/projects', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateProject(token: string, projectId: string, payload: Partial<ProjectPayload>) {
  return apiRequest<{ project: Project }>(`/projects/${projectId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function addProjectMember(token: string, projectId: string, payload: MemberPayload) {
  return apiRequest(`/projects/${projectId}/members`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function addProjectTask(token: string, projectId: string, payload: TaskPayload) {
  return apiRequest(`/projects/${projectId}/tasks`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateProjectTask(
  token: string,
  projectId: string,
  taskId: string,
  payload: Partial<TaskPayload>,
) {
  return apiRequest(`/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function addProjectActivity(token: string, projectId: string, payload: ActivityPayload) {
  return apiRequest(`/projects/${projectId}/activities`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function addProjectFile(token: string, projectId: string, payload: FilePayload) {
  return apiRequest(`/projects/${projectId}/files`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteProject(token: string, projectId: string, password: string) {
  return apiRequest<void>(`/projects/${projectId}`, {
    method: 'DELETE',
    token,
    body: JSON.stringify({ password }),
  })
}

export function leaveProject(token: string, projectId: string) {
  return apiRequest<void>(`/projects/${projectId}/members/me`, {
    method: 'DELETE',
    token,
  })
}
