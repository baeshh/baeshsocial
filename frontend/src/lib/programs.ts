import type {
  EvidenceCategory,
  EvidenceHistoryEntry,
  EvidenceStatus,
  ProgramProjectStatus,
  ProgramStatus,
  ProjectReviewKind,
  ProjectVisibility,
  RecordDisclosure,
  RegistrationStatus,
  SupervisionHealth,
} from '../types/program'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'red'

export const SUPERVISION_META: Record<SupervisionHealth, { label: string; tone: Tone; hint: string }> = {
  evidence_review: { label: '증빙 검토', tone: 'purple', hint: '제출된 증빙이 검토를 기다리고 있습니다.' },
  feedback_needed: { label: '피드백 필요', tone: 'red', hint: '팀의 답변·제외 요청이 있거나 2주 이상 활동이 없습니다.' },
  revision_requested: { label: '수정 요청 중', tone: 'blue', hint: '팀이 수정 요청에 대응하고 있습니다.' },
  on_track: { label: '정상 진행', tone: 'green', hint: '처리할 항목이 없습니다.' },
}

export const REGISTRATION_STATUS_META: Record<RegistrationStatus, { label: string; tone: Tone }> = {
  pending: { label: '승인 대기', tone: 'purple' },
  approved: { label: '등록 승인', tone: 'blue' },
  rejected: { label: '반려', tone: 'red' },
  withdrawn: { label: '철회', tone: 'gray' },
  removed: { label: '프로그램에서 제거', tone: 'gray' },
}

export const REVIEW_KIND_LABEL: Record<ProjectReviewKind, string> = {
  feedback: '피드백',
  revision_request: '수정 요청',
  response: '팀 답변',
  removal_request: '제외·제거 요청',
}

export const VISIBILITY_META: Record<ProjectVisibility, { label: string; description: string }> = {
  private: { label: '비공개', description: '팀장과 팀장이 지정한 팀원, 기관 담당자만 볼 수 있습니다.' },
  team: { label: '팀 공개', description: '공식 팀원 전체와 기관 담당자가 볼 수 있습니다.' },
  public: { label: '전체 공개', description: 'BAESH 사용자 누구나 개요를 볼 수 있습니다. 태스크·파일·증빙은 팀에게만 보입니다.' },
}

export const DISCLOSURE_META: Record<RecordDisclosure, { label: string; description: string }> = {
  hidden: { label: '숨김', description: '본인만 볼 수 있습니다. 프로필·기업 열람에 나타나지 않습니다.' },
  summary: { label: '요약 공개', description: '프로젝트명, 기관·프로그램, 역할과 인증 사실만 보입니다.' },
  full: { label: '상세 공개', description: '요약에 더해 기여 내용·증빙 설명까지 보입니다.' },
}

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
