import { z } from 'zod'

export const updateProfileSchema = z.object({
  headline: z.string().max(160).nullable().optional(),
  bio: z.string().max(1200).nullable().optional(),
  school: z.string().max(120).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  skills: z.array(z.string().min(1).max(60)).default([]),
  interests: z.array(z.string().min(1).max(60)).default([]),
  socialLinks: z.record(z.string(), z.string()).nullable().optional(),
})

export const certificateSchema = z.object({
  title: z.string().min(1).max(160),
  issuer: z.string().min(1).max(160),
  issuedAt: z.string().nullable().optional(),
  credentialUrl: z.string().url().nullable().optional(),
  verified: z.boolean().default(false),
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
