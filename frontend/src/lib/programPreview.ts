import type { Organization } from '../types/organization'
import type { ApplicationField, DiscoverableProgram, RecruitmentState } from '../types/program'
import { toProgramPayload, validateDraftFields, type ProgramFormValue } from './programForm'
import { fromDateTimeInput, takesApplications } from './programs'

export type WizardStepId = 'basics' | 'recruitment' | 'form' | 'preview' | 'review'

export type ReviewItem = { step: WizardStepId; message: string }

function previewState(form: ProgramFormValue): RecruitmentState {
  if (form.recruitmentMode === 'preselected') return 'selected'
  if (form.recruitmentMode === 'invite') return 'invite_only'
  const now = Date.now()
  if (form.applyEndAt && new Date(form.applyEndAt).getTime() < now) return 'closed'
  if (form.applyStartAt && new Date(form.applyStartAt).getTime() > now) return 'scheduled'
  return 'open'
}

/** What an applicant would see once this form is published, built only from the form (no server round-trip). */
export function toPreview(form: ProgramFormValue, organization: Pick<Organization, 'id' | 'name' | 'type'>): DiscoverableProgram {
  const payload = toProgramPayload(form)
  const capacity = payload.capacity ?? null
  const eligibility = payload.eligibility ?? null
  const applicationFields: ApplicationField[] = takesApplications(form.recruitmentMode)
    ? form.applicationFields
        .filter((field) => field.label.trim())
        .map((field) => ({
          id: field.id ?? field.key,
          type: field.type,
          label: field.label.trim(),
          description: field.description.trim() || null,
          required: field.required,
          options: field.options.map((option) => option.trim()).filter(Boolean),
        }))
    : []
  return {
    id: 'preview',
    title: payload.title || '프로그램 이름',
    description: payload.description ?? null,
    term: payload.term ?? null,
    status: 'draft',
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
    visibility: form.visibility,
    publishedAt: null,
    organization: { id: organization.id, name: organization.name, type: organization.type },
    participantCount: 0,
    myStatus: { isParticipant: false, isManager: false, application: null },
    applicationFields,
    recruitment: {
      mode: form.recruitmentMode,
      state: previewState(form),
      category: payload.category ?? null,
      coverImageUrl: payload.coverImageUrl ?? null,
      audiences: form.audiences,
      targetAudience: payload.targetAudience ?? null,
      eligibility,
      benefits: form.benefits,
      benefitsNote: payload.benefitsNote ?? null,
      capacity,
      openSeats: capacity,
      applyStartAt: payload.applyStartAt ?? null,
      applyEndAt: payload.applyEndAt ?? null,
      announceAt: payload.announceAt ?? null,
      closedEarlyAt: null,
      selectionProcess: payload.selectionProcess ?? null,
      deliveryMode: payload.deliveryMode ?? null,
      location: payload.location ?? null,
    },
  }
}

/** Problems that block publishing, each pointing at the step that fixes it. Drafts may stay incomplete. */
export function publishProblems(form: ProgramFormValue): ReviewItem[] {
  const problems: ReviewItem[] = []
  const recruiting = takesApplications(form.recruitmentMode)
  if (form.title.trim().length < 2) problems.push({ step: 'basics', message: '프로그램 이름을 2자 이상 입력해 주세요.' })
  if (form.startDate && form.endDate && form.endDate < form.startDate) {
    problems.push({ step: 'basics', message: '운영 종료일은 시작일 이후여야 합니다.' })
  }
  if (recruiting) {
    if (!form.applyEndAt) problems.push({ step: 'recruitment', message: '모집 마감 일시를 입력해 주세요.' })
    const start = fromDateTimeInput(form.applyStartAt)
    const end = fromDateTimeInput(form.applyEndAt)
    if (start && end && start >= end) problems.push({ step: 'recruitment', message: '모집 마감은 모집 시작 이후여야 합니다.' })
    if (end && new Date(end).getTime() < Date.now()) problems.push({ step: 'recruitment', message: '모집 마감 일시가 이미 지났습니다.' })
    if (form.recruitmentMode === 'mixed' && !form.capacity) problems.push({ step: 'recruitment', message: '혼합 모집은 전체 정원을 입력해야 합니다.' })
    if (form.visibility === 'private') {
      problems.push({ step: 'recruitment', message: '지원서를 받으려면 내부 전용이 아닌 공개 범위를 선택해 주세요.' })
    }
    const fieldProblem = validateDraftFields(form.applicationFields)
    if (fieldProblem) problems.push({ step: 'form', message: fieldProblem })
    else if (form.applicationFields.length === 0) problems.push({ step: 'form', message: '지원서에 문항을 1개 이상 추가해 주세요.' })
  }
  return problems
}

/** Optional gaps worth a second look before publishing. They never block. */
export function reviewSuggestions(form: ProgramFormValue): ReviewItem[] {
  const items: ReviewItem[] = []
  const recruiting = takesApplications(form.recruitmentMode)
  if (!form.description.trim()) items.push({ step: 'basics', message: '프로그램 소개가 비어 있습니다. 지원자가 가장 먼저 읽는 내용입니다.' })
  if (!form.startDate || !form.endDate) items.push({ step: 'basics', message: '운영 기간이 정해지지 않았습니다. 공고에는 "미정"으로 표시됩니다.' })
  if (recruiting && form.audiences.length === 0) items.push({ step: 'recruitment', message: '지원 대상을 고르지 않으면 "제한 없음"으로 표시됩니다.' })
  if (recruiting && !form.capacity) items.push({ step: 'recruitment', message: '모집 인원이 비어 있어 공고에 "미정"으로 표시됩니다.' })
  if (recruiting && !form.applicationFields.some((field) => field.type === 'consent')) {
    items.push({ step: 'form', message: '개인정보 수집·이용 동의 문항이 없습니다. 개인정보를 받는다면 추가해 주세요.' })
  }
  return items
}
