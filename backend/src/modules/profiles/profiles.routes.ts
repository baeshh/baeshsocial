import { Prisma, ProjectVisibility } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { buildGrowthTimeline } from '../../utils/growthTimeline.js'
import { buildSkillInsights } from '../../utils/skillInsights.js'
import {
  awardSchema,
  careerSchema,
  certificateSchema,
  portfolioSchema,
  updateProfileSchema,
} from '../../validators/profile.validator.js'

export const profilesRouter = Router()

const profileInclude = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      coverUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  certificates: true,
  careers: true,
  awards: true,
  portfolios: true,
} as const

function toOptionalDate(value?: string | null) {
  return value ? new Date(value) : null
}

function toProfileData(input: ReturnType<typeof updateProfileSchema.parse>) {
  return {
    ...input,
    socialLinks: input.socialLinks === null ? Prisma.JsonNull : input.socialLinks,
  }
}

async function ensureProfile(userId: string) {
  return prisma.profile.upsert({
    where: { userId },
    update: {},
    create: { userId },
    include: profileInclude,
  })
}

async function requireProfileForUser(userId: string) {
  const profile = await prisma.profile.findUnique({ where: { userId } })
  if (!profile) {
    throw new Error('PROFILE_NOT_FOUND')
  }
  return profile
}

async function getProfilePayload(userId: string, viewerId?: string) {
  const profile = await ensureProfile(userId)
  const publicProjectWhere = { visibility: ProjectVisibility.PUBLIC }

  const [
    ownedProjects,
    memberProjects,
    verifiedRecords,
    programEnrollments,
    timelineOwnedProjects,
    timelineMemberships,
    timelineActivities,
    timelineVerifiedRecords,
    followerCount,
    followingCount,
    postCount,
    followRow,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        status: true,
        progress: true,
        skills: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.projectMember.findMany({
      where: {
        userId,
        project: { ownerId: { not: userId } },
      },
      orderBy: { joinedAt: 'desc' },
      take: 6,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            status: true,
            progress: true,
            skills: true,
            updatedAt: true,
          },
        },

      },
    }),
    prisma.verifiedRecord.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      take: 6,
      include: {
        project: {
          select: {
            id: true,
            title: true,
            slug: true,
          },
        },
      },
    }),
    prisma.opportunityEnrollment.findMany({
      where: { userId },
      orderBy: { appliedAt: 'desc' },
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            organization: true,
            type: true,
          },
        },
        certificate: {
          select: {
            id: true,
            verified: true,
            issuedAt: true,
          },
        },
      },
    }),
    prisma.project.findMany({
      where: { ownerId: userId, ...publicProjectWhere },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.projectMember.findMany({
      where: {
        userId,
        project: { ownerId: { not: userId }, ...publicProjectWhere },
      },
      orderBy: { joinedAt: 'desc' },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        project: { select: { title: true } },
      },
    }),
    prisma.projectActivity.findMany({
      where: {
        userId,
        project: publicProjectWhere,
        NOT: { type: 'MILESTONE', title: 'Project created' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        project: { select: { title: true } },
      },
    }),
    prisma.verifiedRecord.findMany({
      where: { userId, project: publicProjectWhere },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        role: true,
        contributionSummary: true,
        issuedAt: true,
        status: true,
        project: { select: { title: true } },
      },
    }),
    prisma.userFollow.count({ where: { followingId: userId } }),
    prisma.userFollow.count({ where: { followerId: userId } }),
    prisma.post.count({ where: { authorId: userId } }),
    viewerId && viewerId !== userId
      ? prisma.userFollow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: userId,
            },
          },
        })
      : Promise.resolve(null),
  ])

  const ownedProjectIds = new Set(ownedProjects.map((project) => project.id))

  const joinedProjects = memberProjects
    .filter((membership) => !ownedProjectIds.has(membership.project.id))
    .map((membership) => ({
      ...membership.project,
      memberRole: membership.role,
      contribution: membership.contribution,
    }))

  const allProjects = [...ownedProjects, ...joinedProjects]
  const completedPrograms = programEnrollments.filter(
    (enrollment) => enrollment.status === 'COMPLETED',
  )

  return {
    profile,
    projects: allProjects,
    verifiedRecords,
    programEnrollments,
    stats: {
      followerCount,
      followingCount,
      postCount,
    },
    isFollowing: Boolean(followRow),
    isOwnProfile: !viewerId || viewerId === userId,
    aiSkillInsights: buildSkillInsights({
      profileSkills: profile.skills,
      trustScore: profile.trustScore,
      projects: allProjects,
      verifiedCount: verifiedRecords.filter((record) => record.status === 'VERIFIED').length,
      certificateCount: profile.certificates.length,
      completedProgramCount: completedPrograms.length,
      careerCount: profile.careers.length,
    }),
    growthTimeline: buildGrowthTimeline({
      profileCreatedAt: profile.createdAt,
      certificates: profile.certificates,
      careers: profile.careers,
      awards: profile.awards,
      ownedProjects: timelineOwnedProjects,
      memberships: timelineMemberships,
      activities: timelineActivities,
      verifiedRecords: timelineVerifiedRecords,
      programEnrollments: completedPrograms.map((enrollment) => ({
        id: enrollment.id,
        completedAt: enrollment.completedAt,
        opportunity: enrollment.opportunity,
      })),
    }),
  }
}

profilesRouter.get('/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    res.status(200).json(await getProfilePayload(authUser.id, authUser.id))
  } catch (error) {
    next(error)
  }
})

profilesRouter.patch('/me', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = updateProfileSchema.parse(req.body)
    const profileData = toProfileData(input)
    const profile = await prisma.profile.upsert({
      where: { userId: authUser.id },
      create: {
        userId: authUser.id,
        ...profileData,
      },
      update: profileData,
      include: profileInclude,
    })

    res.status(200).json({ profile })
  } catch (error) {
    next(error)
  }
})

profilesRouter.get('/public/:userId', async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const payload = await getProfilePayload(userId)
    const publicProjectRows = await prisma.project.findMany({
      where: {
        visibility: ProjectVisibility.PUBLIC,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    })
    const publicProjectIds = new Set(publicProjectRows.map((row) => row.id))
    const { email: _email, ...publicUser } = payload.profile.user

    res.status(200).json({
      ...payload,
      profile: {
        ...payload.profile,
        user: publicUser,
      },
      projects: payload.projects.filter((project) => publicProjectIds.has(project.id)),
      isFollowing: false,
      isOwnProfile: false,
    })
  } catch (error) {
    next(error)
  }
})

profilesRouter.get('/:userId', authenticate, async (req, res, next) => {
  try {
    const userId = String(req.params.userId)
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const authUser = res.locals.user as AuthTokenPayload
    res.status(200).json(await getProfilePayload(userId, authUser.id))
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
        verified: input.verified,
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
