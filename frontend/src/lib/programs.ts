import type {
  ApplicationFieldType,
  ApplicationStatus,
  DeliveryMode,
  EvidenceCategory,
  EvidenceHistoryEntry,
  EvidenceStatus,
  ProgramAudience,
  ProgramBenefit,
  ProgramCategory,
  ProgramProjectStatus,
  ProgramRecruitment,
  ProgramStatus,
  ProgramVisibility,
  RecruitmentMode,
  RecruitmentState,
  ProjectReviewKind,
  ProjectVisibility,
  RecordDisclosure,
  RegistrationStatus,
  SupervisionHealth,
} from '../types/program'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'amber' | 'red'

export const SUPERVISION_META: Record<SupervisionHealth, { label: string; tone: Tone; hint: string }> = {
  evidence_review: { label: '증빙 검토', tone: 'amber', hint: '제출된 증빙이 검토를 기다리고 있습니다.' },
  feedback_needed: { label: '피드백 필요', tone: 'red', hint: '팀의 답변·제외 요청이 있거나 2주 이상 활동이 없습니다.' },
  revision_requested: { label: '수정 요청 중', tone: 'blue', hint: '팀이 수정 요청에 대응하고 있습니다.' },
  on_track: { label: '정상 진행', tone: 'green', hint: '처리할 항목이 없습니다.' },
}

export const REGISTRATION_STATUS_META: Record<RegistrationStatus, { label: string; tone: Tone }> = {
  pending: { label: '승인 대기', tone: 'amber' },
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

export const PROGRAM_VISIBILITY_META: Record<ProgramVisibility, { label: string; description: string; listed: boolean }> = {
  public: { label: '전체 공개', description: 'Jobs와 검색에 노출되고 누구나 소개를 볼 수 있습니다.', listed: true },
  unlisted: { label: '링크 공개', description: '링크를 받은 사람만 볼 수 있습니다. Jobs·검색 목록에는 나오지 않습니다.', listed: false },
  organization: { label: '조직 내부 공개', description: '이 조직의 구성원에게만 Jobs와 조직 프로그램 목록에 노출됩니다.', listed: true },
  private: { label: '내부 전용', description: '담당자와 승인된 참여자만 볼 수 있습니다. 어디에도 공개되지 않습니다.', listed: false },
}

export const RECRUITMENT_MODE_META: Record<RecruitmentMode, { label: string; question: string; description: string }> = {
  open: {
    label: '공개 모집',
    question: '지금부터 지원자를 모집해요',
    description: '모집 공고를 게시하고 지원서를 받아 선발합니다. 선발된 사람은 자동으로 참여자가 됩니다.',
  },
  preselected: {
    label: '기선발 인원 등록',
    question: '참여자가 이미 정해져 있어요',
    description: '이미 선발한 명단을 이메일·CSV로 등록합니다. 모집 공고와 지원서가 필요 없습니다.',
  },
  invite: {
    label: '초대 모집',
    question: '초대한 사람만 참여해요',
    description: '담당자가 보낸 초대를 수락한 사람만 참여합니다. 임직원·내부 대상 프로그램에 적합합니다.',
  },
  mixed: {
    label: '혼합 모집',
    question: '일부는 정해졌고, 나머지를 추가 모집해요',
    description: '기선발 인원을 먼저 등록하고, 남은 정원만큼 지원서를 받아 추가 선발합니다.',
  },
}

export const takesApplications = (mode: RecruitmentMode) => mode === 'open' || mode === 'mixed'

export const RECRUITMENT_STATE_META: Record<RecruitmentState, { label: string; tone: Tone }> = {
  draft: { label: '모집 준비', tone: 'gray' },
  scheduled: { label: '모집 예정', tone: 'purple' },
  open: { label: '모집 중', tone: 'green' },
  closed: { label: '모집 마감', tone: 'gray' },
  selected: { label: '선발 완료', tone: 'blue' },
  invite_only: { label: '초대 전용', tone: 'gray' },
}

export const PROGRAM_CATEGORY_LABEL: Record<ProgramCategory, string> = {
  education: '교육·연수',
  startup: '창업',
  capstone: '프로젝트·캡스톤',
  internship: '인턴십·현장실습',
  competition: '공모전·해커톤',
  mentoring: '멘토링',
  research: '연구',
  other: '기타',
}

export const PROGRAM_AUDIENCE_LABEL: Record<ProgramAudience, string> = {
  undergraduate: '대학생',
  graduate: '대학원생',
  alumni: '졸업생',
  employee: '재직자·직장인',
  job_seeker: '구직자·취업준비생',
  general: '일반인',
  high_school: '고등학생',
}

export const PROGRAM_BENEFIT_LABEL: Record<ProgramBenefit, string> = {
  certificate: '수료증',
  training: '교육',
  mentoring: '멘토링',
  funding: '지원금',
  networking: '네트워킹',
  workspace: '공간 지원',
}

export const APPLICATION_FIELD_TYPE_LABEL: Record<ApplicationFieldType, string> = {
  short_text: '단답형',
  long_text: '서술형',
  single_choice: '객관식(하나)',
  multi_choice: '객관식(여러 개)',
  url: '포트폴리오·링크',
  file: '첨부파일',
  consent: '동의 항목',
}

export function formatGrades(grades: number[] | undefined) {
  if (!grades?.length) return null
  return [...grades].sort((a, b) => a - b).map((grade) => `${grade}학년`).join(', ')
}

export function formatAudiences(recruitment: Pick<ProgramRecruitment, 'audiences' | 'targetAudience'>) {
  const labels = recruitment.audiences.map((audience) => PROGRAM_AUDIENCE_LABEL[audience])
  return [labels.join('·'), recruitment.targetAudience].filter(Boolean).join(' · ') || null
}

/** Share URL of a program page; unlisted programs carry their token. */
export function programShareUrl(programId: string, shareToken?: string | null) {
  const base = `${window.location.origin}/programs/${programId}`
  return shareToken ? `${base}?t=${encodeURIComponent(shareToken)}` : base
}

export const APPLICATION_STATUS_META: Record<ApplicationStatus, { label: string; tone: Tone }> = {
  draft: { label: '작성 중', tone: 'gray' },
  pending: { label: '심사 중', tone: 'amber' },
  waitlisted: { label: '대기', tone: 'amber' },
  accepted: { label: '합격 · 응답 대기', tone: 'amber' },
  confirmed: { label: '참여 확정', tone: 'green' },
  declined: { label: '참여 포기', tone: 'gray' },
  rejected: { label: '미선발', tone: 'gray' },
  withdrawn: { label: '지원 취소', tone: 'gray' },
}

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
  online: '온라인',
  offline: '오프라인',
  hybrid: '온·오프라인 병행',
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

/** `datetime-local` input value in the browser's time zone. */
export function toDateTimeInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null
}

/** "마감 D-3", "오늘 마감", "3일 후 모집 시작" style hint for a recruitment window. */
export function recruitmentDeadlineHint(recruitment: ProgramRecruitment, now = new Date()) {
  const days = (target: string) => Math.ceil((new Date(target).getTime() - now.getTime()) / 86_400_000)
  if (recruitment.state === 'open' && recruitment.applyEndAt) {
    const left = days(recruitment.applyEndAt)
    return left <= 1 ? '오늘 마감' : `마감 D-${left}`
  }
  if (recruitment.state === 'scheduled' && recruitment.applyStartAt) {
    const left = days(recruitment.applyStartAt)
    return left <= 1 ? '곧 모집 시작' : `${left}일 후 모집 시작`
  }
  return null
}

export const PROJECT_STATUS_LABEL: Record<ProgramProjectStatus, string> = {
  planning: '기획',
  active: '진행',
  completed: '완료',
  archived: '보관',
}

export const EVIDENCE_STATUS_META: Record<EvidenceStatus, { label: string; tone: Tone }> = {
  draft: { label: '임시저장', tone: 'gray' },
  submitted: { label: '검토 대기', tone: 'amber' },
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
