export type ProjectPermission =
  | 'project.view'
  | 'project.edit'
  | 'project.delete'
  | 'project.settings'
  | 'roles.manage'
  | 'members.invite'
  | 'members.remove'
  | 'members.assign_role'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.edit'
  | 'tasks.delete'
  | 'files.view'
  | 'files.upload'
  | 'files.delete'
  | 'activities.create'

export type ProjectRole = {
  id: string
  projectId: string
  name: string
  slug: string
  description: string | null
  permissions: ProjectPermission[]
  isSystem: boolean
  sortOrder: number
}

export type PermissionCatalogItem = {
  key: ProjectPermission
  label: string
}
