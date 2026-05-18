import { prisma } from '../config/prisma.js'

const roleSelect = {
  id: true,
  projectId: true,
  name: true,
  slug: true,
  description: true,
  permissions: true,
  isSystem: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const

export async function getProjectRoleById(projectId: string, roleId: string) {
  return prisma.projectRole.findFirst({
    where: { id: roleId, projectId },
    select: roleSelect,
  })
}

export async function getDefaultInviteRole(projectId: string) {
  return prisma.projectRole.findFirst({
    where: { projectId, slug: 'editor' },
    select: roleSelect,
  })
}

export function roleSnapshot(role: { id: string; name: string }) {
  return { roleId: role.id, role: role.name }
}
