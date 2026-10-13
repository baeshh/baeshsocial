import { randomUUID } from 'node:crypto'
import { EvidenceFileKind } from '@prisma/client'
import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { z } from 'zod'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { detectFileType, FileRejectedError, scanWithClamAv } from '../../services/storage/fileValidation.js'
import { mediaStorage, mediaUrlFor } from '../../services/storage/mediaStorage.js'

const MB = 1024 * 1024
const MAX_IMAGE_BYTES = 15 * MB
const MAX_VIDEO_BYTES = 50 * MB
const MAX_INPUT_PIXELS = 50_000_000

type Purpose = 'post' | 'avatar' | 'cover'

const PRESETS: Record<Purpose, { display: number; thumb: number; thumbFit: 'cover' | 'inside'; allowVideo: boolean }> = {
  post: { display: 1600, thumb: 480, thumbFit: 'inside', allowVideo: true },
  avatar: { display: 512, thumb: 160, thumbFit: 'cover', allowVideo: false },
  cover: { display: 1920, thumb: 640, thumbFit: 'inside', allowVideo: false },
}

const purposeSchema = z.enum(['post', 'avatar', 'cover']).default('post')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
})

function buildMediaKey(purpose: Purpose) {
  const now = new Date()
  return `${purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}`
}

export const mediaRouter = Router()

mediaRouter.use(authenticate)

mediaRouter.post('/', upload.single('file'), async (req, res) => {
  const purpose = purposeSchema.parse(req.body?.purpose || undefined)
  const preset = PRESETS[purpose]
  const file = req.file
  if (!file) {
    throw new FileRejectedError('업로드할 파일을 선택해 주세요.')
  }

  const detected = detectFileType(file.buffer)
  const baseKey = buildMediaKey(purpose)

  if (detected?.kind === EvidenceFileKind.IMAGE) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new FileRejectedError('사진은 15MB 이하만 올릴 수 있습니다.')
    }

    // Re-encoding drops EXIF (including GPS) and any payload smuggled after the image data.
    const source = sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' }).rotate()
    let display: { data: Buffer; info: sharp.OutputInfo }
    let thumb: Buffer
    try {
      display = await source
        .clone()
        .resize({ width: preset.display, height: preset.display, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true })
      thumb = await source
        .clone()
        .resize({ width: preset.thumb, height: preset.thumb, fit: preset.thumbFit, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer()
    } catch {
      throw new FileRejectedError('사진을 처리하지 못했습니다. 손상되지 않은 JPG·PNG·WEBP 파일을 올려 주세요.')
    }

    await Promise.all([
      mediaStorage.put(`${baseKey}/display.webp`, display.data, 'image/webp'),
      mediaStorage.put(`${baseKey}/thumb.webp`, thumb, 'image/webp'),
    ])

    res.status(201).json({
      kind: 'image',
      url: mediaUrlFor(`${baseKey}/display.webp`),
      thumbnailUrl: mediaUrlFor(`${baseKey}/thumb.webp`),
      width: display.info.width,
      height: display.info.height,
      sizeBytes: display.data.length,
    })
    return
  }

  if (detected?.kind === EvidenceFileKind.VIDEO && preset.allowVideo) {
    await scanWithClamAv(file.buffer)
    const key = `${baseKey}/video.${detected.extension}`
    await mediaStorage.put(key, file.buffer, detected.mime)
    res.status(201).json({
      kind: 'video',
      url: mediaUrlFor(key),
      thumbnailUrl: null,
      width: null,
      height: null,
      sizeBytes: file.size,
    })
    return
  }

  throw new FileRejectedError(
    preset.allowVideo
      ? '사진(JPG·PNG·WEBP) 또는 동영상(MP4·MOV·WEBM)만 올릴 수 있습니다.'
      : '사진(JPG·PNG·WEBP)만 올릴 수 있습니다.',
  )
})
