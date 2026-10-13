import { createHash } from 'node:crypto'
import net from 'node:net'
import { EvidenceFileKind } from '@prisma/client'
import { env } from '../../config/env.js'
import { HttpError } from '../../utils/httpError.js'

export class FileRejectedError extends HttpError {
  constructor(message: string) {
    super(400, message)
  }
}

type DetectedType = { mime: string; extension: string; kind: EvidenceFileKind; maxBytes: number }

const MB = 1024 * 1024

export const UPLOAD_LIMITS = {
  maxFileBytes: 100 * MB,
  maxFilesPerRequest: 10,
  maxFilesPerEvidence: 10,
} as const

const TYPES: Record<string, DetectedType> = {
  jpeg: { mime: 'image/jpeg', extension: 'jpg', kind: EvidenceFileKind.IMAGE, maxBytes: 15 * MB },
  png: { mime: 'image/png', extension: 'png', kind: EvidenceFileKind.IMAGE, maxBytes: 15 * MB },
  webp: { mime: 'image/webp', extension: 'webp', kind: EvidenceFileKind.IMAGE, maxBytes: 15 * MB },
  pdf: { mime: 'application/pdf', extension: 'pdf', kind: EvidenceFileKind.PDF, maxBytes: 25 * MB },
  mp4: { mime: 'video/mp4', extension: 'mp4', kind: EvidenceFileKind.VIDEO, maxBytes: 100 * MB },
  mov: { mime: 'video/quicktime', extension: 'mov', kind: EvidenceFileKind.VIDEO, maxBytes: 100 * MB },
  webm: { mime: 'video/webm', extension: 'webm', kind: EvidenceFileKind.VIDEO, maxBytes: 100 * MB },
}

const EXTENSION_ALIASES: Record<string, keyof typeof TYPES> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  pdf: 'pdf',
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mov',
  webm: 'webm',
}

export function detectFileType(buffer: Buffer): DetectedType | null {
  const detected = sniff(buffer)
  return detected ? TYPES[detected] : null
}

/** Identify the file from its leading bytes; the client-supplied MIME type is never trusted. */
function sniff(buffer: Buffer): keyof typeof TYPES | null {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('latin1')
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  if (ascii(0, 5) === '%PDF-') return 'pdf'
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return 'webm'
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    return brand === 'qt  ' ? 'mov' : 'mp4'
  }
  return null
}

const PDF_ACTIVE_CONTENT = /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA|RichMedia|XFA)\b/

export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim()
  return (cleaned || 'file').slice(0, 180)
}

type ScanResult = 'clean' | 'skipped'

/** Streams the buffer to clamd (INSTREAM) when CLAMAV_HOST is configured. */
export async function scanWithClamAv(buffer: Buffer): Promise<ScanResult> {
  if (!env.CLAMAV_HOST) {
    if (env.MALWARE_SCAN_REQUIRED) {
      throw new FileRejectedError('악성코드 검사기를 사용할 수 없어 업로드를 거부했습니다.')
    }
    return 'skipped'
  }

  const verdict = await new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT })
    let response = ''
    socket.setTimeout(30_000, () => socket.destroy(new Error('ClamAV scan timed out')))
    socket.on('connect', () => {
      socket.write('zINSTREAM\0')
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024)
        const size = Buffer.alloc(4)
        size.writeUInt32BE(chunk.length)
        socket.write(size)
        socket.write(chunk)
      }
      socket.write(Buffer.alloc(4))
    })
    socket.on('data', (data) => {
      response += data.toString()
    })
    socket.on('end', () => resolve(response.replace(/\0/g, '').trim()))
    socket.on('error', reject)
  }).catch((error: unknown) => {
    if (env.MALWARE_SCAN_REQUIRED) {
      throw new FileRejectedError('악성코드 검사에 실패해 업로드를 거부했습니다.')
    }
    console.error('[upload] ClamAV unavailable, continuing without scan:', error)
    return 'SKIPPED'
  })

  if (verdict === 'SKIPPED') return 'skipped'
  if (!verdict.endsWith('OK')) {
    throw new FileRejectedError('악성코드가 의심되는 파일이라 업로드할 수 없습니다.')
  }
  return 'clean'
}

export type ValidatedFile = {
  buffer: Buffer
  originalName: string
  mimeType: string
  extension: string
  kind: EvidenceFileKind
  sizeBytes: number
  sha256: string
  scanStatus: ScanResult
}

export async function validateUpload(file: { originalname: string; buffer: Buffer; size: number }): Promise<ValidatedFile> {
  const originalName = sanitizeFileName(Buffer.from(file.originalname, 'latin1').toString('utf8'))
  const declaredExtension = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : ''
  const declared = EXTENSION_ALIASES[declaredExtension]
  if (!declared) {
    throw new FileRejectedError(`${originalName}: 사진(JPG·PNG·WEBP), 영상(MP4·MOV·WEBM), PDF만 올릴 수 있습니다.`)
  }

  const detected = sniff(file.buffer)
  if (!detected || TYPES[detected].kind !== TYPES[declared].kind || TYPES[detected].mime !== TYPES[declared].mime) {
    // mov/mp4 share the ISO container; accept either brand for either extension.
    const bothVideoContainers = detected && ['mp4', 'mov'].includes(detected) && ['mp4', 'mov'].includes(declared)
    if (!bothVideoContainers) {
      throw new FileRejectedError(`${originalName}: 파일 내용이 확장자와 일치하지 않습니다.`)
    }
  }

  const type = TYPES[detected!]
  if (file.size > type.maxBytes) {
    throw new FileRejectedError(`${originalName}: ${Math.round(type.maxBytes / MB)}MB 이하만 올릴 수 있습니다.`)
  }

  if (type.kind === EvidenceFileKind.PDF && PDF_ACTIVE_CONTENT.test(file.buffer.toString('latin1'))) {
    throw new FileRejectedError(`${originalName}: 스크립트·첨부 실행 요소가 포함된 PDF는 올릴 수 없습니다.`)
  }

  const scanStatus = await scanWithClamAv(file.buffer)

  return {
    buffer: file.buffer,
    originalName,
    mimeType: type.mime,
    extension: type.extension,
    kind: type.kind,
    sizeBytes: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    scanStatus,
  }
}
