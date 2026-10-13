import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useManagerCandidates } from '../../hooks/useManagerCandidates'
import {
  draftToFieldPayload,
  emptyProgramForm,
  initialStatus,
  toProgramPayload,
  validateDraftFields,
  visibilityForMode,
  type ProgramFormValue,
} from '../../lib/programForm'
import { PROGRAM_VISIBILITY_META, RECRUITMENT_MODE_META, fromDateTimeInput, takesApplications } from '../../lib/programs'
import { createProgram } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Organization } from '../../types/organization'
import type { DiscoverableProgram, RecruitmentMode, RecruitmentState } from '../../types/program'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { ProgramCard } from '../programs/ProgramCard'
import { ApplicationFormBuilder } from './ApplicationFormBuilder'
import { ManagersField, ProgramBasicsFields, ProgramRecruitmentFields, ProgramVisibilityFields } from './ProgramFormFields'

type StepId = 'start' | 'basics' | 'recruitment' | 'form' | 'visibility'

const STEP_TITLE: Record<Exclude<StepId, 'start'>, string> = {
  basics: '어떤 프로그램인가요?',
  recruitment: '참여자를 어떻게 모집하나요?',
  form: '지원서에 무엇을 물어볼까요?',
  visibility: '누가 볼 수 있게 할까요?',
}

const START_ORDER: RecruitmentMode[] = ['open', 'preselected', 'mixed', 'invite']

function previewState(form: ProgramFormValue): RecruitmentState {
  if (form.recruitmentMode === 'preselected') return 'selected'
  if (form.recruitmentMode === 'invite') return 'invite_only'
  const now = Date.now()
  if (form.applyEndAt && new Date(form.applyEndAt).getTime() < now) return 'closed'
  if (form.applyStartAt && new Date(form.applyStartAt).getTime() > now) return 'scheduled'
  return 'open'
}

function toPreview(form: ProgramFormValue, organization: Organization): DiscoverableProgram {
  const payload = toProgramPayload(form)
  const capacity = payload.capacity ?? null
  return {
    id: 'preview',
    title: payload.title,
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
    recruitment: {
      mode: form.recruitmentMode,
      state: previewState(form),
      category: payload.category ?? null,
      coverImageUrl: payload.coverImageUrl ?? null,
      audiences: form.audiences,
      targetAudience: payload.targetAudience ?? null,
      eligibility: null,
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

/** Problems that block publishing, each pointing at the step that fixes it. Drafts may be incomplete. */
function publishProblems(form: ProgramFormValue): Array<{ step: StepId; message: string }> {
  const problems: Array<{ step: StepId; message: string }> = []
  const recruiting = takesApplications(form.recruitmentMode)
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
    if (form.visibility === 'private') problems.push({ step: 'visibility', message: '지원서를 받으려면 내부 전용이 아닌 공개 범위를 선택해 주세요.' })
  }
  return problems
}

export function ProgramCreateWizard({
  organization,
  canAssignManagers,
  open,
  onClose,
}: {
  organization: Organization
  canAssignManagers: boolean
  open: boolean
  onClose: () => void
}) {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyProgramForm)
  const [step, setStep] = useState<StepId>('start')
  const [error, setError] = useState<string | null>(null)
  const managerCandidates = useManagerCandidates(organization.id, open && canAssignManagers)

  const recruiting = takesApplications(form.recruitmentMode)
  const steps: StepId[] = recruiting ? ['basics', 'recruitment', 'form', 'visibility'] : ['basics', 'recruitment', 'visibility']
  const stepIndex = steps.indexOf(step)

  const reset = () => {
    setForm(emptyProgramForm())
    setStep('start')
    setError(null)
  }
  const close = () => {
    onClose()
    reset()
  }

  const create = useMutation({
    mutationFn: (publish: boolean) =>
      createProgram(token!, organization.id, {
        ...toProgramPayload({ ...form, status: initialStatus(form, publish) }),
        publish,
        managerUserIds: canAssignManagers ? form.managerUserIds : [],
        ...(recruiting ? { applicationFields: draftToFieldPayload(form.applicationFields) } : {}),
      }),
    onSuccess: ({ program }, publish) => {
      const listed = PROGRAM_VISIBILITY_META[form.visibility].listed
      showToast(
        publish
          ? recruiting && listed
            ? '프로그램을 개설하고 모집 공고를 게시했습니다. Jobs에 바로 노출됩니다.'
            : '프로그램을 개설했습니다.'
          : '임시저장했습니다. 설정에서 이어서 작성한 뒤 게시하세요.',
      )
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations', organization.id, 'dashboard'] })
      close()
      const tab = !publish ? 'settings' : recruiting ? 'applications' : 'participants'
      navigate(`/org/${organization.id}/programs/${program.id}?tab=${tab}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  // Nothing reaches the server until 임시저장 or 게시, so leaving after choosing a mode loses the input.
  const dirty = open && step !== 'start'
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const chooseMode = (mode: RecruitmentMode) => {
    setForm((prev) => ({ ...prev, recruitmentMode: mode, visibility: visibilityForMode(mode, prev.visibility) }))
    setStep('basics')
  }

  const goNext = () => {
    setError(null)
    if (step === 'basics' && form.title.trim().length < 2) {
      setError('프로그램 이름을 2자 이상 입력해 주세요.')
      return
    }
    if (step === 'form') {
      const problem = validateDraftFields(form.applicationFields)
      if (problem) {
        setError(problem)
        return
      }
    }
    setStep(steps[stepIndex + 1])
  }

  const submit = (publish: boolean) => {
    setError(null)
    if (form.title.trim().length < 2) {
      setStep('basics')
      setError('프로그램 이름을 2자 이상 입력해 주세요.')
      return
    }
    if (recruiting) {
      const problem = validateDraftFields(form.applicationFields)
      if (problem) {
        setStep('form')
        setError(problem)
        return
      }
    }
    if (publish) {
      const [first] = publishProblems(form)
      if (first) {
        setStep(first.step)
        setError(first.message)
        return
      }
    }
    create.mutate(publish)
  }

  return (
    <Modal
      description={step === 'start' ? '개인 프로젝트에는 영향을 주지 않습니다. 팀 구성·프로젝트 정책 같은 세부 설정은 개설 후에 정할 수 있습니다.' : undefined}
      confirmCloseMessage={dirty ? '아직 저장하지 않은 내용이 있습니다. 닫으면 입력한 내용이 사라집니다. 닫을까요?' : null}
      onClose={close}
      open={open}
      title={step === 'start' ? '프로그램 만들기' : STEP_TITLE[step]}
      wide
    >
      {step === 'start' ? (
        <div className="space-y-3">
          <p className="text-base font-semibold text-ink-strong">이미 참여자가 정해졌나요, 아니면 지금 모집할 건가요?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {START_ORDER.map((mode) => (
              <button
                className="group flex items-start justify-between gap-3 rounded-2xl border border-surface-border p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/50"
                key={mode}
                onClick={() => chooseMode(mode)}
                type="button"
              >
                <span>
                  <span className="block text-sm font-bold text-ink-strong">{RECRUITMENT_MODE_META[mode].question}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-brand-700">{RECRUITMENT_MODE_META[mode].label}</span>
                  <span className="mt-1.5 block text-xs leading-5 text-ink-muted">{RECRUITMENT_MODE_META[mode].description}</span>
                </span>
                <ChevronRight className="mt-0.5 shrink-0 text-ink-muted group-hover:text-brand-600" size={18} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold">
            {steps.map((id, index) => {
              const done = index < stepIndex
              const current = index === stepIndex
              return (
                <li className="flex items-center gap-1" key={id}>
                  <button
                    aria-current={current ? 'step' : undefined}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
                      current ? 'bg-brand-600 text-white' : done ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'bg-surface-muted text-ink-muted'
                    }`}
                    disabled={!done}
                    onClick={() => setStep(id)}
                    type="button"
                  >
                    {done ? <Check size={12} /> : <span>{index + 1}</span>}
                    {{ basics: '기본 정보', recruitment: '모집 방식', form: '지원서', visibility: '공개 범위' }[id as Exclude<StepId, 'start'>]}
                  </button>
                  {index < steps.length - 1 ? <ChevronRight className="text-ink-muted" size={12} /> : null}
                </li>
              )
            })}
          </ol>

          {step === 'basics' ? (
            <ProgramBasicsFields
              managers={
                canAssignManagers ? (
                  <ManagersField
                    candidates={managerCandidates}
                    onChange={(ids) => setForm((prev) => ({ ...prev, managerUserIds: ids }))}
                    value={form.managerUserIds}
                  />
                ) : (
                  <p className="text-xs text-ink-muted">만든 사람은 자동으로 이 프로그램의 담당자가 됩니다.</p>
                )
              }
              onChange={setForm}
              value={form}
            />
          ) : null}
          {step === 'recruitment' ? (
            <ProgramRecruitmentFields
              onChange={(update) =>
                setForm((prev) => {
                  const next = typeof update === 'function' ? update(prev) : update
                  return next.recruitmentMode === prev.recruitmentMode
                    ? next
                    : { ...next, visibility: visibilityForMode(next.recruitmentMode, prev.visibility) }
                })
              }
              value={form}
            />
          ) : null}
          {step === 'form' ? (
            <ApplicationFormBuilder fields={form.applicationFields} onChange={(fields) => setForm((prev) => ({ ...prev, applicationFields: fields }))} />
          ) : null}
          {step === 'visibility' ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <ProgramVisibilityFields onChange={setForm} value={form} />
              <div>
                <p className="mb-2 text-xs font-semibold text-ink-muted">
                  {PROGRAM_VISIBILITY_META[form.visibility].listed ? 'Jobs에 이렇게 보여요' : '링크로 들어온 사람에게 이렇게 보여요'}
                </p>
                <ProgramCard preview program={toPreview(form, organization)} />
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border pt-4">
            <Button
              onClick={() => {
                setError(null)
                setStep(stepIndex === 0 ? 'start' : steps[stepIndex - 1])
              }}
              type="button"
              variant="ghost"
            >
              이전
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button disabled={create.isPending} onClick={() => submit(false)} type="button" variant="secondary">
                임시저장
              </Button>
              {step === 'visibility' ? (
                <Button disabled={create.isPending} onClick={() => submit(true)} type="button">
                  {create.isPending ? '개설 중…' : recruiting ? '게시 및 프로그램 개설' : '프로그램 개설'}
                </Button>
              ) : (
                <Button onClick={goNext} type="button">
                  다음
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
