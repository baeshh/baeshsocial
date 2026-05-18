import { apiRequest } from '../lib/api'
import type { Project, ProjectInvite, TeamCandidates } from '../types/project'
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

export function getProjects(token: string) {
  return apiRequest<{ projects: Project[] }>('/projects', { token })
}

export function getProject(token: string, projectId: string) {
  return apiRequest<{
    project: Project
    pendingInvites: ProjectInvite[]
    myPermissions: ProjectPermission[]
    isOwner: boolean
  }>(`/projects/${projectId}`, {
    token,
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
