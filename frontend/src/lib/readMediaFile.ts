import { readImageFile, type ImageUploadPreset } from './readImageFile'

const MAX_VIDEO_BYTES = 12 * 1024 * 1024

function readFileAsDataUrl(file: File) {
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

export async function readMediaFile(file: File, imagePreset: ImageUploadPreset = 'post') {
  if (file.type.startsWith('image/')) {
    return readImageFile(file, imagePreset)
  }

  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('동영상은 12MB 이하만 업로드할 수 있습니다.')
    }
    return readFileAsDataUrl(file)
  }

  throw new Error('사진 또는 동영상 파일만 선택할 수 있습니다.')
}
