import { uploadMedia } from '../services/mediaService'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export const POST_MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm'

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('파일을 읽지 못했습니다.'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

export function isVideoMediaUrl(url: string) {
  return /^data:video\//.test(url) || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url)
}

/** Uploaded images are stored as `.../display.webp` with a sibling `thumb.webp`; legacy data URLs have none. */
export function mediaThumbnailUrl(url: string) {
  return /\/display\.webp$/.test(url) ? url.replace(/\/display\.webp$/, '/thumb.webp') : url
}

export async function uploadPostMediaFile(token: string, file: File) {
  if (IMAGE_TYPES.has(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error('사진은 15MB 이하만 올릴 수 있습니다.')
    }
  } else if (VIDEO_TYPES.has(file.type)) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('동영상은 50MB 이하만 올릴 수 있습니다.')
    }
  } else {
    throw new Error('사진(JPG·PNG·WEBP) 또는 동영상(MP4·MOV·WEBM)만 올릴 수 있습니다.')
  }

  const uploaded = await uploadMedia(token, file, 'post')
  return uploaded.url
}
