import { prisma } from '../config/prisma.js'

export const PROJECT_PERMISSIONS = [
  'project.view',
  'project.edit',
  'project.delete',
  'project.settings',
  'roles.manage',
  'members.invite',
  'members.remove',
  'members.assign_role',
  'tasks.view',
  'tasks.create',
  'tasks.edit',
  'tasks.delete',
  'files.view',
  'files.upload',
  'files.delete',
  'activities.create',
] as const

export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number]

export const ALL_PROJECT_PERMISSIONS: ProjectPermission[] = [...PROJECT_PERMISSIONS]

export const PROJECT_PERMISSION_LABELS: Record<ProjectPermission, string> = {
  'project.view': '프로젝트 보기',
  'project.edit': '프로젝트 정보 수정',
  'project.delete': '프로젝트 삭제',
  'project.settings': '진행·공개 설정',
  'roles.manage': '역할·권한 관리',
  'members.invite': '팀원 초대',
  'members.remove': '팀원 제거',
  'members.assign_role': '팀원 역할 변경',
  'tasks.view': '태스크 보기',
  'tasks.create': '태스크 생성',
  'tasks.edit': '태스크 수정',
  'tasks.delete': '태스크 삭제',
  'files.view': '파일 보기',
  'files.upload': '파일 업로드',
  'files.delete': '파일 삭제',
  'activities.create': '활동 기록 추가',
}

export type DefaultRoleTemplate = {
  name: string
  slug: string
  description: string
  permissions: ProjectPermission[]
  isSystem: boolean
  sortOrder: number
}

export const DEFAULT_PROJECT_ROLE_TEMPLATES: DefaultRoleTemplate[] = [
  {
    name: '소유자',
    slug: 'owner',
    description: '프로젝트의 모든 권한',
    permissions: ALL_PROJECT_PERMISSIONS,
    isSystem: true,
    sortOrder: 0,
  },
  {
    name: '관리자',
    slug: 'admin',
    description: '프로젝트 설정·팀·콘텐츠 관리',
    permissions: [
      'project.view',
      'project.edit',
      'project.settings',
      'roles.manage',
      'members.invite',
      'members.remove',
      'members.assign_role',
      'tasks.view',
      'tasks.create',
      'tasks.edit',
      'tasks.delete',
      'files.view',
      'files.upload',
      'files.delete',
      'activities.create',
    ],
    isSystem: true,
    sortOrder: 1,
  },
  {
    name: '편집자',
    slug: 'editor',
    description: '태스크·파일·활동 편집',
    permissions: [
      'project.view',
      'tasks.view',
      'tasks.create',
      'tasks.edit',
      'files.view',
      'files.upload',
      'activities.create',
    ],
    isSystem: true,
    sortOrder: 2,
  },
  {
    name: '뷰어',
    slug: 'viewer',
    description: '읽기 전용',
    permissions: ['project.view', 'tasks.view', 'files.view'],
    isSystem: true,
    sortOrder: 3,
  },
]

export function isValidPermission(value: string): value is ProjectPermission {
  return (PROJECT_PERMISSIONS as readonly string[]).includes(value)
}

export function sanitizePermissions(values: string[]): ProjectPermission[] {
  return [...new Set(values.filter(isValidPermission))]
}

export async function seedDefaultProjectRoles(projectId: string) {
  return prisma.projectRole.createMany({
    data: DEFAULT_PROJECT_ROLE_TEMPLATES.map((template) => ({
      projectId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      permissions: template.permissions,
      isSystem: template.isSystem,
      sortOrder: template.sortOrder,
    })),
  })
}

export async function getOwnerRoleId(projectId: string) {
  const role = await prisma.projectRole.findUnique({
    where: { projectId_slug: { projectId, slug: 'owner' } },
    select: { id: true },
  })
  return role?.id ?? null
}

export async function resolveUserProjectPermissions(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: {
          projectRole: {
            select: { permissions: true },
          },
        },
      },
    },
  })

  if (!project) {
    return { permissions: [] as ProjectPermission[], isOwner: false }
  }

  if (project.ownerId === userId) {
    return { permissions: ALL_PROJECT_PERMISSIONS, isOwner: true }
  }

  const memberPermissions = project.members[0]?.projectRole?.permissions ?? []
  return {
    permissions: sanitizePermissions(memberPermissions),
    isOwner: false,
  }
}

export async function userHasProjectPermission(
  projectId: string,
  userId: string,
  permission: ProjectPermission,
) {
  const { permissions } = await resolveUserProjectPermissions(projectId, userId)
  return permissions.includes(permission)
}

export async function requireProjectPermission(
  projectId: string,
  userId: string,
  permission: ProjectPermission,
) {
  const allowed = await userHasProjectPermission(projectId, userId, permission)
  if (!allowed) {
    throw new Error('PROJECT_FORBIDDEN')
  }
}
