import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '../../config/env.js'

// Public media (post images/videos, avatars, covers) is intentionally separate from the private
// evidence store: objects are immutable, content-addressed by random keys and served via a CDN.

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const S3_PREFIX = 'media/'

export const mediaPublicBaseUrl = (
  env.MEDIA_PUBLIC_BASE_URL ?? `${env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`}/media`
).replace(/\/+$/, '')

export const mediaLocalRoot = path.resolve(env.MEDIA_LOCAL_DIR)

interface MediaDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>
}

class S3MediaDriver implements MediaDriver {
  private client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
  })

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.MEDIA_S3_BUCKET || env.S3_BUCKET,
        Key: `${S3_PREFIX}${key}`,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE,
      }),
    )
  }
}

class LocalMediaDriver implements MediaDriver {
  async put(key: string, body: Buffer) {
    const target = path.resolve(mediaLocalRoot, key)
    if (!target.startsWith(mediaLocalRoot + path.sep)) {
      throw new Error('Invalid media key')
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body, { mode: 0o644 })
  }
}

export const mediaStorage: MediaDriver = env.STORAGE_DRIVER === 's3' ? new S3MediaDriver() : new LocalMediaDriver()

export const mediaStaticOptions = {
  immutable: true,
  maxAge: '365d',
  index: false as const,
  dotfiles: 'deny' as const,
  setHeaders(res: { setHeader(name: string, value: string): void }) {
    res.setHeader('Cache-Control', IMMUTABLE_CACHE)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  },
}

export function mediaUrlFor(key: string) {
  return `${mediaPublicBaseUrl}/${key}`
}

export function isHostedMediaUrl(url: string) {
  return url.startsWith(`${mediaPublicBaseUrl}/`) && !url.includes('..')
}
