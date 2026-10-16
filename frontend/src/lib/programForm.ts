import type { ApplicationFieldPayload, ProgramPayload } from '../services/programService'
import type {
  ApplicationField,
  ApplicationFieldType,
  DeliveryMode,
  Program,
  ProgramAudience,
  ProgramBenefit,
  ProgramCategory,
  ProgramPolicy,
  ProgramStatus,
  ProgramVisibility,
  RecruitmentMode,
} from '../types/program'
import { fromDateTimeInput, takesApplications, toDateInput, toDateTimeInput } from './programs'

export type DraftField = {
  key: string
  id?: string
  type: ApplicationFieldType
  label: string
  description: string
  required: boolean
  options: string[]
}

export type EligibilityForm = { schools: string; grades: number[]; majors: string; regions: string; requirements: string }

export type ProgramFormValue = {
  title: string
  term: string
  description: string
  status: ProgramStatus
  startDate: string
  endDate: string
  managerUserIds: string[]
  policy: ProgramPolicy
  category: ProgramCategory | ''
  coverImageUrl: string
  visibility: ProgramVisibility
  recruitmentMode: RecruitmentMode
  audiences: ProgramAudience[]
  targetAudience: string
  eligibility: EligibilityForm
  benefits: ProgramBenefit[]
  benefitsNote: string
  capacity: string
  applyStartAt: string
  applyEndAt: string
  announceAt: string
  selectionProcess: string
  deliveryMode: DeliveryMode | ''
  location: string
  applicationFields: DraftField[]
}

export const isChoiceField = (type: ApplicationFieldType) => type === 'single_choice' || type === 'multi_choice'

/** Returns the first problem that would make the server reject the form, or null. */
export function validateDraftFields(fields: DraftField[]) {
  for (const [index, field] of fields.entries()) {
    if (!field.label.trim()) return `${index + 1}번 문항의 질문을 입력해 주세요.`
    if (isChoiceField(field.type)) {
      const options = field.options.map((option) => option.trim()).filter(Boolean)
      if (options.length < 2) return `${index + 1}번 문항 '${field.label}'에 보기를 2개 이상 입력해 주세요.`
      if (new Set(options).size !== options.length) return `${index + 1}번 문항 '${field.label}'에 같은 보기가 있습니다.`
    }
  }
  return null
}

let fieldSeq = 0
export const newFieldKey = () => `field-${Date.now().toString(36)}-${(fieldSeq += 1)}`

export const newDraftField = (type: ApplicationFieldType = 'short_text', label = ''): DraftField => ({
  key: newFieldKey(),
  type,
  label,
  description: '',
  required: false,
  options: type === 'single_choice' || type === 'multi_choice' ? ['', ''] : [],
})

export const defaultApplicationFields = (): DraftField[] => [
  { ...newDraftField('long_text', '지원 동기'), description: '참여하고 싶은 이유와 관련 경험을 적어 주세요.', required: true },
  {
    ...newDraftField('consent', '개인정보 수집·이용 동의'),
    description: '지원서와 BAESH 프로필은 선발 심사를 위해 이 프로그램 담당자에게만 공개됩니다.',
    required: true,
  },
]

export const fieldsToDraft = (fields: ApplicationField[]): DraftField[] =>
  fields.map((field) => ({ ...field, key: field.id, description: field.description ?? '' }))

export const draftToFieldPayload = (fields: DraftField[]): ApplicationFieldPayload[] =>
  fields.map((field) => ({
    ...(field.id ? { id: field.id } : {}),
    type: field.type,
    label: field.label.trim(),
    description: field.description.trim() || null,
    required: field.required,
    options: field.options.map((option) => option.trim()).filter(Boolean),
  }))

export const defaultProgramPolicy = (): ProgramPolicy => ({
  allowStudentProjects: false,
  requireProjectApproval: true,
  allowStudentTeams: false,
  allowPublicProjects: false,
  allowMultipleProjects: false,
  recordDisclosure: 'summary',
})

const emptyEligibility = (): EligibilityForm => ({ schools: '', grades: [], majors: '', regions: '', requirements: '' })

export const emptyProgramForm = (): ProgramFormValue => ({
  title: '',
  term: '',
  description: '',
  status: 'draft',
  startDate: '',
  endDate: '',
  managerUserIds: [],
  policy: defaultProgramPolicy(),
  category: '',
  coverImageUrl: '',
  visibility: 'public',
  recruitmentMode: 'open',
  audiences: [],
  targetAudience: '',
  eligibility: emptyEligibility(),
  benefits: [],
  benefitsNote: '',
  capacity: '',
  applyStartAt: '',
  applyEndAt: '',
  announceAt: '',
  selectionProcess: '',
  deliveryMode: '',
  location: '',
  applicationFields: defaultApplicationFields(),
})

/** Sensible visibility when the recruitment mode is picked: recruiting needs an audience, rosters stay internal. */
export function visibilityForMode(mode: RecruitmentMode, current: ProgramVisibility): ProgramVisibility {
  if (takesApplications(mode)) return current === 'private' ? 'public' : current
  return 'private'
}

export function programToForm(program: Program): ProgramFormValue {
  const recruitment = program.recruitment
  const eligibility = recruitment.eligibility ?? {}
  return {
    title: program.title,
    term: program.term ?? '',
    description: program.description ?? '',
    status: program.status,
    startDate: toDateInput(program.startDate),
    endDate: toDateInput(program.endDate),
    managerUserIds: program.managers.map((manager) => manager.id),
    policy: program.policy ?? defaultProgramPolicy(),
    category: recruitment.category ?? '',
    coverImageUrl: recruitment.coverImageUrl ?? '',
    visibility: program.visibility,
    recruitmentMode: recruitment.mode,
    audiences: recruitment.audiences,
    targetAudience: recruitment.targetAudience ?? '',
    eligibility: {
      schools: eligibility.schools ?? '',
      grades: eligibility.grades ?? [],
      majors: eligibility.majors ?? '',
      regions: eligibility.regions ?? '',
      requirements: eligibility.requirements ?? '',
    },
    benefits: recruitment.benefits,
    benefitsNote: recruitment.benefitsNote ?? '',
    capacity: recruitment.capacity ? String(recruitment.capacity) : '',
    applyStartAt: toDateTimeInput(recruitment.applyStartAt),
    applyEndAt: toDateTimeInput(recruitment.applyEndAt),
    announceAt: toDateTimeInput(recruitment.announceAt),
    selectionProcess: recruitment.selectionProcess ?? '',
    deliveryMode: recruitment.deliveryMode ?? '',
    location: recruitment.location ?? '',
    applicationFields: [],
  }
}

export function toProgramPayload(value: ProgramFormValue): ProgramPayload {
  const recruiting = takesApplications(value.recruitmentMode)
  return {
    title: value.title.trim(),
    term: value.term.trim() || null,
    description: value.description.trim() || null,
    status: value.status,
    startDate: value.startDate || null,
    endDate: value.endDate || null,
    ...value.policy,
    category: value.category || null,
    coverImageUrl: value.coverImageUrl || null,
    visibility: value.visibility,
    recruitmentMode: value.recruitmentMode,
    audiences: value.audiences,
    targetAudience: value.targetAudience.trim() || null,
    eligibility: {
      schools: value.eligibility.schools.trim(),
      grades: value.eligibility.grades,
      majors: value.eligibility.majors.trim(),
      regions: value.eligibility.regions.trim(),
      requirements: value.eligibility.requirements.trim(),
    },
    benefits: value.benefits,
    benefitsNote: value.benefitsNote.trim() || null,
    capacity: value.capacity ? Number(value.capacity) : null,
    applyStartAt: recruiting ? fromDateTimeInput(value.applyStartAt) : null,
    applyEndAt: recruiting ? fromDateTimeInput(value.applyEndAt) : null,
    announceAt: recruiting ? fromDateTimeInput(value.announceAt) : null,
    selectionProcess: recruiting ? value.selectionProcess.trim() || null : null,
    deliveryMode: value.deliveryMode || null,
    location: value.location.trim() || null,
  }
}

/** Operating status chosen at creation: drafts stay 준비 중; a published program runs once its start date arrives. */
export function initialStatus(value: ProgramFormValue, publish: boolean): ProgramStatus {
  if (!publish) return 'draft'
  const today = toDateInput(new Date().toISOString())
  return value.startDate && value.startDate > today ? 'draft' : 'active'
}
