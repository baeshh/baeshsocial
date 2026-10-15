import { createHash } from 'node:crypto'
import { EvidenceFileKind } from '@prisma/client'
import { FileRejectedError, scanWithClamAv, uploadedFileName, validateUpload } from './fileValidation.js'

const MB = 1024 * 1024

export type ProjectFileKind = 'image' | 'video' | 'pdf' | 'document'

export const PROJECT_FILE_LIMITS = {
  maxFilesPerRequest: 10,
  /** Personal projects only; program projects draw on the organization's storage allowance. */
  maxFilesPerProject: 200,
  maxBytesPerProject: 1024 * MB,
  maxDocumentBytes: 25 * MB,
} as const

type DocumentType = { mime: string; label: string; container: 'ooxml' | 'hwpx' | 'hwp'; mainPart?: string }

const DOCUMENTS: Record<string, DocumentType> = {
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: '문서',
    container: 'ooxml',
    mainPart: 'word/document.xml',
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: '발표자료',
    container: 'ooxml',
    mainPart: 'ppt/presentation.xml',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: '스프레드시트',
    container: 'ooxml',
    mainPart: 'xl/workbook.xml',
  },
  hwpx: { mime: 'application/hwp+zip', label: '한글 문서', container: 'hwpx', mainPart: 'Contents/header.xml' },
  hwp: { mime: 'application/x-hwp', label: '한글 문서', container: 'hwp' },
}

const MEDIA_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'mp4', 'm4v', 'mov', 'webm'])

const MEDIA_KIND: Record<EvidenceFileKind, ProjectFileKind> = {
  [EvidenceFileKind.IMAGE]: 'image',
  [EvidenceFileKind.VIDEO]: 'video',
  [EvidenceFileKind.PDF]: 'pdf',
}
const MEDIA_LABEL: Record<EvidenceFileKind, string> = {
  [EvidenceFileKind.IMAGE]: '이미지',
  [EvidenceFileKind.VIDEO]: '영상',
  [EvidenceFileKind.PDF]: 'PDF',
}

/** Macros, ActiveX controls, embedded OLE packages and Excel 4.0 macro sheets can run code when opened. */
const ACTIVE_PARTS = [/(^|\/)vbaProject\.bin$/i, /^(word|ppt|xl)\/activeX\//i, /\/embeddings\/oleObject[^/]*\.bin$/i, /^xl\/macrosheets\//i]

const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
const MAX_ZIP_ENTRIES = 20_000

export type ValidatedProjectFile = {
  buffer: Buffer
  originalName: string
  mimeType: string
  extension: string
  kind: ProjectFileKind
  defaultType: string
  sizeBytes: number
  sha256: string
  scanStatus: 'clean' | 'skipped'
}

export const ACCEPTED_PROJECT_FILES = '사진(JPG·PNG·WEBP), 영상(MP4·MOV·WEBM), PDF, 문서(DOCX·PPTX·XLSX·HWP·HWPX)'

/** Names in the ZIP central directory; nothing is decompressed. Null when the archive is not a plain ZIP. */
export function zipEntryNames(buffer: Buffer): string[] | null {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) return null
  const lowest = Math.max(0, buffer.length - 22 - 0xffff)
  for (let end = buffer.length - 22; end >= lowest; end -= 1) {
    if (buffer.readUInt32LE(end) !== 0x06054b50) continue
    const count = buffer.readUInt16LE(end + 10)
    const size = buffer.readUInt32LE(end + 12)
    let offset = buffer.readUInt32LE(end + 16)
    if (count === 0xffff || offset === 0xffffffff || count > MAX_ZIP_ENTRIES || offset + size > end) return null
    const names: string[] = []
    for (let index = 0; index < count; index += 1) {
      if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) return null
      const nameLength = buffer.readUInt16LE(offset + 28)
      const extraLength = buffer.readUInt16LE(offset + 30)
      const commentLength = buffer.readUInt16LE(offset + 32)
      names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'))
      offset += 46 + nameLength + extraLength + commentLength
    }
    return names
  }
  return null
}

function checkDocumentContent(name: string, type: DocumentType, buffer: Buffer) {
  const mismatch = () => new FileRejectedError(`${name}: 파일 내용이 확장자와 일치하지 않습니다.`)
  if (type.container === 'hwp') {
    if (!buffer.subarray(0, 8).equals(CFB_SIGNATURE) || !buffer.includes('HWP Document File', 0, 'latin1')) throw mismatch()
    return
  }
  const entries = zipEntryNames(buffer)
  if (!entries || !entries.includes(type.mainPart!)) throw mismatch()
  if (type.container === 'hwpx' && !entries.includes('mimetype')) throw mismatch()
  if (type.container === 'ooxml' && !entries.includes('[Content_Types].xml')) throw mismatch()
  if (entries.some((entry) => ACTIVE_PARTS.some((pattern) => pattern.test(entry)))) {
    throw new FileRejectedError(`${name}: 매크로·ActiveX·포함된 실행 개체가 있는 문서는 올릴 수 없습니다.`)
  }
}

/** Photos, video and PDF follow the evidence rules; office and Hangul documents are checked by their container. */
export async function validateProjectUpload(file: { originalname: string; buffer: Buffer; size: number }): Promise<ValidatedProjectFile> {
  const originalName = uploadedFileName(file)
  const extension = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : ''

  if (MEDIA_EXTENSIONS.has(extension)) {
    const media = await validateUpload(file)
    return { ...media, kind: MEDIA_KIND[media.kind], defaultType: MEDIA_LABEL[media.kind] }
  }

  const type = DOCUMENTS[extension]
  if (!type) throw new FileRejectedError(`${originalName}: ${ACCEPTED_PROJECT_FILES}만 올릴 수 있습니다.`)
  if (file.size > PROJECT_FILE_LIMITS.maxDocumentBytes) {
    throw new FileRejectedError(`${originalName}: 문서는 ${PROJECT_FILE_LIMITS.maxDocumentBytes / MB}MB 이하만 올릴 수 있습니다.`)
  }
  checkDocumentContent(originalName, type, file.buffer)
  const scanStatus = await scanWithClamAv(file.buffer)

  return {
    buffer: file.buffer,
    originalName,
    mimeType: type.mime,
    extension,
    kind: 'document',
    defaultType: type.label,
    sizeBytes: file.size,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    scanStatus,
  }
}

const INLINE_PREFIXES = ['image/', 'video/', 'application/pdf']

/** Documents always download; only formats a browser renders safely open in a tab. */
export function opensInline(mimeType: string) {
  return INLINE_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
}
