import type { ProjectFile } from '../types/project'

export const PROJECT_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.m4v,.mov,.webm,.pdf,.docx,.pptx,.xlsx,.hwp,.hwpx'
export const PROJECT_FILE_MAX_PER_UPLOAD = 10
export const PROJECT_FILE_HINT = '사진 15MB · PDF·문서 25MB · 영상 100MB · 한 번에 최대 10개 · 매크로 포함 문서 불가'

const MB = 1024 * 1024
const LIMITS: Array<{ pattern: RegExp; max: number; label: string }> = [
  { pattern: /\.(jpe?g|png|webp)$/i, max: 15 * MB, label: '사진은 15MB' },
  { pattern: /\.(pdf|docx|pptx|xlsx|hwpx?)$/i, max: 25 * MB, label: 'PDF·문서는 25MB' },
  { pattern: /\.(mp4|m4v|mov|webm)$/i, max: 100 * MB, label: '영상은 100MB' },
]

/** Client-side pre-check only; the server re-validates type, size and content. */
export function checkProjectFile(file: File) {
  const rule = LIMITS.find((limit) => limit.pattern.test(file.name))
  if (!rule) return `${file.name}: 사진·영상·PDF·문서(DOCX·PPTX·XLSX·HWP·HWPX)만 올릴 수 있습니다.`
  if (file.size > rule.max) return `${file.name}: ${rule.label} 이하만 올릴 수 있습니다.`
  return null
}

export type ProjectFileKind = 'link' | 'image' | 'video' | 'pdf' | 'document'

export function projectFileKind(file: Pick<ProjectFile, 'url' | 'mimeType'>): ProjectFileKind {
  if (file.url !== null || !file.mimeType) return 'link'
  if (file.mimeType.startsWith('image/')) return 'image'
  if (file.mimeType.startsWith('video/')) return 'video'
  if (file.mimeType === 'application/pdf') return 'pdf'
  return 'document'
}
