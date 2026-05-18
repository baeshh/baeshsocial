const MAX_SOURCE_BYTES = 8 * 1024 * 1024

export type ImageUploadPreset = 'avatar' | 'cover' | 'post'

const PRESETS: Record<
  ImageUploadPreset,
  { maxWidth: number; maxHeight: number; maxOutputBytes: number }
> = {
  avatar: { maxWidth: 400, maxHeight: 400, maxOutputBytes: 80_000 },
  cover: { maxWidth: 1280, maxHeight: 720, maxOutputBytes: 180_000 },
  post: { maxWidth: 1080, maxHeight: 1080, maxOutputBytes: 420_000 },
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽지 못했습니다.'))
    }
    image.src = url
  })
}

function fitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL('image/jpeg', quality)
}

async function compressImageFile(file: File, preset: ImageUploadPreset) {
  const { maxWidth, maxHeight, maxOutputBytes } = PRESETS[preset]
  const image = await loadImageElement(file)
  const { width, height } = fitDimensions(image.naturalWidth, image.naturalHeight, maxWidth, maxHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('이미지 처리에 실패했습니다.')
  }

  context.drawImage(image, 0, 0, width, height)

  let quality = 0.88
  let dataUrl = canvasToDataUrl(canvas, quality)

  while (dataUrl.length > maxOutputBytes && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvasToDataUrl(canvas, quality)
  }

  if (dataUrl.length > maxOutputBytes) {
    throw new Error('이미지 용량이 너무 큽니다. 다른 사진을 선택해 주세요.')
  }

  return dataUrl
}

export async function readImageFile(file: File, preset: ImageUploadPreset = 'avatar') {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 선택할 수 있습니다.')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('8MB 이하 이미지만 업로드할 수 있습니다.')
  }

  return compressImageFile(file, preset)
}
