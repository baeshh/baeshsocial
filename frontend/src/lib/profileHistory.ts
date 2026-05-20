import type {
  Award,
  Career,
  Certificate,
  ProfilePayload,
  ProfileProject,
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  VerifiedRecord,
} from '../types/profile'
import type { OpportunityType } from '../types/opportunity'

/** 프로필 이력 자동 분류 카테고리 */
export type HistoryCategory =
  | 'award'
  | 'certificate'
  | 'career'
  | 'program_education'
  | 'program_hackathon'
  | 'program_competition'
  | 'program_startup'
  | 'program'
  | 'project_verified'
  | 'project_owned'
  | 'project_member'

export type HistorySourceKind =
  | 'certificate'
  | 'career'
  | 'award'
  | 'program'
  | 'verified_record'
  | 'project'

export type ProfileHistoryItem = {
  id: string
  sourceKind: HistorySourceKind
  category: HistoryCategory
  categoryLabel: string
  title: string
  meta: string
  date: string | null
  verified?: boolean
  program?: boolean
  ongoing?: boolean
  enrollmentStatus?: ProgramEnrollmentStatus
  editable?: boolean
  editKind?: 'certificate' | 'career' | 'award'
  editId?: string
}

function formatShortDate(value: string | null) {
  if (!value) {
    return null
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function formatCareerMeta(career: Career) {
  const start = formatShortDate(career.startDate)
  const end = formatShortDate(career.endDate)
  let period = '현재 진행 중'
  if (start && end) {
    period = `${start} – ${end}`
  } else if (start) {
    period = `${start} – 현재`
  } else if (end) {
    period = `~ ${end}`
  }
  if (career.description?.trim()) {
    return `${period} · ${career.description.trim()}`
  }
  return period
}

export const PROFILE_VISIBLE_PROGRAM_STATUSES: ProgramEnrollmentStatus[] = ['ENROLLED', 'COMPLETED']

export const HISTORY_CATEGORY_ORDER: HistoryCategory[] = [
  'award',
  'program_startup',
  'program_competition',
  'program_hackathon',
  'program_education',
  'program',
  'certificate',
  'project_verified',
  'project_owned',
  'project_member',
  'career',
]

type CategoryMeta = {
  label: string
  badgeTone: 'blue' | 'purple' | 'green' | 'gray' | 'red'
  description: string
}

export const HISTORY_CATEGORY_META: Record<HistoryCategory, CategoryMeta> = {
  award: {
    label: '수상',
    badgeTone: 'purple',
    description: '대회·공모전 수상, 표창 등',
  },
  certificate: {
    label: '자격·수료',
    badgeTone: 'blue',
    description: '자격증, 수료증 등 직접 등록한 이력',
  },
  career: {
    label: '경력',
    badgeTone: 'gray',
    description: '재직·인턴·프리랜서 등 경력',
  },
  program_education: {
    label: '교육·부트캠프',
    badgeTone: 'green',
    description: '교육·부트캠프 선정 및 수료',
  },
  program_hackathon: {
    label: '해커톤',
    badgeTone: 'purple',
    description: '해커톤 참가·수상·완주',
  },
  program_competition: {
    label: '공모전',
    badgeTone: 'purple',
    description: '공모전·대회 선정 및 수상',
  },
  program_startup: {
    label: '창업·사업',
    badgeTone: 'green',
    description: '창업·액셀·지원사업 선정 및 수료',
  },
  program: {
    label: '프로그램',
    badgeTone: 'blue',
    description: '기타 프로그램 참여',
  },
  project_verified: {
    label: '프로젝트 검증',
    badgeTone: 'green',
    description: '검증된 프로젝트·사업 기여',
  },
  project_owned: {
    label: '사업·프로젝트',
    badgeTone: 'blue',
    description: '직접 운영·등록한 프로젝트',
  },
  project_member: {
    label: '프로젝트 참여',
    badgeTone: 'gray',
    description: '팀·협업 프로젝트 참여',
  },
}

function normalizeOpportunityType(type: string): OpportunityType | null {
  const upper = type.toUpperCase() as OpportunityType
  const allowed: OpportunityType[] = [
    'JOB',
    'INTERNSHIP',
    'HACKATHON',
    'EDUCATION',
    'COMPETITION',
    'STARTUP_PROGRAM',
  ]
  return allowed.includes(upper) ? upper : null
}

export function classifyOpportunityType(type: string): HistoryCategory {
  const normalized = normalizeOpportunityType(type)
  switch (normalized) {
    case 'EDUCATION':
      return 'program_education'
    case 'HACKATHON':
      return 'program_hackathon'
    case 'COMPETITION':
      return 'program_competition'
    case 'STARTUP_PROGRAM':
      return 'program_startup'
    default:
      return 'program'
  }
}

function enrollmentStatusPhrase(
  status: ProgramEnrollmentStatus,
  category: HistoryCategory,
): string {
  if (status === 'COMPLETED') {
    if (category === 'program_startup') return '사업·프로그램 수료'
    if (category === 'program_competition') return '공모전 수료'
    if (category === 'program_hackathon') return '해커톤 완료'
    if (category === 'program_education') return '교육 수료'
    return '수료 완료'
  }
  if (status === 'ENROLLED') {
    if (category === 'program_startup') return '사업·프로그램 선정'
    if (category === 'program_competition') return '공모전 선정'
    if (category === 'program_hackathon') return '해커톤 선정'
    if (category === 'program_education') return '교육 과정 선정'
    return '선정 · 수강 중'
  }
  return status
}

function buildProgramHistoryItem(enrollment: ProgramEnrollment): ProfileHistoryItem {
  const category = classifyOpportunityType(enrollment.opportunity.type)
  const meta = `${enrollment.opportunity.organization} · ${enrollmentStatusPhrase(
    enrollment.status,
    category,
  )}`

  return {
    id: enrollment.id,
    sourceKind: 'program',
    category,
    categoryLabel: HISTORY_CATEGORY_META[category].label,
    title: enrollment.opportunity.title,
    meta,
    date: enrollment.completedAt ?? enrollment.enrolledAt ?? enrollment.appliedAt,
    program: true,
    enrollmentStatus: enrollment.status,
    verified: enrollment.status === 'COMPLETED' && Boolean(enrollment.certificate?.verified),
    editable: false,
  }
}

function buildCertificateItem(
  item: Certificate,
  opportunityTypeById: Map<string, string>,
): ProfileHistoryItem {
  if (item.source === 'PROGRAM' && item.opportunityId) {
    const oppType = opportunityTypeById.get(item.opportunityId)
    const category = oppType ? classifyOpportunityType(oppType) : 'program_education'
  return {
    id: item.id,
    sourceKind: 'certificate',
    category,
    categoryLabel: HISTORY_CATEGORY_META[category].label,
    title: item.title,
    meta: `${item.issuer} · 프로그램 수료 인증`,
    date: item.issuedAt,
    verified: item.verified,
    program: true,
    ongoing: false,
    editable: false,
  }
  }

  const inProgress = !item.issuedAt

  return {
    id: item.id,
    sourceKind: 'certificate',
    category: 'certificate',
    categoryLabel: HISTORY_CATEGORY_META.certificate.label,
    title: item.title,
    meta: inProgress ? `${item.issuer} · 취득 진행 중` : item.issuer,
    date: item.issuedAt,
    verified: item.verified,
    program: false,
    ongoing: inProgress,
    editable: true,
    editKind: 'certificate',
    editId: item.id,
  }
}

function buildVerifiedRecordItem(record: VerifiedRecord): ProfileHistoryItem {
  const verified = record.status === 'VERIFIED'
  return {
    id: record.id,
    sourceKind: 'verified_record',
    category: 'project_verified',
    categoryLabel: HISTORY_CATEGORY_META.project_verified.label,
    title: record.project.title,
    meta: `${record.role} · ${record.contributionSummary}`,
    date: record.issuedAt,
    verified,
    editable: false,
  }
}

function buildProjectItem(project: ProfileProject): ProfileHistoryItem {
  const isOwner = !project.memberRole
  const category = isOwner ? 'project_owned' : 'project_member'
  const title = project.title
  const meta = isOwner
    ? `운영 · ${project.status}`
    : `${project.memberRole ?? '멤버'} · ${project.contribution ?? '프로젝트 참여'}`

  return {
    id: project.id,
    sourceKind: 'project',
    category,
    categoryLabel: HISTORY_CATEGORY_META[category].label,
    title,
    meta,
    date: project.updatedAt,
    editable: false,
  }
}

export function buildProfileHistoryItems(data: ProfilePayload): ProfileHistoryItem[] {
  const opportunityTypeById = new Map(
    data.programEnrollments.map((enrollment) => [
      enrollment.opportunityId,
      enrollment.opportunity.type,
    ]),
  )

  const programCertificateOpportunityIds = new Set(
    data.profile.certificates
      .filter((cert) => cert.source === 'PROGRAM' && cert.opportunityId)
      .map((cert) => cert.opportunityId as string),
  )

  const items: ProfileHistoryItem[] = [
    ...data.profile.awards.map((item: Award) => ({
      id: item.id,
      sourceKind: 'award' as const,
      category: 'award' as const,
      categoryLabel: HISTORY_CATEGORY_META.award.label,
      title: item.title,
      meta: item.issuer ?? item.description ?? '수상',
      date: item.awardedAt,
      editable: true,
      editKind: 'award' as const,
      editId: item.id,
    })),
    ...data.profile.certificates.map((item) => buildCertificateItem(item, opportunityTypeById)),
    ...data.programEnrollments
      .filter((enrollment) => PROFILE_VISIBLE_PROGRAM_STATUSES.includes(enrollment.status))
      .filter((enrollment) => {
        if (enrollment.status !== 'COMPLETED') {
          return true
        }
        return !(
          enrollment.certificate?.verified ||
          programCertificateOpportunityIds.has(enrollment.opportunityId)
        )
      })
      .map(buildProgramHistoryItem),
    ...data.verifiedRecords
      .filter((record) => record.status === 'VERIFIED' || record.status === 'PENDING')
      .map(buildVerifiedRecordItem),
    ...data.projects.map(buildProjectItem),
    ...data.profile.careers.map((item: Career) => ({
      id: item.id,
      sourceKind: 'career' as const,
      category: 'career' as const,
      categoryLabel: HISTORY_CATEGORY_META.career.label,
      title: `${item.position} · ${item.company}`,
      meta: formatCareerMeta(item),
      date: item.startDate,
      ongoing: !item.endDate,
      editable: true,
      editKind: 'career' as const,
      editId: item.id,
    })),
  ]

  return items.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0
    const bTime = b.date ? new Date(b.date).getTime() : 0
    return bTime - aTime
  })
}

export type HistoryCategoryGroup = {
  category: HistoryCategory
  label: string
  description: string
  items: ProfileHistoryItem[]
}

export function groupProfileHistoryByCategory(
  items: ProfileHistoryItem[],
): HistoryCategoryGroup[] {
  const byCategory = new Map<HistoryCategory, ProfileHistoryItem[]>()

  for (const item of items) {
    const list = byCategory.get(item.category) ?? []
    list.push(item)
    byCategory.set(item.category, list)
  }

  return HISTORY_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    label: HISTORY_CATEGORY_META[category].label,
    description: HISTORY_CATEGORY_META[category].description,
    items: byCategory.get(category) ?? [],
  }))
}

export function filterHistoryByCategory(
  items: ProfileHistoryItem[],
  filter: HistoryCategory | 'all',
): ProfileHistoryItem[] {
  if (filter === 'all') {
    return items
  }
  return items.filter((item) => item.category === filter)
}
