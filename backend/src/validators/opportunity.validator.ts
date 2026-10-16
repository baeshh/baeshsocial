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

const opportunityTypeSchema = opportunitySchema.shape.type
const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

export const opportunityListQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    /** One type (older clients) or a comma-separated list. */
    type: z.union([opportunityTypeSchema, z.literal('')]).optional(),
    types: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').filter(Boolean) : []))
      .pipe(z.array(opportunityTypeSchema).max(6)),
    skill: z.string().trim().max(60).optional(),
    remote: flag,
    saved: flag,
    /** Deadline today or later, or no deadline. */
    openOnly: flag,
    sort: z.enum(['match', 'deadline', 'recent']).default('match'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .transform(({ type, types, ...query }) => ({ ...query, types: type ? [...new Set([...types, type])] : types }))
