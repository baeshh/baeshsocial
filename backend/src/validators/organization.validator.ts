import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === '' || /^https?:\/\//i.test(value), { message: 'Must be an http(s) URL' })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

const contactEmail = z
  .union([z.literal(''), z.string().trim().email().max(200)])
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()

export const organizationTypeSchema = z
  .enum(['university', 'institution', 'company'])
  .transform((value) => value.toUpperCase() as 'UNIVERSITY' | 'INSTITUTION' | 'COMPANY')

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: organizationTypeSchema,
  description: optionalText(2000),
  website: httpUrl,
  contactEmail,
  registrationNumber: optionalText(40),
})

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  type: organizationTypeSchema.optional(),
  description: optionalText(2000),
  website: httpUrl,
  contactEmail,
  registrationNumber: optionalText(40),
})

const DOCUMENT_DATA_URL = /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,/i

export const submitVerificationSchema = z.object({
  documentType: z
    .enum(['business_registration', 'employment_certificate', 'official_letter', 'other'])
    .transform(
      (value) =>
        value.toUpperCase() as
          | 'BUSINESS_REGISTRATION'
          | 'EMPLOYMENT_CERTIFICATE'
          | 'OFFICIAL_LETTER'
          | 'OTHER',
    ),
  documentName: optionalText(200),
  // Base64 data URL (PDF/image, ~7MB file) or an https link to the document.
  documentUrl: z
    .string()
    .max(10_000_000)
    .refine((value) => DOCUMENT_DATA_URL.test(value) || /^https:\/\//i.test(value), {
      message: 'documentUrl must be a PDF/image data URL or an https URL',
    }),
  note: optionalText(1000),
})

export const joinOrganizationSchema = z.object({
  title: optionalText(120),
  message: optionalText(500),
})

export const memberDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
})

export const updateMemberRoleSchema = z.object({
  role: z
    .enum(['admin', 'manager', 'member'])
    .transform((value) => value.toUpperCase() as 'ADMIN' | 'MANAGER' | 'MEMBER'),
  title: optionalText(120),
})

export const reviewOrganizationSchema = z.object({
  decision: z.enum(['approved', 'rejected']).transform((value) => value.toUpperCase() as 'APPROVED' | 'REJECTED'),
  note: optionalText(1000),
})

export const organizationDirectorySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(['university', 'institution', 'company']).optional(),
})
