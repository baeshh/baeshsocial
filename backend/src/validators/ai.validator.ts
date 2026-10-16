import { z } from 'zod'

export const projectInsightSchema = z.object({
  projectId: z.string().min(1).max(64),
})

export const opportunityMatchSchema = z.object({
  opportunityId: z.string().min(1).max(64),
})

export const portfolioRequestSchema = z.object({
  projectIds: z.array(z.string().min(1).max(64)).max(6).optional(),
})
