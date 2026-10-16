import { apiUpload } from '../lib/api'

export type MediaPurpose = 'post' | 'avatar' | 'cover'

export type UploadedMedia = {
  kind: 'image' | 'video'
  url: string
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  sizeBytes: number
}

export function uploadMedia(token: string, file: Blob, purpose: MediaPurpose, fileName?: string) {
  const form = new FormData()
  form.append('purpose', purpose)
  form.append('file', file, fileName ?? (file instanceof File ? file.name : `${purpose}.jpg`))
  return apiUpload<UploadedMedia>('/media', form, { token })
}

/** Cropped avatars/covers arrive as data URLs; already-hosted URLs are returned unchanged. */
export async function uploadDataUrlIfNeeded(token: string, value: string | null, purpose: MediaPurpose) {
  if (!value || !value.startsWith('data:')) {
    return value
  }
  const blob = await (await fetch(value)).blob()
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
  const uploaded = await uploadMedia(token, blob, purpose, `${purpose}.${extension}`)
  return uploaded.url
}
