import { z } from 'zod'

export const postSchema = z.object({
  content: z.string().max(2000).default(''),
  linkedProjectId: z.string().nullable().optional(),
  visibility: z.enum(['public', 'connections', 'private']).default('public'),
  repostOfId: z.string().nullable().optional(),
  mediaUrls: z.array(z.string().max(12_000_000)).max(6).optional(),
})

export const updatePostSchema = postSchema.partial()

export const commentSchema = z.object({
  content: z.string().min(1).max(1000),
  parentId: z.string().min(1).optional(),
})
