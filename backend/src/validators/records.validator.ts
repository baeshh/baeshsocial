import { z } from 'zod'

export const projectRecordQuerySchema = z.object({
  status: z.enum(['active', 'final', 'all']).default('all'),
  programId: z.string().trim().min(1).max(64).optional(),
  cursor: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
})

export const recordCorrectionSchema = z.object({
  reason: z.string().trim().min(2, '정정 사유를 입력해 주세요.').max(500),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((value) => value || null),
})

export const recordRedactionSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(2, '비식별 처리 사유를 입력해 주세요.').max(500),
})

export const retentionPolicySchema = z.object({
  basis: z.enum(['law', 'contract', 'service_policy']),
  /** The clause, contract or policy document the period comes from. */
  reference: z.string().trim().min(2, '보존 근거(법령 조항, 계약, 정책 문서)를 입력해 주세요.').max(300),
  /** Null = no end date until a basis with a period is set. */
  retentionMonths: z.number().int().min(1).max(1200).nullable(),
})
