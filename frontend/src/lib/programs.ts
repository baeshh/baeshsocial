import type {
  EvidenceCategory,
  EvidenceHistoryEntry,
  EvidenceStatus,
  ProgramProjectStatus,
  ProgramStatus,
} from '../types/program'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'red'

export const PROGRAM_STATUS_META: Record<ProgramStatus, { label: string; tone: Tone }> = {
  draft: { label: '준비 중', tone: 'gray' },
  active: { label: '진행 중', tone: 'blue' },
  completed: { label: '종료', tone: 'green' },
  archived: { label: '보관', tone: 'gray' },
}

export const PROJECT_STATUS_LABEL: Record<ProgramProjectStatus, string> = {
  planning: '기획',
  active: '진행',
  completed: '완료',
  archived: '보관',
}

export const EVIDENCE_STATUS_META: Record<EvidenceStatus, { label: string; tone: Tone }> = {
  draft: { label: '임시저장', tone: 'gray' },
  submitted: { label: '검토 대기', tone: 'purple' },
  approved: { label: '승인', tone: 'green' },
  rejected: { label: '반려', tone: 'red' },
}

export const EVIDENCE_CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  development: '개발',
  meeting: '회의',
  presentation: '발표',
  research: '조사·연구',
  fieldwork: '현장 활동',
  report: '보고서',
  other: '기타',
}

export const EVIDENCE_ACTION_LABEL: Record<EvidenceHistoryEntry['action'], string> = {
  submitted: '제출',
  resubmitted: '재제출',
  approved: '승인',
  rejected: '반려',
  revoked: '승인 취소',
}

export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.webp,.mp4,.m4v,.mov,.webm,.pdf'

const EVIDENCE_LIMITS: Array<{ pattern: RegExp; max: number; label: string }> = [
  { pattern: /\.(jpe?g|png|webp)$/i, max: 15 * 1024 * 1024, label: '사진은 15MB' },
  { pattern: /\.pdf$/i, max: 25 * 1024 * 1024, label: 'PDF는 25MB' },
  { pattern: /\.(mp4|m4v|mov|webm)$/i, max: 100 * 1024 * 1024, label: '영상은 100MB' },
]

/** Client-side pre-check only; the server re-validates type, size and content. */
export function checkEvidenceFile(file: File) {
  const rule = EVIDENCE_LIMITS.find((limit) => limit.pattern.test(file.name))
  if (!rule) return `${file.name}: 사진·영상·PDF만 올릴 수 있습니다.`
  if (file.size > rule.max) return `${file.name}: ${rule.label} 이하만 올릴 수 있습니다.`
  return null
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatPeriod(start: string | null, end: string | null) {
  if (!start && !end) return '기간 미정'
  return `${formatDate(start)} ~ ${formatDate(end)}`
}

export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : ''
}

export function percent(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${value}%`
}
