import { OpportunityType, Prisma, UserRole } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { updateEnrollmentStatusSchema } from '../../validators/enrollment.validator.js'
import {
  opportunityListQuerySchema,
  opportunitySchema,
  updateOpportunitySchema,
} from '../../validators/opportunity.validator.js'
import {
  applyForProgram,
  assertCanManageEnrollment,
  issueProgramCertificate,
  updateEnrollmentByManager,
  withdrawFromProgram,
} from './enrollment.service.js'

export const opportunitiesRouter = Router()

const typeMap = {
  job: OpportunityType.JOB,
  internship: OpportunityType.INTERNSHIP,
  hackathon: OpportunityType.HACKATHON,
  education: OpportunityType.EDUCATION,
  competition: OpportunityType.COMPETITION,
  startup_program: OpportunityType.STARTUP_PROGRAM,
}

/** The viewer sees who posted (no contact details) and only their own save, never other users'. */
const opportunityInclude = (viewerId: string) =>
  ({
    creator: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    savedOpportunities: {
      where: { userId: viewerId },
      select: {
        id: true,
        userId: true,
        createdAt: true,
      },
    },
  }) as const

function toOptionalDate(value?: string | null) {
  return value ? new Date(value) : null
}

function buildOpportunityData(input: ReturnType<typeof opportunitySchema.parse>) {
  return {
    title: input.title,
    type: typeMap[input.type],
    organization: input.organization,
    description: input.description,
    skills: input.skills,
    location: input.location,
    isRemote: input.isRemote,
    deadline: toOptionalDate(input.deadline),
    applyUrl: input.applyUrl,
  }
}

function buildOpportunityUpdateData(input: ReturnType<typeof updateOpportunitySchema.parse>) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: typeMap[input.type] } : {}),
    ...(input.organization !== undefined ? { organization: input.organization } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.skills !== undefined ? { skills: input.skills } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.isRemote !== undefined ? { isRemote: input.isRemote } : {}),
    ...(input.deadline !== undefined ? { deadline: toOptionalDate(input.deadline) } : {}),
    ...(input.applyUrl !== undefined ? { applyUrl: input.applyUrl } : {}),
  }
}

/** The opportunity's skills that also appear on the viewer's profile, compared case-insensitively. */
function matchedSkills(profileSkills: string[], opportunitySkills: string[]) {
  const normalizedProfileSkills = new Set(profileSkills.map((skill) => skill.toLowerCase()))
  return opportunitySkills.filter((skill) => normalizedProfileSkills.has(skill.toLowerCase()))
}

function calculateMatchScore(profileSkills: string[], opportunitySkills: string[]) {
  if (opportunitySkills.length === 0) {
    return 50
  }

  const matched = matchedSkills(profileSkills, opportunitySkills)
  return Math.min(98, Math.max(35, Math.round((matched.length / opportunitySkills.length) * 100)))
}

function enrichOpportunity<T extends { skills: string[]; savedOpportunities: Array<{ userId: string }> }>(
  opportunity: T,
  userId: string,
  profileSkills: string[],
) {
  return {
    ...opportunity,
    saved: opportunity.savedOpportunities.some((saved) => saved.userId === userId),
    matchScore: calculateMatchScore(profileSkills, opportunity.skills),
    matchedSkills: matchedSkills(profileSkills, opportunity.skills),
  }
}

function handleOpportunityError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === 'OPPORTUNITY_NOT_FOUND') {
    res.status(404).json({ message: 'Opportunity not found' })
    return true
  }
  if (error instanceof Error && error.message === 'FORBIDDEN') {
    res.status(403).json({ message: '이 프로그램을 관리할 권한이 없습니다.' })
    return true
  }

  return false
}

async function assertCanManageOpportunity(authUser: AuthTokenPayload, opportunityId: string) {
  const opportunity = await requireOpportunity(opportunityId)
  if (authUser.role === UserRole.ADMIN) {
    return opportunity
  }
  if (opportunity.createdBy !== authUser.id) {
    throw new Error('FORBIDDEN')
  }
  return opportunity
}

async function requireOpportunity(id: string) {
  const opportunity = await prisma.opportunity.findUnique({ where: { id } })

  if (!opportunity) {
    throw new Error('OPPORTUNITY_NOT_FOUND')
  }

  return opportunity
}

const listOrder = {
  match: Prisma.sql`score DESC, "createdAt" DESC, id ASC`,
  deadline: Prisma.sql`deadline ASC NULLS LAST, "createdAt" DESC, id ASC`,
  recent: Prisma.sql`"createdAt" DESC, id ASC`,
} as const

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`)

/**
 * Filtering, match scoring (same formula as `calculateMatchScore`) and paging all run in PostgreSQL, so
 * the list stays correct however many opportunities there are.
 */
opportunitiesRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const query = opportunityListQuerySchema.parse(req.query)
    const profile = await prisma.profile.findUnique({
      where: { userId: authUser.id },
      select: { skills: true },
    })
    const profileSkills = (profile?.skills ?? []).map((skill) => skill.toLowerCase())

    const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`]
    if (query.q) {
      const pattern = `%${escapeLike(query.q)}%`
      conditions.push(Prisma.sql`(o.title ILIKE ${pattern} OR o.organization ILIKE ${pattern} OR o.description ILIKE ${pattern})`)
    }
    if (query.types.length > 0) {
      const types = query.types.map((type) => typeMap[type])
      conditions.push(Prisma.sql`o.type::text = ANY(${types}::text[])`)
    }
    if (query.remote) conditions.push(Prisma.sql`o."isRemote" = TRUE`)
    if (query.skill) conditions.push(Prisma.sql`${query.skill} = ANY(o.skills)`)
    if (query.saved) {
      conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "SavedOpportunity" s WHERE s."opportunityId" = o.id AND s."userId" = ${authUser.id})`)
    }
    if (query.openOnly) conditions.push(Prisma.sql`(o.deadline IS NULL OR o.deadline >= date_trunc('day', now()))`)
    const where = Prisma.join(conditions, ' AND ')

    const [{ total }] = await prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "Opportunity" o WHERE ${where}`
    const totalPages = Math.max(1, Math.ceil(Number(total) / query.pageSize))
    const page = Math.min(query.page, totalPages)
    const ranked = await prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT id, score FROM (
        SELECT o.id, o.deadline, o."createdAt",
          CASE WHEN cardinality(o.skills) = 0 THEN 50
            ELSE LEAST(98, GREATEST(35, ROUND(100.0 * (
              SELECT count(*) FROM unnest(o.skills) AS k(skill) WHERE lower(k.skill) = ANY(${profileSkills}::text[])
            ) / cardinality(o.skills))))
          END::int AS score
        FROM "Opportunity" o
        WHERE ${where}
      ) scored
      ORDER BY ${listOrder[query.sort]}
      LIMIT ${query.pageSize} OFFSET ${(page - 1) * query.pageSize}`

    const rows = await prisma.opportunity.findMany({ where: { id: { in: ranked.map((row) => row.id) } }, include: opportunityInclude(authUser.id) })
    const byId = new Map(rows.map((row) => [row.id, row]))
    res.status(200).json({
      opportunities: ranked.flatMap(({ id, score }) => {
        const row = byId.get(id)
        return row ? [{ ...enrichOpportunity(row, authUser.id, profile?.skills ?? []), matchScore: score }] : []
      }),
      page,
      pageSize: query.pageSize,
      total: Number(total),
      totalPages,
      /** Without profile skills every score is the same floor value, so the client should not call it a match. */
      profileSkillCount: profileSkills.length,
    })
  } catch (error) {
    next(error)
  }
})

const opportunityManagers = [UserRole.ADMIN, UserRole.INSTITUTION]

opportunitiesRouter.post(
  '/',
  authenticate,
  requireRoles(opportunityManagers),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const input = opportunitySchema.parse(req.body)
      const opportunity = await prisma.opportunity.create({
        data: {
          ...buildOpportunityData(input),
          createdBy: authUser.id,
        },
        include: opportunityInclude(authUser.id),
      })

      res.status(201).json({
        opportunity: enrichOpportunity(opportunity, authUser.id, []),
      })
    } catch (error) {
      next(error)
    }
  },
)

opportunitiesRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await prisma.profile.findUnique({
      where: { userId: authUser.id },
      select: { skills: true },
    })
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: String(req.params.id) },
      include: opportunityInclude(authUser.id),
    })

    if (!opportunity) {
      res.status(404).json({ message: 'Opportunity not found' })
      return
    }

    res.status(200).json({
      opportunity: enrichOpportunity(opportunity, authUser.id, profile?.skills ?? []),
    })
  } catch (error) {
    next(error)
  }
})

opportunitiesRouter.get('/enrollments/me', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const enrollments = await prisma.opportunityEnrollment.findMany({
      where: { userId: authUser.id },
      orderBy: { appliedAt: 'desc' },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true, skills: true },
        },
        certificate: {
          select: { id: true, verified: true, issuedAt: true },
        },
      },
    })

    res.status(200).json({ enrollments })
  } catch (error) {
    next(error)
  }
})

opportunitiesRouter.get('/enrollments/managed', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const isAdmin = authUser.role === UserRole.ADMIN
    const enrollments = await prisma.opportunityEnrollment.findMany({
      where: isAdmin
        ? {}
        : {
            opportunity: { createdBy: authUser.id },
          },
      orderBy: { appliedAt: 'desc' },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true },
        },
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        certificate: {
          select: { id: true, verified: true },
        },
      },
    })

    res.status(200).json({ enrollments })
  } catch (error) {
    next(error)
  }
})

opportunitiesRouter.patch('/enrollments/:enrollmentId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const enrollmentId = String(req.params.enrollmentId)
    const input = updateEnrollmentStatusSchema.parse(req.body)

    await assertCanManageEnrollment(enrollmentId, authUser.id, authUser.role)

    const enrollment =
      input.status === 'completed'
        ? await issueProgramCertificate(enrollmentId, authUser.id)
        : await updateEnrollmentByManager(enrollmentId, input.status, authUser.id)

    res.status(200).json({ enrollment })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ENROLLMENT_NOT_FOUND') {
        res.status(404).json({ message: 'Enrollment not found' })
        return
      }
      if (error.message === 'FORBIDDEN') {
        res.status(403).json({ message: 'Not allowed to manage this enrollment' })
        return
      }
    }
    next(error)
  }
})

opportunitiesRouter.post('/:id/enroll', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const opportunityId = String(req.params.id)
    const opportunity = await requireOpportunity(opportunityId)
    const { enrollment, changed } = await applyForProgram(authUser.id, opportunity)

    res.status(changed ? 201 : 200).json({ enrollment })
  } catch (error) {
    if (handleOpportunityError(error, res)) {
      return
    }
    next(error)
  }
})

opportunitiesRouter.delete('/:id/enroll', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const enrollment = await withdrawFromProgram(authUser.id, String(req.params.id))

    res.status(200).json({ enrollment })
  } catch (error) {
    if (handleOpportunityError(error, res)) {
      return
    }
    next(error)
  }
})

opportunitiesRouter.patch(
  '/:id',
  authenticate,
  requireRoles(opportunityManagers),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const opportunityId = String(req.params.id)
      await assertCanManageOpportunity(authUser, opportunityId)
      const input = updateOpportunitySchema.parse(req.body)
      const opportunity = await prisma.opportunity.update({
        where: { id: opportunityId },
        data: buildOpportunityUpdateData(input),
        include: opportunityInclude(authUser.id),
      })

      res.status(200).json({
        opportunity: enrichOpportunity(opportunity, authUser.id, []),
      })
    } catch (error) {
      if (handleOpportunityError(error, res)) {
        return
      }
      next(error)
    }
  },
)

opportunitiesRouter.delete(
  '/:id',
  authenticate,
  requireRoles(opportunityManagers),
  async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const opportunityId = String(req.params.id)
      await assertCanManageOpportunity(authUser, opportunityId)
      await prisma.opportunity.delete({ where: { id: opportunityId } })
      res.status(204).send()
    } catch (error) {
      if (handleOpportunityError(error, res)) {
        return
      }
      next(error)
    }
  },
)

opportunitiesRouter.post('/:id/save', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const opportunityId = String(req.params.id)
    await requireOpportunity(opportunityId)
    const savedOpportunity = await prisma.savedOpportunity.upsert({
      where: { userId_opportunityId: { userId: authUser.id, opportunityId } },
      create: { userId: authUser.id, opportunityId },
      update: {},
    })

    res.status(201).json({ savedOpportunity })
  } catch (error) {
    if (handleOpportunityError(error, res)) {
      return
    }
    next(error)
  }
})

opportunitiesRouter.delete('/:id/save', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const opportunityId = String(req.params.id)
    await prisma.savedOpportunity.deleteMany({
      where: { userId: authUser.id, opportunityId },
    })

    res.status(204).send()
  } catch (error) {
    next(error)
  }
})
