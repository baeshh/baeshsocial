import type { ProjectPermission } from '../types/projectRole'

export function hasProjectPermission(
  permissions: ProjectPermission[] | undefined,
  permission: ProjectPermission,
) {
  return permissions?.includes(permission) ?? false
}

export const PERMISSION_GROUPS: Array<{
  title: string
  permissions: ProjectPermission[]
}> = [
  {
    title: '프로젝트',
    permissions: ['project.view', 'project.edit', 'project.delete', 'project.settings'],
  },
  {
    title: '역할·팀',
    permissions: ['roles.manage', 'members.invite', 'members.remove', 'members.assign_role'],
  },
  {
    title: '태스크',
    permissions: ['tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete'],
  },
  {
    title: '파일·활동',
    permissions: ['files.view', 'files.upload', 'files.delete', 'activities.create'],
  },
]
