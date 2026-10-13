import { ProjectLinkType } from '@prisma/client'
import { pageQuerySchema } from '../utils/pagination.js'
import { z } from 'zod'

export const projectSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1200).nullable().optional(),
  objective: z.string().max(1200).nullable().optional(),
  readme: z.string().max(8000).nullable().optional(),
  status: z.enum(['planning', 'active', 'completed', 'archived']).default('planning'),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  visibility: z.enum(['private', 'team', 'public']).default('private'),
  skills: z.array(z.string().min(1).max(60)).default([]),
})

export const updateProjectSchema = projectSchema.partial()

export const projectMemberSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1).max(120),
  contribution: z.string().max(1000).nullable().optional(),
})

export const projectInviteSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  contribution: z.string().max(1000).nullable().optional(),
})

export const projectRoleSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  permissions: z.array(z.string().min(1)).min(1),
})

export const updateProjectRoleSchema = projectRoleSchema.partial()

export const assignMemberRoleSchema = z.object({
  roleId: z.string().min(1),
})

export const projectTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']).default('todo'),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

export const updateProjectTaskSchema = projectTaskSchema.partial()

export const projectActivitySchema = z.object({
  type: z.enum(['update', 'task', 'file', 'milestone', 'insight']).default('update'),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
})

export const projectFileSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  fileType: z.string().min(1).max(80),
})

const linkTypeSchema = z
  .enum(['github', 'figma', 'notion', 'google_drive', 'deployment', 'other'])
  .transform((value) => value.toUpperCase() as ProjectLinkType)

export const projectLinkSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  type: linkTypeSchema.optional(),
  label: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
})

export const updateProjectLinkSchema = projectLinkSchema.partial()

export const projectListQuerySchema = pageQuerySchema(100, 100)
