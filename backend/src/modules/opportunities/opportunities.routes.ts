import { OpportunityEnrollmentStatus, OpportunityType, UserRole } from '@prisma/client'
import { Router, type Response } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { updateEnrollmentStatusSchema } from '../../validators/enrollment.validator.js'
import {
  opportunitySchema,
  updateOpportunitySchema,
} from '../../validators/opportunity.validator.js'
import {
  assertCanManageEnrollment,
  isProgramOpportunity,
  issueProgramCertificate,
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

const opportunityInclude = {
  creator: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  savedOpportunities: {
    select: {
      id: true,
      userId: true,
      createdAt: true,
    },
  },
} as const

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

function calculateMatchScore(profileSkills: string[], opportunitySkills: string[]) {
  if (opportunitySkills.length === 0) {
    return 50
  }

  const normalizedProfileSkills = new Set(profileSkills.map((skill) => skill.toLowerCase()))
  const matched = opportunitySkills.filter((skill) => normalizedProfileSkills.has(skill.toLowerCase()))
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
  }
}

function handleOpportunityError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === 'OPPORTUNITY_NOT_FOUND') {
    res.status(404).json({ message: 'Opportunity not found' })
    return true
  }

  return false
}

async function requireOpportunity(id: string) {
  const opportunity = await prisma.opportunity.findUnique({ where: { id } })

  if (!opportunity) {
    throw new Error('OPPORTUNITY_NOT_FOUND')
  }

  return opportunity
}

opportunitiesRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const query = String(req.query.q ?? '').trim()
    const type = String(req.query.type ?? '').trim()
    const remote = String(req.query.remote ?? '').trim()
    const skill = String(req.query.skill ?? '').trim()
    const savedOnly = String(req.query.saved ?? '').trim() === 'true'
    const profile = await prisma.profile.findUnique({
      where: { userId: authUser.id },
      select: { skills: true },
    })

    const opportunities = await prisma.opportunity.findMany({
      where: {
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: 'insensitive' } },
                { organization: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(type && type in typeMap ? { type: typeMap[type as keyof typeof typeMap] } : {}),
        ...(remote === 'true' ? { isRemote: true } : {}),
        ...(skill ? { skills: { has: skill } } : {}),
        ...(savedOnly ? { savedOpportunities: { some: { userId: authUser.id } } } : {}),
      },
      include: opportunityInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.status(200).json({
      opportunities: opportunities
        .map((opportunity) => enrichOpportunity(opportunity, authUser.id, profile?.skills ?? []))
        .sort((a, b) => b.matchScore - a.matchScore),
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
        include: opportunityInclude,
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
      include: opportunityInclude,
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

    const enrollment = await assertCanManageEnrollment(enrollmentId, authUser.id, authUser.role)

    if (input.status === 'completed') {
      const completed = await issueProgramCertificate(enrollmentId, authUser.id)
      res.status(200).json({ enrollment: completed })
      return
    }

    const statusMap = {
      enrolled: OpportunityEnrollmentStatus.ENROLLED,
      rejected: OpportunityEnrollmentStatus.REJECTED,
      withdrawn: OpportunityEnrollmentStatus.WITHDRAWN,
    } as const

    const updated = await prisma.opportunityEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: statusMap[input.status],
        ...(input.status === 'enrolled' ? { enrolledAt: new Date(), approvedById: authUser.id } : {}),
      },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true },
        },
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
        certificate: true,
      },
    })

    res.status(200).json({ enrollment: updated })
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

    if (!isProgramOpportunity(opportunity.type)) {
      res.status(400).json({ message: 'This opportunity does not support program enrollment' })
      return
    }

    const enrollment = await prisma.opportunityEnrollment.upsert({
      where: {
        userId_opportunityId: { userId: authUser.id, opportunityId },
      },
      create: {
        userId: authUser.id,
        opportunityId,
        status: OpportunityEnrollmentStatus.APPLIED,
      },
      update: {
        status: OpportunityEnrollmentStatus.APPLIED,
        appliedAt: new Date(),
        enrolledAt: null,
        completedAt: null,
        approvedById: null,
        certificateId: null,
      },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true },
        },
      },
    })

    res.status(201).json({ enrollment })
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
    const opportunityId = String(req.params.id)

    const enrollment = await prisma.opportunityEnrollment.findUnique({
      where: {
        userId_opportunityId: { userId: authUser.id, opportunityId },
      },
    })

    if (!enrollment) {
      res.status(404).json({ message: 'Enrollment not found' })
      return
    }

    if (enrollment.status === OpportunityEnrollmentStatus.COMPLETED) {
      res.status(400).json({ message: 'Completed programs cannot be cancelled' })
      return
    }

    if (enrollment.status === OpportunityEnrollmentStatus.WITHDRAWN) {
      res.status(200).json({ enrollment })
      return
    }

    const updated = await prisma.opportunityEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: OpportunityEnrollmentStatus.WITHDRAWN,
        enrolledAt: null,
        approvedById: null,
      },
      include: {
        opportunity: {
          select: { id: true, title: true, organization: true, type: true },
        },
        certificate: {
          select: { id: true, verified: true, issuedAt: true },
        },
      },
    })

    res.status(200).json({ enrollment: updated })
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
      await requireOpportunity(opportunityId)
      const input = updateOpportunitySchema.parse(req.body)
      const opportunity = await prisma.opportunity.update({
        where: { id: opportunityId },
        data: buildOpportunityUpdateData(input),
        include: opportunityInclude,
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
      const opportunityId = String(req.params.id)
      await requireOpportunity(opportunityId)
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
