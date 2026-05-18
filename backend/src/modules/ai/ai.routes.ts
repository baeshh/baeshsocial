import { AIAnalysisType, Prisma } from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { getAIProvider } from '../../services/ai/index.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  opportunityMatchSchema,
  portfolioGeneratorSchema,
  projectInsightSchema,
} from '../../validators/ai.validator.js'

export const aiRouter = Router()

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function saveAnalysis({
  userId,
  projectId,
  type,
  input,
  output,
}: {
  userId: string
  projectId?: string | null
  type: AIAnalysisType
  input: Record<string, unknown>
  output: Record<string, unknown>
}) {
  const provider = getAIProvider()

  return prisma.aIAnalysis.create({
    data: {
      userId,
      projectId,
      type,
      input: toJson(input),
      output: toJson(output),
      provider: provider.name,
      model: provider.model,
    },
  })
}

aiRouter.post('/profile-insight', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const profile = await prisma.profile.findUnique({
      where: { userId: authUser.id },
      include: {
        certificates: true,
        careers: true,
        awards: true,
        portfolios: true,
      },
    })
    const projects = await prisma.project.findMany({
      where: {
        OR: [{ ownerId: authUser.id }, { members: { some: { userId: authUser.id } } }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        progress: true,
        skills: true,
      },
    })
    const input = {
      profile,
      skills: profile?.skills ?? [],
      projects,
    }
    const provider = getAIProvider()
    const output = await provider.generate({ type: 'profile-insight', input })
    const analysis = await saveAnalysis({
      userId: authUser.id,
      type: AIAnalysisType.PROFILE_INSIGHT,
      input,
      output,
    })

    res.status(201).json({ analysis, output })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/project-insight', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { projectId } = projectInsightSchema.parse(req.body)
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: authUser.id }, { members: { some: { userId: authUser.id } } }, { visibility: 'PUBLIC' }],
      },
      include: {
        tasks: true,
        activities: true,
        files: true,
        members: true,
      },
    })

    if (!project) {
      res.status(404).json({ message: 'Project not found' })
      return
    }

    const input = {
      title: project.title,
      description: project.description,
      objective: project.objective,
      progress: project.progress,
      skills: project.skills,
      tasks: project.tasks,
      activities: project.activities,
      files: project.files,
    }
    const provider = getAIProvider()
    const output = await provider.generate({ type: 'project-insight', input })
    const analysis = await saveAnalysis({
      userId: authUser.id,
      projectId,
      type: AIAnalysisType.PROJECT_INSIGHT,
      input,
      output,
    })

    res.status(201).json({ analysis, output })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/opportunity-match', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { opportunityId } = opportunityMatchSchema.parse(req.body)
    const [profile, opportunity] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: authUser.id } }),
      prisma.opportunity.findUnique({ where: { id: opportunityId } }),
    ])

    if (!opportunity) {
      res.status(404).json({ message: 'Opportunity not found' })
      return
    }

    const input = {
      profileSkills: profile?.skills ?? [],
      opportunitySkills: opportunity.skills,
      opportunity,
    }
    const provider = getAIProvider()
    const output = await provider.generate({ type: 'opportunity-match', input })
    const analysis = await saveAnalysis({
      userId: authUser.id,
      type: AIAnalysisType.OPPORTUNITY_MATCH,
      input,
      output,
    })

    res.status(201).json({ analysis, output })
  } catch (error) {
    next(error)
  }
})

aiRouter.post('/portfolio-generator', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { projectId } = portfolioGeneratorSchema.parse(req.body)
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [{ ownerId: authUser.id }, { members: { some: { userId: authUser.id } } }, { visibility: 'PUBLIC' }],
      },
      include: {
        tasks: true,
        activities: true,
        files: true,
      },
    })

    if (!project) {
      res.status(404).json({ message: 'Project not found' })
      return
    }

    const input = {
      title: project.title,
      description: project.description,
      objective: project.objective,
      skills: project.skills,
      tasks: project.tasks,
      activities: project.activities,
      files: project.files,
    }
    const provider = getAIProvider()
    const output = await provider.generate({ type: 'portfolio-generator', input })
    const analysis = await saveAnalysis({
      userId: authUser.id,
      projectId,
      type: AIAnalysisType.PORTFOLIO_GENERATOR,
      input,
      output,
    })

    res.status(201).json({ analysis, output })
  } catch (error) {
    next(error)
  }
})

aiRouter.get('/analyses/me', authenticate, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const analyses = await prisma.aIAnalysis.findMany({
      where: { userId: authUser.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    res.status(200).json({ analyses })
  } catch (error) {
    next(error)
  }
})
