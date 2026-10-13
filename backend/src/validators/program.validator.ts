import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value || null))

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || !Number.isNaN(Date.parse(value)), '날짜 형식이 올바르지 않습니다.')
  .transform((value) => (value === undefined ? undefined : value ? new Date(value) : null))

const id = z.string().trim().min(1).max(64)

function checkPeriod<T extends { startDate?: Date | null; endDate?: Date | null }>(value: T, ctx: z.RefinementCtx) {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: '종료일은 시작일 이후여야 합니다.' })
  }
}

export const programStatusSchema = z.enum(['draft', 'active', 'completed', 'archived'])

export const createProgramSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: optionalText(4000),
    term: optionalText(40),
    status: programStatusSchema.default('active'),
    startDate: optionalDate,
    endDate: optionalDate,
    managerUserIds: z.array(id).max(30).default([]),
  })
  .superRefine(checkPeriod)

export const updateProgramSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: optionalText(4000),
    term: optionalText(40),
    status: programStatusSchema.optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    managerUserIds: z.array(id).max(30).optional(),
  })
  .superRefine(checkPeriod)

export const projectStatusSchema = z.enum(['planning', 'active', 'completed', 'archived'])

export const createProgramProjectSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    teamName: optionalText(60),
    objective: optionalText(2000),
    description: optionalText(4000),
    status: projectStatusSchema.default('active'),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine(checkPeriod)

export const updateProgramProjectSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    teamName: optionalText(60),
    objective: optionalText(2000),
    description: optionalText(4000),
    status: projectStatusSchema.optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine(checkPeriod)

export const moveProgramProjectSchema = z.object({ targetProgramId: id })

export const addParticipantsSchema = z.object({
  participants: z
    .array(
      z
        .object({
          userId: id.optional(),
          email: z.string().trim().toLowerCase().email().optional(),
          studentNo: optionalText(40),
          department: optionalText(80),
        })
        .refine((value) => value.userId || value.email, '사용자 ID 또는 이메일이 필요합니다.'),
    )
    .min(1)
    .max(300),
})

export const assignTeamMembersSchema = z.object({
  userIds: z.array(id).min(1).max(30),
  teamRole: z.enum(['leader', 'member']).default('member'),
})

export const evidenceCategorySchema = z.enum([
  'development',
  'meeting',
  'presentation',
  'research',
  'fieldwork',
  'report',
  'other',
])

export const createEvidenceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: optionalText(4000),
  category: evidenceCategorySchema.default('other'),
  activityDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), '활동 날짜가 필요합니다.')
    .transform((value) => new Date(value)),
})

export const updateEvidenceSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: optionalText(4000),
  category: evidenceCategorySchema.optional(),
  activityDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), '활동 날짜 형식이 올바르지 않습니다.')
    .transform((value) => new Date(value))
    .optional(),
})

export const reviewEvidenceSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: optionalText(2000),
  })
  .refine((value) => value.decision === 'approve' || (value.note && value.note.length >= 2), {
    path: ['note'],
    message: '반려 사유를 입력해 주세요.',
  })

export const evidenceQueueSchema = z.object({
  status: z.enum(['submitted', 'approved', 'rejected', 'all']).default('submitted'),
  projectId: id.optional(),
})

export const dashboardQuerySchema = z.object({
  programId: id.optional(),
})
