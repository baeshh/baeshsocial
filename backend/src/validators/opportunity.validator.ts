import { z } from 'zod'

export const opportunitySchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['job', 'internship', 'hackathon', 'education', 'competition', 'startup_program']),
  organization: z.string().min(1).max(200),
  description: z.string().min(1).max(3000),
  skills: z.array(z.string().min(1).max(60)).default([]),
  location: z.string().max(160).nullable().optional(),
  isRemote: z.boolean().default(false),
  deadline: z.string().nullable().optional(),
  applyUrl: z.string().url().nullable().optional(),
})

export const updateOpportunitySchema = opportunitySchema.partial()
