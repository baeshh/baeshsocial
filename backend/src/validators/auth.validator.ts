import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(80),
  role: z.enum(['user', 'company', 'institution', 'admin']).default('user'),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const imageUrlField = z
  .string()
  .max(2_000_000)
  .refine((value) => value.startsWith('data:image/') || /^https?:\/\//i.test(value), {
    message: 'avatarUrl and coverUrl must be a data URL or http(s) URL',
  })

export const updateMeSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  avatarUrl: imageUrlField.nullable().optional(),
  coverUrl: imageUrlField.nullable().optional(),
})
