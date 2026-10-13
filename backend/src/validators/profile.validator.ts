import { ProfileVisibility } from '@prisma/client'
import { z } from 'zod'
import { HISTORY_TYPES, PROFILE_PROJECT_FILTERS } from '../modules/profiles/profileData.js'
import { pageQuerySchema } from '../utils/pagination.js'

export const updateProfileSchema = z.object({
  headline: z.string().max(160).nullable().optional(),
  bio: z.string().max(1200).nullable().optional(),
  school: z.string().max(120).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).max(30).optional(),
  interests: z.array(z.string().min(1).max(60)).max(30).optional(),
  socialLinks: z.record(z.string(), z.string().max(300)).nullable().optional(),
  visibility: z
    .enum(['public', 'members', 'followers'])
    .transform((value) => value.toUpperCase() as ProfileVisibility)
    .optional(),
  talentSearchOptIn: z.boolean().optional(),
})

export const featuredProjectsSchema = z.object({
  projectIds: z
    .array(z.string().min(1).max(64))
    .max(3, '대표 프로젝트는 최대 3개까지 고정할 수 있습니다.')
    .refine((ids) => new Set(ids).size === ids.length, '같은 프로젝트를 중복으로 선택했습니다.'),
})

export const profileProjectsQuerySchema = pageQuerySchema(10, 30).extend({
  filter: z.enum(PROFILE_PROJECT_FILTERS).default('all'),
})

export const profileHistoryQuerySchema = pageQuerySchema(10, 50).extend({
  type: z.enum(HISTORY_TYPES).default('all'),
  /** Numbered pagination; when present the cursor is ignored. Capped so one request stays bounded. */
  page: z.coerce.number().int().min(1).max(50).optional(),
})

/** `verified` is not accepted from clients: only program completion or operators can mark a certificate verified. */
export const certificateSchema = z.object({
  title: z.string().min(1).max(160),
  issuer: z.string().min(1).max(160),
  issuedAt: z.string().nullable().optional(),
  credentialUrl: z.string().url().nullable().optional(),
})

export const careerSchema = z.object({
  company: z.string().min(1).max(160),
  position: z.string().min(1).max(160),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
})

export const awardSchema = z.object({
  title: z.string().min(1).max(160),
  issuer: z.string().max(160).nullable().optional(),
  awardedAt: z.string().nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
})

export const portfolioSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1000).nullable().optional(),
  url: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
})
