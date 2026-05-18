import { Router, type Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  ALL_PROJECT_PERMISSIONS,
  PROJECT_PERMISSION_LABELS,
  requireProjectPermission,
  sanitizePermissions,
} from '../../utils/projectPermissions.js'
import { getProjectRoleById } from '../../utils/projectRoles.js'
import {
  assignMemberRoleSchema,
  projectRoleSchema,
  updateProjectRoleSchema,
} from '../../validators/project.validator.js'

function handleRoleError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === 'PROJECT_FORBIDDEN') {
    res.status(403).json({ message: '이 작업을 수행할 권한이 없습니다.' })
    return true
  }
  if (error instanceof Error && error.message === 'ROLE_NOT_FOUND') {
    res.status(404).json({ message: '역할을 찾을 수 없습니다.' })
    return true
  }
  if (error instanceof Error && error.message === 'ROLE_SYSTEM_LOCKED') {
    res.status(400).json({ message: '시스템 기본 역할은 삭제할 수 없습니다.' })
    return true
  }
  if (error instanceof Error && error.message === 'ROLE_IN_USE') {
    res.status(400).json({ message: '멤버에게 할당된 역할은 삭제할 수 없습니다.' })
    return true
  }
  if (error instanceof Error && error.message === 'ROLE_OWNER_RESERVED') {
    res.status(400).json({ message: '소유자 역할은 초대·할당할 수 없습니다.' })
    return true
  }
  return false
}

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

export function registerProjectRoleRoutes(router: Router) {
  router.get('/permission-catalog', authenticate, (_req, res) => {
    res.status(200).json({
      permissions: ALL_PROJECT_PERMISSIONS.map((key) => ({
        key,
        label: PROJECT_PERMISSION_LABELS[key],
      })),
    })
  })

  router.get('/:id/roles', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const projectId = String(req.params.id)
      await requireProjectPermission(projectId, authUser.id, 'project.view')

      const roles = await prisma.projectRole.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: roleSelect,
      })

      res.status(200).json({ roles })
    } catch (error) {
      if (handleRoleError(error, res)) {
        return
      }
      next(error)
    }
  })

  router.post('/:id/roles', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const projectId = String(req.params.id)
      await requireProjectPermission(projectId, authUser.id, 'roles.manage')
      const input = projectRoleSchema.parse(req.body)

      const slug = input.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9가-힣-]/g, '')
        .slice(0, 40)

      const existingSlug = await prisma.projectRole.findUnique({
        where: { projectId_slug: { projectId, slug: slug || 'custom-role' } },
      })

      const role = await prisma.projectRole.create({
        data: {
          projectId,
          name: input.name.trim(),
          slug: existingSlug ? `custom-${Date.now()}` : slug || `custom-${Date.now()}`,
          description: input.description ?? null,
          permissions: sanitizePermissions(input.permissions),
          isSystem: false,
          sortOrder: 10,
        },
        select: roleSelect,
      })

      res.status(201).json({ role })
    } catch (error) {
      if (handleRoleError(error, res)) {
        return
      }
      next(error)
    }
  })

  router.patch('/:id/roles/:roleId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const projectId = String(req.params.id)
      const roleId = String(req.params.roleId)
      await requireProjectPermission(projectId, authUser.id, 'roles.manage')
      const input = updateProjectRoleSchema.parse(req.body)

      const existing = await getProjectRoleById(projectId, roleId)
      if (!existing) {
        throw new Error('ROLE_NOT_FOUND')
      }

      if (existing.slug === 'owner') {
        throw new Error('ROLE_SYSTEM_LOCKED')
      }

      const role = await prisma.projectRole.update({
        where: { id: roleId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.permissions !== undefined
            ? { permissions: sanitizePermissions(input.permissions) }
            : {}),
        },
        select: roleSelect,
      })

      if (input.name !== undefined) {
        await prisma.projectMember.updateMany({
          where: { projectId, roleId },
          data: { role: role.name },
        })
        await prisma.projectInvite.updateMany({
          where: { projectId, roleId, status: 'PENDING' },
          data: { role: role.name },
        })
      }

      res.status(200).json({ role })
    } catch (error) {
      if (handleRoleError(error, res)) {
        return
      }
      next(error)
    }
  })

  router.delete('/:id/roles/:roleId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const projectId = String(req.params.id)
      const roleId = String(req.params.roleId)
      await requireProjectPermission(projectId, authUser.id, 'roles.manage')

      const existing = await getProjectRoleById(projectId, roleId)
      if (!existing) {
        throw new Error('ROLE_NOT_FOUND')
      }

      if (existing.isSystem) {
        throw new Error('ROLE_SYSTEM_LOCKED')
      }

      const usageCount = await prisma.projectMember.count({ where: { roleId } })
      if (usageCount > 0) {
        throw new Error('ROLE_IN_USE')
      }

      await prisma.projectRole.delete({ where: { id: roleId } })
      res.status(204).send()
    } catch (error) {
      if (handleRoleError(error, res)) {
        return
      }
      next(error)
    }
  })

  router.patch('/:id/members/:memberId/role', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const projectId = String(req.params.id)
      const memberId = String(req.params.memberId)
      await requireProjectPermission(projectId, authUser.id, 'members.assign_role')
      const input = assignMemberRoleSchema.parse(req.body)

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { ownerId: true },
      })

      if (!project) {
        throw new Error('ROLE_NOT_FOUND')
      }

      const member = await prisma.projectMember.findFirst({
        where: { id: memberId, projectId },
      })

      if (!member) {
        throw new Error('ROLE_NOT_FOUND')
      }

      if (member.userId === project.ownerId) {
        res.status(400).json({ message: '프로젝트 소유자의 역할은 변경할 수 없습니다.' })
        return
      }

      const role = await getProjectRoleById(projectId, input.roleId)
      if (!role) {
        throw new Error('ROLE_NOT_FOUND')
      }

      if (role.slug === 'owner') {
        throw new Error('ROLE_OWNER_RESERVED')
      }

      const updated = await prisma.projectMember.update({
        where: { id: memberId },
        data: { roleId: role.id, role: role.name },
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          projectRole: { select: roleSelect },
        },
      })

      res.status(200).json({ member: updated })
    } catch (error) {
      if (handleRoleError(error, res)) {
        return
      }
      next(error)
    }
  })
}
