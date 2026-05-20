import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { getRecommendedPeople } from '../../utils/peopleRecommendations.js'

export const searchRouter = Router()

const recommendedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional().default(12),
})

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
})

const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  role: true,
} as const

function skillMatchesQuery(skills: string[], query: string) {
  const normalized = query.toLowerCase()
  return skills.some(
    (skill) =>
      skill.toLowerCase() === normalized ||
      skill.toLowerCase().includes(normalized) ||
      normalized.includes(skill.toLowerCase()),
  )
}

searchRouter.get('/recommended', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { limit } = recommendedQuerySchema.parse(req.query)
    const results = await getRecommendedPeople(authUser.id, limit)
    res.status(200).json({ results })
  } catch (error) {
    console.error('GET /search/recommended failed:', error)
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { limit } = recommendedQuerySchema.parse(req.query)
      const profiles = await prisma.profile.findMany({
        where: { userId: { not: authUser.id } },
        include: {
          user: { select: userSelect },
          careers: { orderBy: { startDate: 'desc' }, take: 1, select: { company: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      })
      res.status(200).json({
        results: profiles.map((profile) => ({
          userId: profile.user.id,
          name: profile.user.name,
          avatarUrl: profile.user.avatarUrl,
          role: profile.user.role,
          headline: profile.headline,
          company: profile.company ?? profile.careers[0]?.company ?? null,
          school: profile.school,
          skills: profile.skills.slice(0, 6),
          matchReasons: [] as string[],
        })),
      })
    } catch (fallbackError) {
      next(fallbackError)
    }
  }
})

searchRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { q, limit } = searchQuerySchema.parse(req.query)

    const qLower = q.toLowerCase()

    const profiles = await prisma.profile.findMany({
      where: {
        userId: { not: authUser.id },
        OR: [
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { headline: { contains: q, mode: 'insensitive' } },
          { company: { contains: q, mode: 'insensitive' } },
          { school: { contains: q, mode: 'insensitive' } },
          { bio: { contains: q, mode: 'insensitive' } },
          { skills: { has: q } },
          { interests: { has: q } },
          {
            careers: {
              some: {
                OR: [
                  { company: { contains: q, mode: 'insensitive' } },
                  { position: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      },
      include: {
        user: { select: userSelect },
        careers: {
          orderBy: { startDate: 'desc' },
          take: 1,
          select: { company: true, position: true },
        },
      },
      take: limit * 3,
    })

    const skillOnlyCandidates =
      profiles.length < limit
        ? await prisma.profile.findMany({
            where: { userId: { not: authUser.id } },
            include: {
              user: { select: userSelect },
              careers: {
                orderBy: { startDate: 'desc' },
                take: 1,
                select: { company: true, position: true },
              },
            },
            take: 150,
          })
        : []

    const merged = [...profiles, ...skillOnlyCandidates]
    const seen = new Set<string>()
    const results: Array<{
      userId: string
      name: string
      avatarUrl: string | null
      role: string
      headline: string | null
      company: string | null
      school: string | null
      skills: string[]
      matchReasons: string[]
    }> = []

    for (const profile of merged) {
      if (seen.has(profile.userId)) {
        continue
      }

      const matchesText =
        profile.user.name.toLowerCase().includes(qLower) ||
        profile.headline?.toLowerCase().includes(qLower) ||
        profile.company?.toLowerCase().includes(qLower) ||
        profile.school?.toLowerCase().includes(qLower) ||
        profile.bio?.toLowerCase().includes(qLower) ||
        profile.interests.some((interest) => interest.toLowerCase().includes(qLower)) ||
        profile.careers.some(
          (career) =>
            career.company.toLowerCase().includes(qLower) ||
            career.position.toLowerCase().includes(qLower),
        )

      const matchesSkill = skillMatchesQuery(profile.skills, q) || profile.skills.includes(q)

      if (!matchesText && !matchesSkill) {
        continue
      }

      seen.add(profile.userId)

      const matchLabels: string[] = []
      if (profile.user.name.toLowerCase().includes(qLower)) {
        matchLabels.push('이름')
      }
      if (profile.headline?.toLowerCase().includes(qLower)) {
        matchLabels.push('직무')
      }
      if (
        profile.company?.toLowerCase().includes(qLower) ||
        profile.careers.some((c) => c.company.toLowerCase().includes(qLower))
      ) {
        matchLabels.push('회사')
      }
      if (matchesSkill) {
        matchLabels.push('스킬')
      }
      if (profile.school?.toLowerCase().includes(qLower)) {
        matchLabels.push('학교')
      }

      const latestCareer = profile.careers[0]
      results.push({
        userId: profile.user.id,
        name: profile.user.name,
        avatarUrl: profile.user.avatarUrl,
        role: profile.user.role,
        headline: profile.headline,
        company: profile.company ?? latestCareer?.company ?? null,
        school: profile.school,
        skills: profile.skills.slice(0, 6),
        matchReasons: [...new Set(matchLabels)],
      })

      if (results.length >= limit) {
        break
      }
    }

    res.status(200).json({ query: q, results })
  } catch (error) {
    next(error)
  }
})
