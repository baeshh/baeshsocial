import { Prisma } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { decodeCursor } from '../../utils/pagination.js'
import { recordProfileView } from '../../utils/peopleRecommendations.js'
import {
  awardSchema,
  careerSchema,
  certificateSchema,
  featuredProjectsSchema,
  portfolioSchema,
  profileHistoryQuerySchema,
  profileProjectsQuerySchema,
  updateProfileSchema,
} from '../../validators/profile.validator.js'
import {
  buildProfileOverview,
  involvementWhere,
  listProfileHistory,
  listProfileHistoryPage,
  listProfileProjects,
  requireProfileDetails,
  resolveProfileViewer,
} from './profileData.js'

export const profilesRouter = Router()

function toOptionalDate(value?: string | null) {
  return value ? new Date(value) : null
}

function viewerIdOf(res: Response) {
  return (res.locals.user as AuthTokenPayload | undefined)?.id ?? null
}

async function ensureProfile(userId: string) {
  return prisma.profile.upsert({ where: { userId }, update: {}, create: { userId }, select: { id: true } })
}

async function requireProfileForUser(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } })
  if (!profile) {
    throw new HttpError(404, '프로필을 찾을 수 없습니다.')
  }
  return profile
}

profilesRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    res.status(200).json(await buildProfileOverview(await resolveProfileViewer(authUser.id, authUser.id)))
  } catch (error) {
    next(error)
  }
})

profilesRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { socialLinks, ...input } = updateProfileSchema.parse(req.body)
    const data = {
      ...input,
      ...(socialLinks !== undefined ? { socialLinks: socialLinks === null ? Prisma.JsonNull : socialLinks } : {}),
      ...(input.talentSearchOptIn !== undefined ? { talentSearchOptInAt: input.talentSearchOptIn ? new Date() : null } : {}),
    }
    await prisma.profile.upsert({
      where: { userId: authUser.id },
      create: { userId: authUser.id, ...data },
      update: data,
    })
    res.status(200).json(await buildProfileOverview(await resolveProfileViewer(authUser.id, authUser.id)))
  } catch (error) {
    next(error)
  }
})

profilesRouter.put('/me/featured-projects', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { projectIds: requested } = featuredProjectsSchema.parse(req.body)
    const [current, eligibleRows, hiddenRows] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: authUser.id }, select: { featuredProjectIds: true } }),
      requested.length
        ? prisma.project.findMany({
            where: { AND: [involvementWhere(authUser.id), { id: { in: requested } }] },
            select: { id: true },
          })
        : Promise.resolve([]),
      prisma.projectDisplayPreference.findMany({ where: { userId: authUser.id, projectId: { in: requested } }, select: { projectId: true } }),
    ])
    const eligible = new Set(eligibleRows.map((row) => row.id))
    const hidden = new Set(hiddenRows.map((row) => row.projectId))
    const previouslyPinned = new Set(current?.featuredProjectIds ?? [])
    // Pins the user no longer qualifies for (e.g. left the team) are dropped instead of blocking the update.
    if (requested.some((id) => !eligible.has(id) && !previouslyPinned.has(id))) {
      res.status(400).json({ message: '직접 참여한 프로젝트만 대표 프로젝트로 고정할 수 있습니다.' })
      return
    }
    if (requested.some((id) => hidden.has(id) && !previouslyPinned.has(id))) {
      res.status(400).json({ message: '프로필에서 숨긴 프로젝트는 대표 프로젝트로 고정할 수 없습니다. 먼저 다시 표시해 주세요.' })
      return
    }
    const projectIds = requested.filter((id) => eligible.has(id))
    const profile = await prisma.profile.upsert({
      where: { userId: authUser.id },
      create: { userId: authUser.id, featuredProjectIds: projectIds },
      update: { featuredProjectIds: projectIds },
      select: { featuredProjectIds: true },
    })
    res.status(200).json({ featuredProjectIds: profile.featuredProjectIds })
  } catch (error) {
    next(error)
  }
})

/* Viewer-aware read APIs. Anonymous access works for PUBLIC profiles (used by the share page). */

profilesRouter.get('/:userId/overview', optionalAuthenticate, async (req, res, next) => {
  try {
    const viewerId = viewerIdOf(res)
    const viewer = await resolveProfileViewer(String(req.params.userId), viewerId)
    if (viewerId && !viewer.isSelf) {
      void recordProfileView(viewerId, viewer.userId).catch((error) => {
        console.error('Profile view tracking failed:', error)
      })
    }
    res.status(200).json(await buildProfileOverview(viewer))
  } catch (error) {
    next(error)
  }
})

profilesRouter.get('/:userId/projects', optionalAuthenticate, async (req, res, next) => {
  try {
    const viewer = await resolveProfileViewer(String(req.params.userId), viewerIdOf(res))
    requireProfileDetails(viewer)
    const query = profileProjectsQuerySchema.parse(req.query)
    const page = await listProfileProjects(viewer, {
      limit: query.limit,
      cursor: decodeCursor(query.cursor),
      filter: query.filter,
    })
    res.status(200).json({ projects: page.items, nextCursor: page.nextCursor })
  } catch (error) {
    next(error)
  }
})

profilesRouter.get('/:userId/history', optionalAuthenticate, async (req, res, next) => {
  try {
    const viewer = await resolveProfileViewer(String(req.params.userId), viewerIdOf(res))
    requireProfileDetails(viewer)
    const query = profileHistoryQuerySchema.parse(req.query)
    if (query.page) {
      res.status(200).json(await listProfileHistoryPage(viewer, { type: query.type, limit: query.limit, page: query.page }))
      return
    }
    const page = await listProfileHistory(viewer, {
      type: query.type,
      limit: query.limit,
      cursor: decodeCursor(query.cursor),
    })
    res.status(200).json({ items: page.items, nextCursor: page.nextCursor })
  } catch (error) {
    next(error)
  }
})

profilesRouter.post('/me/certificates', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await ensureProfile(authUser.id)
    const input = certificateSchema.parse(req.body)
    const certificate = await prisma.certificate.create({
      data: {
        profileId: profile.id,
        title: input.title,
        issuer: input.issuer,
        issuedAt: toOptionalDate(input.issuedAt),
        credentialUrl: input.credentialUrl,
        verified: false,
      },
    })

    res.status(201).json({ certificate })
  } catch (error) {
    next(error)
  }
})

profilesRouter.post('/me/careers', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await ensureProfile(authUser.id)
    const input = careerSchema.parse(req.body)
    const career = await prisma.career.create({
      data: {
        profileId: profile.id,
        company: input.company,
        position: input.position,
        startDate: toOptionalDate(input.startDate),
        endDate: toOptionalDate(input.endDate),
        description: input.description,
      },
    })

    res.status(201).json({ career })
  } catch (error) {
    next(error)
  }
})

profilesRouter.post('/me/awards', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await ensureProfile(authUser.id)
    const input = awardSchema.parse(req.body)
    const award = await prisma.award.create({
      data: {
        profileId: profile.id,
        title: input.title,
        issuer: input.issuer,
        awardedAt: toOptionalDate(input.awardedAt),
        description: input.description,
      },
    })

    res.status(201).json({ award })
  } catch (error) {
    next(error)
  }
})

profilesRouter.patch('/me/certificates/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await requireProfileForUser(authUser.id)
    const certificateId = String(req.params.id)
    const input = certificateSchema.parse(req.body)

    const existing = await prisma.certificate.findFirst({
      where: { id: certificateId, profileId: profile.id },
    })

    if (!existing) {
      res.status(404).json({ message: '자격/수료 이력을 찾을 수 없습니다.' })
      return
    }

    if (existing.source === 'PROGRAM') {
      res.status(403).json({ message: '프로그램 수료로 생성된 이력은 수정할 수 없습니다.' })
      return
    }

    const certificate = await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        title: input.title,
        issuer: input.issuer,
        issuedAt: toOptionalDate(input.issuedAt),
        credentialUrl: input.credentialUrl,
      },
    })

    res.status(200).json({ certificate })
  } catch (error) {
    next(error)
  }
})

profilesRouter.patch('/me/careers/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await requireProfileForUser(authUser.id)
    const careerId = String(req.params.id)
    const input = careerSchema.parse(req.body)

    const existing = await prisma.career.findFirst({
      where: { id: careerId, profileId: profile.id },
    })

    if (!existing) {
      res.status(404).json({ message: '경력 이력을 찾을 수 없습니다.' })
      return
    }

    const career = await prisma.career.update({
      where: { id: careerId },
      data: {
        company: input.company,
        position: input.position,
        startDate: toOptionalDate(input.startDate),
        endDate: toOptionalDate(input.endDate),
        description: input.description,
      },
    })

    res.status(200).json({ career })
  } catch (error) {
    next(error)
  }
})

profilesRouter.patch('/me/awards/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await requireProfileForUser(authUser.id)
    const awardId = String(req.params.id)
    const input = awardSchema.parse(req.body)

    const existing = await prisma.award.findFirst({
      where: { id: awardId, profileId: profile.id },
    })

    if (!existing) {
      res.status(404).json({ message: '수상 이력을 찾을 수 없습니다.' })
      return
    }

    const award = await prisma.award.update({
      where: { id: awardId },
      data: {
        title: input.title,
        issuer: input.issuer,
        awardedAt: toOptionalDate(input.awardedAt),
        description: input.description,
      },
    })

    res.status(200).json({ award })
  } catch (error) {
    next(error)
  }
})

profilesRouter.post('/me/portfolios', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await ensureProfile(authUser.id)
    const input = portfolioSchema.parse(req.body)
    const portfolio = await prisma.portfolio.create({
      data: {
        profileId: profile.id,
        title: input.title,
        description: input.description,
        url: input.url,
        imageUrl: input.imageUrl,
      },
    })

    res.status(201).json({ portfolio })
  } catch (error) {
    next(error)
  }
})

const deletableHistory = {
  certificates: {
    find: (id: string, profileId: string) =>
      prisma.certificate.findFirst({ where: { id, profileId }, select: { id: true, source: true } }),
    remove: (id: string) => prisma.certificate.delete({ where: { id } }),
  },
  careers: {
    find: (id: string, profileId: string) => prisma.career.findFirst({ where: { id, profileId }, select: { id: true } }),
    remove: (id: string) => prisma.career.delete({ where: { id } }),
  },
  awards: {
    find: (id: string, profileId: string) => prisma.award.findFirst({ where: { id, profileId }, select: { id: true } }),
    remove: (id: string) => prisma.award.delete({ where: { id } }),
  },
} as const

for (const [segment, handlers] of Object.entries(deletableHistory)) {
  profilesRouter.delete(`/me/${segment}/:id`, authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const profile = await requireProfileForUser(authUser.id)
      const id = String(req.params.id)
      const existing = await handlers.find(id, profile.id)
      if (!existing) {
        res.status(404).json({ message: '이력을 찾을 수 없습니다.' })
        return
      }
      if ('source' in existing && existing.source === 'PROGRAM') {
        res.status(403).json({ message: '프로그램 수료로 생성된 이력은 삭제할 수 없습니다.' })
        return
      }
      await handlers.remove(id)
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })
}
