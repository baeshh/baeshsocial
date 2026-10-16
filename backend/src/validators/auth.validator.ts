import { z } from 'zod'

export const passwordField = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), '비밀번호에는 영문자와 숫자가 모두 포함되어야 합니다.')

export const registerSchema = z
  .object({
    email: z.string().email().max(254),
    password: passwordField,
    name: z.string().min(2).max(80),
    inviteToken: z.string().min(20).max(200).optional(),
    // Present only so privilege-escalation attempts are rejected instead of stripped.
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
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordField,
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
