import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '../../config/env.js'

export type StoredObject = { key: string }

export type SignedFileUrl = {
  /** Absolute URL (S3) or a path relative to the API base (local driver). */
  url: string
  expiresAt: string
}

type DownloadOptions = { contentType: string; fileName: string; inline: boolean }

interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  remove(key: string): Promise<void>
  signedUrl(key: string, options: DownloadOptions): Promise<SignedFileUrl>
}

function contentDisposition(fileName: string, inline: boolean) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/* ---------------------------------- S3 ---------------------------------- */

class S3StorageDriver implements StorageDriver {
  private client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
  })

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    )
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
  }

  async signedUrl(key: string, options: DownloadOptions) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: contentDisposition(options.fileName, options.inline),
      }),
      { expiresIn: env.FILE_URL_TTL_SECONDS },
    )
    return { url, expiresAt: new Date(Date.now() + env.FILE_URL_TTL_SECONDS * 1000).toISOString() }
  }
}

/* --------------------------------- Local -------------------------------- */
// Development fallback: files live outside any static directory and are only served through
// short-lived HMAC-signed tokens, mirroring S3 presigned URL semantics.

const signingKey = createHmac('sha256', env.JWT_SECRET).update('baesh-local-file-urls').digest()

type LocalTokenPayload = { k: string; ct: string; n: string; i: boolean; exp: number }

function signPayload(payload: LocalTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', signingKey).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyLocalFileToken(token: string): LocalTokenPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', signingKey).update(body).digest()
  const provided = Buffer.from(signature, 'base64url')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LocalTokenPayload
    return payload.exp > Date.now() ? payload : null
  } catch {
    return null
  }
}

const localRoot = path.resolve(env.STORAGE_LOCAL_DIR)

function localPath(key: string) {
  const resolved = path.resolve(localRoot, key)
  if (!resolved.startsWith(localRoot + path.sep)) {
    throw new Error('Invalid storage key')
  }
  return resolved
}

class LocalStorageDriver implements StorageDriver {
  async put(key: string, body: Buffer) {
    const target = localPath(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body, { mode: 0o600 })
  }

  async remove(key: string) {
    await rm(localPath(key), { force: true })
  }

  async signedUrl(key: string, options: DownloadOptions) {
    const exp = Date.now() + env.FILE_URL_TTL_SECONDS * 1000
    const token = signPayload({ k: key, ct: options.contentType, n: options.fileName, i: options.inline, exp })
    return { url: `/files/local/${token}`, expiresAt: new Date(exp).toISOString() }
  }
}

export async function readLocalFile(key: string) {
  return readFile(localPath(key))
}

export function localDownloadHeaders(payload: LocalTokenPayload) {
  return {
    'Content-Type': payload.ct,
    'Content-Disposition': contentDisposition(payload.n, payload.i),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  }
}

/* -------------------------------- Facade -------------------------------- */

export const storage: StorageDriver =
  env.STORAGE_DRIVER === 's3' ? new S3StorageDriver() : new LocalStorageDriver()

if (env.STORAGE_DRIVER === 'local' && env.NODE_ENV === 'production') {
  console.warn('[storage] STORAGE_DRIVER=local in production — evidence files are stored on the server disk. Use s3.')
}

export function buildStorageKey(scope: string, extension: string) {
  const now = new Date()
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return `${scope}/${month}/${randomUUID()}.${extension}`
}
