import type { ImageUploadPreset } from './readImageFile'

/** 원본 선택 허용 (적용 시 JPEG로 리사이즈·압축) */
const MAX_SOURCE_BYTES = 16 * 1024 * 1024

export const CROP_VIEWPORT: Record<ImageUploadPreset, { width: number; height: number }> = {
  avatar: { width: 320, height: 320 },
  cover: { width: 480, height: 120 },
  post: { width: 360, height: 360 },
}

export const CROP_ASPECT: Record<ImageUploadPreset, number> = {
  avatar: 1,
  cover: 4,
  post: 1,
}

export const CROP_OUTPUT: Record<
  ImageUploadPreset,
  { width: number; height: number; maxOutputBytes: number }
> = {
  avatar: { width: 512, height: 512, maxOutputBytes: 120_000 },
  cover: { width: 1280, height: 320, maxOutputBytes: 200_000 },
  post: { width: 1080, height: 1080, maxOutputBytes: 420_000 },
}

export type CropTransform = {
  panX: number
  panY: number
  zoom: number
}

export type LoadedCropImage = {
  image: HTMLImageElement
  src: string
  revoke?: () => void
}

export function validateImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 선택할 수 있습니다.')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('16MB 이하 이미지만 업로드할 수 있습니다.')
  }
}

export function loadImageFromFile(file: File): Promise<LoadedCropImage & { revoke?: () => void }> {
  validateImageFile(file)

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({
        image,
        src: objectUrl,
        revoke: () => URL.revokeObjectURL(objectUrl),
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('이미지를 읽지 못했습니다.'))
    }
    image.src = objectUrl
  })
}

export function getBaseScale(
  image: HTMLImageElement,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    return 1
  }
  return Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight)
}

export function getDisplayScale(
  image: HTMLImageElement,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
) {
  return getBaseScale(image, viewportWidth, viewportHeight) * zoom
}

export function clampCropTransform(
  image: HTMLImageElement,
  viewportWidth: number,
  viewportHeight: number,
  transform: CropTransform,
): CropTransform {
  const zoom = Math.min(3, Math.max(1, transform.zoom))
  const scale = getDisplayScale(image, viewportWidth, viewportHeight, zoom)
  const displayWidth = image.naturalWidth * scale
  const displayHeight = image.naturalHeight * scale

  const minPanX = viewportWidth / 2 - displayWidth / 2
  const maxPanX = displayWidth / 2 - viewportWidth / 2
  const minPanY = viewportHeight / 2 - displayHeight / 2
  const maxPanY = displayHeight / 2 - viewportHeight / 2

  return {
    zoom,
    panX: Math.min(maxPanX, Math.max(minPanX, transform.panX)),
    panY: Math.min(maxPanY, Math.max(minPanY, transform.panY)),
  }
}

function canvasToDataUrl(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL('image/jpeg', quality)
}

export function exportCroppedImage(
  image: HTMLImageElement,
  preset: ImageUploadPreset,
  transform: CropTransform,
  viewportSize = CROP_VIEWPORT[preset],
) {
  const output = CROP_OUTPUT[preset]
  const clamped = clampCropTransform(
    image,
    viewportSize.width,
    viewportSize.height,
    transform,
  )
  const scale = getDisplayScale(image, viewportSize.width, viewportSize.height, clamped.zoom)

  const displayWidth = image.naturalWidth * scale
  const displayHeight = image.naturalHeight * scale
  const imageLeft = viewportSize.width / 2 + clamped.panX - displayWidth / 2
  const imageTop = viewportSize.height / 2 + clamped.panY - displayHeight / 2

  const sourceX = Math.max(0, (0 - imageLeft) / scale)
  const sourceY = Math.max(0, (0 - imageTop) / scale)
  const sourceWidth = Math.min(image.naturalWidth - sourceX, viewportSize.width / scale)
  const sourceHeight = Math.min(image.naturalHeight - sourceY, viewportSize.height / scale)

  const canvas = document.createElement('canvas')
  canvas.width = output.width
  canvas.height = output.height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('이미지 처리에 실패했습니다.')
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    output.width,
    output.height,
  )

  let quality = 0.88
  let dataUrl = canvasToDataUrl(canvas, quality)

  while (dataUrl.length > output.maxOutputBytes && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvasToDataUrl(canvas, quality)
  }

  if (dataUrl.length > output.maxOutputBytes) {
    throw new Error('이미지 용량이 너무 큽니다. 다른 사진을 선택해 주세요.')
  }

  return dataUrl
}
