import { z } from 'zod'
import { isHostedMediaUrl } from '../services/storage/mediaStorage.js'

// Inline data URLs are still accepted so posts created before media uploads existed can be edited.
const LEGACY_INLINE_MEDIA = /^data:(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|ogg));base64,/

const mediaUrlField = z
  .string()
  .max(12_000_000)
  .refine((url) => isHostedMediaUrl(url) || LEGACY_INLINE_MEDIA.test(url), {
    message: '업로드한 사진·동영상만 첨부할 수 있습니다.',
  })

export const postSchema = z.object({
  content: z.string().max(2000).default(''),
  linkedProjectId: z.string().nullable().optional(),
  visibility: z.enum(['public', 'connections', 'private']).default('public'),
  repostOfId: z.string().nullable().optional(),
  mediaUrls: z.array(mediaUrlField).max(6).optional(),
})

export const updatePostSchema = postSchema.partial()

export const commentSchema = z.object({
  content: z.string().min(1).max(1000),
  parentId: z.string().min(1).optional(),
})
