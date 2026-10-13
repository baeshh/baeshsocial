import { OrganizationMemberStatus, OrganizationRole, UserRole, type Announcement } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'

export const announcementsRouter = Router()
export const announcementsAdminRouter = Router()

/** `all` = every user · `org_admins` = owners/admins of any organization · `organization` = one org's members. */
const AUDIENCES = ['all', 'org_admins', 'organization'] as const

const announcementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(5000),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  audience: z.enum(AUDIENCES).default('all'),
  organizationId: z.string().max(64).nullable().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
})

function serialize(announcement: Announcement) {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    severity: announcement.severity,
    audience: announcement.audience,
    organizationId: announcement.organizationId,
    publishedAt: announcement.publishedAt,
    expiresAt: announcement.expiresAt,
    createdAt: announcement.createdAt,
  }
}

announcementsRouter.get('/', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: authUser.id, status: OrganizationMemberStatus.ACTIVE },
      select: { organizationId: true, role: true },
    })
    const isOrgAdmin = memberships.some((m) => m.role === OrganizationRole.OWNER || m.role === OrganizationRole.ADMIN)
    const now = new Date()
    const announcements = await prisma.announcement.findMany({
      where: {
        publishedAt: { lte: now },
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          {
            OR: [
              { audience: 'all' },
              ...(isOrgAdmin ? [{ audience: 'org_admins' }] : []),
              { audience: 'organization', organizationId: { in: memberships.map((m) => m.organizationId) } },
            ],
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    })
    res.status(200).json({ announcements: announcements.map(serialize) })
  } catch (error) {
    next(error)
  }
})

announcementsAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

announcementsAdminRouter.get('/', async (_req, res, next) => {
  try {
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    res.status(200).json({ announcements: announcements.map(serialize) })
  } catch (error) {
    next(error)
  }
})

function validateAudience(input: { audience?: string; organizationId?: string | null }) {
  if (input.audience === 'organization' && !input.organizationId) throw new HttpError(400, '대상 조직을 선택하세요.')
}

announcementsAdminRouter.post('/', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = announcementSchema.parse(req.body)
    validateAudience(input)
    const announcement = await prisma.announcement.create({
      data: {
        ...input,
        organizationId: input.audience === 'organization' ? (input.organizationId ?? null) : null,
        publishedAt: input.publishedAt === undefined ? new Date() : input.publishedAt,
        expiresAt: input.expiresAt ?? null,
        createdById: authUser.id,
      },
    })
    await audit(req, res, { action: 'admin.announcement_create', targetType: 'announcement', targetId: announcement.id, metadata: { title: input.title } })
    res.status(201).json({ announcement: serialize(announcement) })
  } catch (error) {
    next(error)
  }
})

announcementsAdminRouter.patch('/:announcementId', async (req, res, next) => {
  try {
    const input = announcementSchema.partial().parse(req.body)
    validateAudience(input)
    const announcement = await prisma.announcement.update({ where: { id: String(req.params.announcementId) }, data: input })
    await audit(req, res, { action: 'admin.announcement_update', targetType: 'announcement', targetId: announcement.id, metadata: { fields: Object.keys(input) } })
    res.status(200).json({ announcement: serialize(announcement) })
  } catch (error) {
    next(error)
  }
})

announcementsAdminRouter.delete('/:announcementId', async (req, res, next) => {
  try {
    await prisma.announcement.delete({ where: { id: String(req.params.announcementId) } })
    await audit(req, res, { action: 'admin.announcement_delete', targetType: 'announcement', targetId: String(req.params.announcementId) })
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})
