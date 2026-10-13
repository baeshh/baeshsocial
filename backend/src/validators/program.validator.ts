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

function checkProgramDates(
  value: { startDate?: Date | null; endDate?: Date | null; applyStartAt?: Date | null; applyEndAt?: Date | null },
  ctx: z.RefinementCtx,
) {
  checkPeriod(value, ctx)
  if (value.applyStartAt && value.applyEndAt && value.applyStartAt > value.applyEndAt) {
    ctx.addIssue({ code: 'custom', path: ['applyEndAt'], message: '모집 마감일은 모집 시작일 이후여야 합니다.' })
  }
}

export const programStatusSchema = z.enum(['draft', 'active', 'completed', 'archived'])
export const recordDisclosureSchema = z.enum(['hidden', 'summary', 'full'])

const programPolicyShape = {
  allowStudentProjects: z.boolean().optional(),
  requireProjectApproval: z.boolean().optional(),
  allowStudentTeams: z.boolean().optional(),
  allowPublicProjects: z.boolean().optional(),
  allowMultipleProjects: z.boolean().optional(),
  recordDisclosure: recordDisclosureSchema.optional(),
}

export const programVisibilitySchema = z.enum(['private', 'organization', 'public'])
export const recruitmentModeSchema = z.enum(['selected', 'recruiting'])

const programRecruitmentShape = {
  visibility: programVisibilitySchema.optional(),
  recruitmentMode: recruitmentModeSchema.optional(),
  targetAudience: optionalText(500),
  capacity: z.number().int().min(1).max(10_000).nullable().optional(),
  applyStartAt: optionalDate,
  applyEndAt: optionalDate,
  announceAt: optionalDate,
  selectionProcess: optionalText(2000),
  deliveryMode: z.enum(['online', 'offline', 'hybrid']).nullable().optional(),
  location: optionalText(200),
}

export const createProgramSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: optionalText(4000),
    term: optionalText(40),
    status: programStatusSchema.default('active'),
    startDate: optionalDate,
    endDate: optionalDate,
    managerUserIds: z.array(id).max(30).default([]),
    ...programPolicyShape,
    ...programRecruitmentShape,
  })
  .superRefine(checkProgramDates)

export const updateProgramSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: optionalText(4000),
    term: optionalText(40),
    status: programStatusSchema.optional(),
    startDate: optionalDate,
    endDate: optionalDate,
    managerUserIds: z.array(id).max(30).optional(),
    ...programPolicyShape,
    ...programRecruitmentShape,
  })
  .superRefine(checkProgramDates)

export const discoverProgramsSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(6),
  q: z.string().trim().max(80).optional(),
})

export const programApplySchema = z.object({
  message: optionalText(2000),
})

export const programApplicationQuerySchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected', 'withdrawn', 'all']).default('pending'),
})

export const decideProgramApplicationSchema = z.object({
  decision: z.enum(['accept', 'reject']),
  note: optionalText(1000),
})

const projectVisibilitySchema = z.enum(['private', 'team', 'public'])

export const createProjectRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('new'),
    title: z.string().trim().min(2).max(120),
    teamName: optionalText(60),
    objective: optionalText(2000),
    description: optionalText(4000),
    skills: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    visibility: projectVisibilitySchema.default('team'),
    message: optionalText(1000),
  }),
  z.object({
    mode: z.literal('existing'),
    projectId: id,
    teamName: optionalText(60),
    message: optionalText(1000),
  }),
])

export const projectRequestQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'removed', 'all']).default('all'),
})

export const decideProjectRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'withdraw']),
    note: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: '반려 사유를 입력해 주세요.' })
    }
  })

export const createProjectReviewSchema = z
  .object({
    kind: z.enum(['feedback', 'revision_request', 'response', 'removal_request']),
    body: z.string().trim().min(2).max(4000),
    parentId: id.optional(),
    targetUserId: id.optional(),
  })

export const resolveProjectReviewSchema = z.object({
  status: z.literal('resolved'),
  note: optionalText(1000),
})

export const removeProgramProjectSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
})

const verifyMemberSchema = z
  .object({
    userId: id,
    role: z.string().trim().min(1).max(60),
    contribution: z.string().trim().min(10, '기여 내용을 10자 이상 입력해 주세요.').max(2000),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine(checkPeriod)

export const verifyProjectSchema = z.object({
  outcomeSummary: z.string().trim().min(10, '성과 요약을 10자 이상 입력해 주세요.').max(4000),
  members: z.array(verifyMemberSchema).min(1, '인증할 팀원을 한 명 이상 선택해 주세요.').max(50),
})

export const verifyMembersSchema = z.object({
  members: z.array(verifyMemberSchema).min(1).max(50),
})

export const revokeVerificationSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
  userId: id.optional(),
})

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

export const revokeEvidenceSchema = z.object({
  reason: z.string().trim().min(5, '승인 취소 사유를 5자 이상 입력해 주세요.').max(1000),
})

export const evidenceQueueSchema = z.object({
  status: z.enum(['submitted', 'approved', 'rejected', 'all']).default('submitted'),
  projectId: id.optional(),
})

export const dashboardQuerySchema = z.object({
  programId: id.optional(),
})
