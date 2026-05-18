import { z } from 'zod'

export const projectInsightSchema = z.object({
  projectId: z.string(),
})

export const opportunityMatchSchema = z.object({
  opportunityId: z.string(),
})

export const portfolioGeneratorSchema = z.object({
  projectId: z.string(),
})
