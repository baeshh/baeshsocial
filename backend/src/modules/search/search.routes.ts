import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { getRecommendedPeople } from '../../utils/peopleRecommendations.js'

export const searchRouter = Router()

const recommendedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).optional().default(12),
})

const MAX_SEARCH_OFFSET = 500

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
  cursor: z.string().max(100).optional(),
})

const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  role: true,
} as const

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

type SearchRow = {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  headline: string | null
  company: string | null
  latestCompany: string | null
  school: string | null
  skills: string[]
  m_name: boolean
  m_headline: boolean
  m_company: boolean
  m_school: boolean
  m_skill: boolean
}

function encodeOffset(offset: number) {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url')
}

function decodeOffset(cursor: string | undefined) {
  if (!cursor) return 0
  try {
    const { o } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown }
    if (typeof o === 'number' && Number.isInteger(o) && o >= 0 && o <= MAX_SEARCH_OFFSET) return o
  } catch {
    /* fall through */
  }
  throw new HttpError(400, '잘못된 페이지 커서입니다.')
}

/**
 * Ranked people search, filtered and scored in SQL. ILIKE predicates use the pg_trgm GIN indexes on
 * User.name / Profile.headline·company·school. Bio and career text are only matched for profiles that
 * are not followers-only, so search can't be used to probe hidden details.
 */
searchRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { q, limit, cursor } = searchQuerySchema.parse(req.query)
    const offset = decodeOffset(cursor)
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

    const rows = await prisma.$queryRaw<SearchRow[]>`
      WITH matched AS (
        SELECT
          p."userId", u.name, u."avatarUrl", u.role::text AS role,
          p.headline, p.company, p.school, p.skills, p."updatedAt",
          (SELECT c.company FROM "Career" c WHERE c."profileId" = p.id ORDER BY c."startDate" DESC NULLS LAST LIMIT 1) AS "latestCompany",
          u.name ILIKE ${like} AS m_name,
          COALESCE(p.headline ILIKE ${like}, false) AS m_headline,
          COALESCE(p.company ILIKE ${like}, false) OR (
            p.visibility <> 'FOLLOWERS' AND EXISTS (
              SELECT 1 FROM "Career" c
              WHERE c."profileId" = p.id AND (c.company ILIKE ${like} OR c.position ILIKE ${like})
            )
          ) AS m_company,
          COALESCE(p.school ILIKE ${like}, false) AS m_school,
          EXISTS (
            SELECT 1 FROM unnest(p.skills) s
            WHERE s ILIKE ${like} OR (length(s) >= 2 AND position(lower(s) IN lower(${q})) > 0)
          ) AS m_skill,
          EXISTS (SELECT 1 FROM unnest(p.interests) i WHERE i ILIKE ${like}) AS m_interest,
          (p.visibility <> 'FOLLOWERS' AND COALESCE(p.bio ILIKE ${like}, false)) AS m_bio
        FROM "Profile" p
        JOIN "User" u ON u.id = p."userId"
        WHERE p."userId" <> ${authUser.id}
      )
      SELECT * FROM matched
      WHERE m_name OR m_headline OR m_company OR m_school OR m_skill OR m_interest OR m_bio
      ORDER BY
        (CASE WHEN m_name THEN 8 ELSE 0 END) + (CASE WHEN m_skill THEN 5 ELSE 0 END) +
        (CASE WHEN m_headline THEN 4 ELSE 0 END) + (CASE WHEN m_company THEN 3 ELSE 0 END) +
        (CASE WHEN m_school THEN 3 ELSE 0 END) + (CASE WHEN m_interest THEN 2 ELSE 0 END) +
        (CASE WHEN m_bio THEN 1 ELSE 0 END) DESC,
        "updatedAt" DESC,
        "userId" DESC
      LIMIT ${limit + 1} OFFSET ${offset}
    `

    const page = rows.slice(0, limit)
    const results = page.map((row) => ({
      userId: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
      role: row.role,
      headline: row.headline,
      company: row.company ?? row.latestCompany,
      school: row.school,
      skills: row.skills.slice(0, 6),
      matchReasons: [
        row.m_name && '이름',
        row.m_headline && '직무',
        row.m_company && '회사',
        row.m_skill && '스킬',
        row.m_school && '학교',
      ].filter((label): label is string => Boolean(label)),
    }))
    const nextOffset = offset + limit
    res.status(200).json({
      query: q,
      results,
      nextCursor: rows.length > limit && nextOffset <= MAX_SEARCH_OFFSET ? encodeOffset(nextOffset) : null,
    })
  } catch (error) {
    next(error)
  }
})
