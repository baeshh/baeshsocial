import { z } from 'zod'

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).max(80),
    // Present only so privilege-escalation attempts are rejected instead of applied.
    role: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === undefined) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['role'],
      message: '회원가입으로 계정 역할(user·company·institution·admin)을 지정할 수 없습니다.',
    })
  })
  .transform(({ role: _role, ...rest }) => rest)

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
