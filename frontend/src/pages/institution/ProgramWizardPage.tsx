import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, ChevronRight, FileClock, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingState } from '../../components/common/LoadingState'
import { ApplicationFormBuilder } from '../../components/institution/ApplicationFormBuilder'
import { ManagersField, ProgramBasicsFields, ProgramRecruitmentFields, ProgramVisibilityFields } from '../../components/institution/ProgramFormFields'
import { ProgramApplicationForm } from '../../components/programs/ProgramApplicationForm'
import { SaveIndicator, WizardProgress, WizardStepper } from '../../components/programs/wizard/WizardChrome'
import { WizardPreview } from '../../components/programs/wizard/WizardPreview'
import { WizardReview } from '../../components/programs/wizard/WizardReview'
import { useManagerCandidates } from '../../hooks/useManagerCandidates'
import { useMyOrganizations } from '../../hooks/useMyOrganizations'
import { snapshotOf, useProgramAutosave, type DraftSnapshot } from '../../hooks/useProgramAutosave'
import { ApiError } from '../../lib/api'
import { hasOrgRole } from '../../lib/organizations'
import { emptyProgramForm, fieldsToDraft, initialStatus, programToForm, visibilityForMode, type ProgramFormValue } from '../../lib/programForm'
import { publishProblems, reviewSuggestions, toPreview, type WizardStepId } from '../../lib/programPreview'
import { PROGRAM_VISIBILITY_META, RECRUITMENT_MODE_META, formatDateTime, takesApplications } from '../../lib/programs'
import {
  deleteProgram,
  getApplicationForm,
  getOrganizationPrograms,
  getProgram,
  updateProgram,
  updateProgramPublication,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Organization } from '../../types/organization'
import type { ProgramListItem, RecruitmentMode } from '../../types/program'

const RECRUITING_STEPS: WizardStepId[] = ['basics', 'recruitment', 'form', 'preview', 'review']
const ROSTER_STEPS: WizardStepId[] = ['basics', 'recruitment', 'preview', 'review']
const START_ORDER: RecruitmentMode[] = ['open', 'preselected', 'mixed', 'invite']

const STEP_INTRO: Record<WizardStepId, { title: string; description: string }> = {
  basics: { title: '어떤 프로그램인가요?', description: '이름을 입력하면 바로 임시저장이 시작됩니다. 나머지는 나중에 채워도 됩니다.' },
  recruitment: { title: '참여자를 어떻게 모집하나요?', description: '지원 대상·정원·모집 일정과 공개 범위를 정합니다.' },
  form: { title: '지원서에 무엇을 물어볼까요?', description: '질문을 추가하고 순서와 필수 여부를 정하세요. 문항을 완성하면 자동으로 저장됩니다.' },
  preview: { title: '학생에게 이렇게 보입니다', description: '게시 후 실제 모집 화면과 같은 구성입니다. 미리보기에서 입력한 답변은 저장되지 않습니다.' },
  review: { title: '검토하고 게시하기', description: '게시 전까지는 담당자만 볼 수 있습니다. 필수 항목을 확인한 뒤 게시하세요.' },
}

type WizardInitial = { programId: string; form: ProgramFormValue; snapshot: DraftSnapshot }

const programsPath = (orgId: string) => `/org/${orgId}?tab=programs`

function WizardNotice({ orgId, title, children }: { orgId: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas p-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-xl font-bold text-ink-strong">{title}</h1>
        {children}
        <Button to={programsPath(orgId)} variant="secondary">
          프로그램 목록으로
        </Button>
      </div>
    </div>
  )
}

/**
 * `/org/:orgId/programs/new` and `/org/:orgId/programs/:programId/setup`. Both routes render this page so the wizard
 * keeps its state when a new draft gets its id and the URL switches to the resumable `/setup` address.
 */
export function ProgramWizardPage() {
  const { orgId = '', programId: routeId } = useParams()
  const token = useAuthStore((state) => state.token)
  const { activeMemberships } = useMyOrganizations()
  const membership = activeMemberships.find((item) => item.organization.id === orgId)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [session, setSession] = useState(0)
  if (!routeId && createdId) {
    // Back on /new after a draft was created in this tab: start a fresh form instead of reusing the saved one.
    setCreatedId(null)
    setSession((value) => value + 1)
  }
  const resuming = Boolean(routeId) && routeId !== createdId

  const listQuery = useQuery({
    queryKey: ['programs', 'org', orgId],
    queryFn: () => getOrganizationPrograms(token!, orgId),
    enabled: Boolean(token && orgId),
  })
  const draftQuery = useQuery({
    queryKey: ['programs', routeId, 'wizard-draft'],
    queryFn: async () => {
      const detail = await getProgram(token!, routeId!)
      const editable = detail.myAccess.isStaff && !detail.program.publishedAt
      const fields = editable ? (await getApplicationForm(token!, routeId!)).fields : []
      return { detail, fields }
    },
    enabled: Boolean(token && resuming),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    document.title = '프로그램 개설 · BAESH'
    return () => {
      document.title = 'BAESH'
    }
  }, [])

  if (!membership) return null
  const organization = membership.organization

  if (resuming) {
    if (draftQuery.isPending) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
          <LoadingState label="작성 중인 프로그램을 불러오는 중입니다" />
        </div>
      )
    }
    if (draftQuery.isError) {
      const error = draftQuery.error
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        return (
          <WizardNotice orgId={orgId} title="이 프로그램을 편집할 수 없습니다">
            <p className="text-sm text-ink-muted">프로그램이 없거나, 조직 관리자 또는 이 프로그램의 담당자가 아닙니다.</p>
          </WizardNotice>
        )
      }
      return (
        <WizardNotice orgId={orgId} title="프로그램을 불러오지 못했습니다">
          <ErrorState error={draftQuery.error} onRetry={() => void draftQuery.refetch()} />
        </WizardNotice>
      )
    }
    const { detail, fields } = draftQuery.data
    if (detail.organization.id !== orgId) return <WizardNotice orgId={orgId} title="프로그램을 찾을 수 없습니다" />
    if (!detail.myAccess.isStaff) {
      return (
        <WizardNotice orgId={orgId} title="이 프로그램을 편집할 수 없습니다">
          <p className="text-sm text-ink-muted">조직 관리자 또는 이 프로그램의 담당자만 작성할 수 있습니다.</p>
        </WizardNotice>
      )
    }
    if (detail.program.publishedAt) return <Navigate replace to={`/org/${orgId}/programs/${detail.program.id}?tab=settings`} />
    const form = { ...programToForm(detail.program), applicationFields: fieldsToDraft(fields) }
    const canAssignManagers = detail.myAccess.isOrgAdmin
    return (
      <ProgramWizard
        canAssignManagers={canAssignManagers}
        drafts={[]}
        initial={{ programId: detail.program.id, form, snapshot: snapshotOf(form, canAssignManagers) }}
        key={`resume-${routeId}`}
        onCreated={setCreatedId}
        organization={organization}
      />
    )
  }

  if (!createdId) {
    if (listQuery.isPending) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface-canvas">
          <LoadingState label="프로그램 개설 권한을 확인하는 중입니다" />
        </div>
      )
    }
    if (listQuery.isError) {
      return (
        <WizardNotice orgId={orgId} title="권한을 확인하지 못했습니다">
          <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
        </WizardNotice>
      )
    }
    if (!listQuery.data.canCreate) {
      return (
        <WizardNotice orgId={orgId} title="프로그램을 개설할 권한이 없습니다">
          <p className="text-sm text-ink-muted">
            {organization.verificationStatus !== 'approved'
              ? '조직 인증이 승인되면 프로그램을 개설할 수 있습니다.'
              : '조직의 담당자(MANAGER) 이상만 프로그램을 개설할 수 있습니다.'}
          </p>
        </WizardNotice>
      )
    }
  }

  const drafts = (listQuery.data?.programs ?? []).filter((program) => program.myAccess.isStaff && !program.publishedAt)
  return (
    <ProgramWizard
      canAssignManagers={organization.verificationStatus === 'approved' && hasOrgRole(membership.role, 'admin')}
      drafts={drafts}
      initial={null}
      key={`new-${session}`}
      onCreated={setCreatedId}
      organization={organization}
    />
  )
}

function ProgramWizard({
  organization,
  canAssignManagers,
  initial,
  drafts,
  onCreated,
}: {
  organization: Organization
  canAssignManagers: boolean
  initial: WizardInitial | null
  drafts: ProgramListItem[]
  onCreated: (programId: string) => void
}) {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [programId, setProgramId] = useState(initial?.programId ?? null)
  const [form, setForm] = useState<ProgramFormValue>(() => initial?.form ?? emptyProgramForm())
  const [started, setStarted] = useState(Boolean(initial))
  const [stepError, setStepError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const managerCandidates = useManagerCandidates(organization.id, canAssignManagers)
  const orgId = organization.id

  const recruiting = takesApplications(form.recruitmentMode)
  const steps = recruiting ? RECRUITING_STEPS : ROSTER_STEPS
  const requested = searchParams.get('step') as WizardStepId | null
  const step: WizardStepId = requested && steps.includes(requested) ? requested : 'basics'
  const stepIndex = steps.indexOf(step)

  const autosave = useProgramAutosave({
    orgId,
    programId,
    form,
    setForm,
    canAssignManagers,
    initialSnapshot: initial?.snapshot ?? null,
    enabled: started,
    onCreated: (program) => {
      setProgramId(program.id)
      onCreated(program.id)
      void queryClient.invalidateQueries({ queryKey: ['programs', 'org', orgId] })
      // A draft created by the leave-page flush must not pull the user back into the wizard.
      if (window.location.pathname !== `/org/${orgId}/programs/new`) return
      const current = new URLSearchParams(window.location.search).get('step') ?? 'basics'
      navigate(`/org/${orgId}/programs/${program.id}/setup?step=${current}`, { replace: true })
    },
  })

  const unsavedBeforeDraft = started && !programId
  const leaveRisk = started && (autosave.pending || Boolean(autosave.fieldsProblem) || unsavedBeforeDraft)
  useEffect(() => {
    if (!leaveRisk) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [leaveRisk])

  const previousStep = useRef(step)
  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [step])

  const go = (next: WizardStepId) => {
    setStepError(null)
    navigate({ search: `?step=${next}` }, { replace: true })
  }
  const reachable = (target: WizardStepId) => target === 'basics' || autosave.titleReady

  const goNext = () => {
    if (step === 'basics' && !autosave.titleReady) {
      setStepError('프로그램 이름을 2자 이상 입력해 주세요.')
      return
    }
    if (step === 'form' && autosave.fieldsProblem) {
      setStepError(autosave.fieldsProblem)
      return
    }
    go(steps[stepIndex + 1])
  }

  const chooseMode = (mode: RecruitmentMode) => {
    setForm((prev) => ({ ...prev, recruitmentMode: mode, visibility: visibilityForMode(mode, prev.visibility) }))
    setStarted(true)
    go('basics')
  }

  const saveNow = async () => {
    if (!autosave.titleReady) {
      showToast('프로그램 이름을 2자 이상 입력하면 임시저장할 수 있습니다.', 'info')
      return
    }
    if (await autosave.flush()) showToast('임시저장했습니다. 프로그램 목록에서 언제든 이어서 작성할 수 있습니다.')
  }

  const problems = publishProblems(form)
  const suggestions = reviewSuggestions(form)
  const publishStatus = initialStatus(form, true)

  const publish = useMutation({
    mutationFn: async () => {
      if (!(await autosave.flush())) throw new Error('임시저장에 실패해 게시하지 못했습니다. 저장 오류를 먼저 확인해 주세요.')
      const id = programId
      if (!id || !token) throw new Error('프로그램을 먼저 저장해 주세요.')
      const statusChanged = publishStatus !== form.status
      if (statusChanged) await updateProgram(token, id, { status: publishStatus })
      try {
        await updateProgramPublication(token, id, 'publish')
      } catch (error) {
        // Keep the draft exactly as it was so the next attempt starts from the same state.
        if (statusChanged) await updateProgram(token, id, { status: form.status }).catch(() => undefined)
        throw error
      }
      return id
    },
    onSuccess: (id) => {
      autosave.stop()
      const listed = PROGRAM_VISIBILITY_META[form.visibility].listed
      showToast(recruiting && listed ? '모집 공고를 게시했습니다. Jobs에 바로 노출됩니다.' : '프로그램을 개설했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'dashboard'] })
      navigate(`/org/${orgId}/programs/${id}?tab=${recruiting ? 'applications' : 'participants'}`)
    },
    onError: (error: Error) => setStepError(error.message),
  })

  const remove = useMutation({
    mutationFn: () => deleteProgram(token!, programId!),
    onSuccess: () => {
      autosave.stop()
      showToast('작성 중이던 프로그램을 삭제했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      navigate(programsPath(orgId))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const confirmLeave = (event: MouseEvent) => {
    if (unsavedBeforeDraft && !autosave.titleReady && !window.confirm('프로그램 이름을 입력하지 않아 아직 저장되지 않았습니다. 나가면 입력한 내용이 사라집니다. 나갈까요?')) {
      event.preventDefault()
    }
  }

  const preview = toPreview(form, organization)
  const saveIndicator = (
    <SaveIndicator
      error={autosave.error}
      fieldsProblem={autosave.fieldsProblem}
      hasDraft={Boolean(programId)}
      onRetry={autosave.retry}
      savedAt={autosave.savedAt}
      status={autosave.status}
    />
  )

  const content = (() => {
    switch (step) {
      case 'basics':
        return (
          <ProgramBasicsFields
            managers={
              canAssignManagers ? (
                <ManagersField candidates={managerCandidates} onChange={(ids) => setForm((prev) => ({ ...prev, managerUserIds: ids }))} value={form.managerUserIds} />
              ) : (
                <p className="text-xs text-ink-muted">만든 사람은 자동으로 이 프로그램의 담당자가 됩니다.</p>
              )
            }
            onChange={setForm}
            value={form}
          />
        )
      case 'recruitment':
        return (
          <div className="space-y-8">
            <ProgramRecruitmentFields
              onChange={(update) =>
                setForm((prev) => {
                  const next = typeof update === 'function' ? update(prev) : update
                  return next.recruitmentMode === prev.recruitmentMode ? next : { ...next, visibility: visibilityForMode(next.recruitmentMode, prev.visibility) }
                })
              }
              value={form}
            />
            <section aria-labelledby="wizard-visibility" className="space-y-3 border-t border-surface-border pt-6">
              <div>
                <h3 className="text-sm font-bold text-ink-strong" id="wizard-visibility">
                  공개 범위
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">게시한 뒤 누가 이 프로그램을 볼 수 있는지 정합니다.</p>
              </div>
              <ProgramVisibilityFields blockPrivate onChange={setForm} value={form} />
            </section>
          </div>
        )
      case 'form':
        return (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <ApplicationFormBuilder fields={form.applicationFields} onChange={(fields) => setForm((prev) => ({ ...prev, applicationFields: fields }))} />
            <aside aria-label="지원자에게 보이는 지원서" className="hidden xl:block">
              <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-surface-border bg-surface-canvas p-4">
                <p className="mb-3 text-xs font-bold text-ink-muted">지원자에게 보이는 지원서</p>
                <ProgramApplicationForm
                  key={(preview.applicationFields ?? []).map((field) => `${field.id}:${field.type}`).join('|')}
                  onChanged={() => undefined}
                  preview
                  program={preview}
                  shareToken={null}
                  token=""
                />
              </div>
            </aside>
          </div>
        )
      case 'preview':
        return <WizardPreview program={preview} />
      case 'review':
        return (
          <div className="space-y-6">
            <WizardReview form={form} onEdit={go} problems={problems} publishStatus={publishStatus} suggestions={suggestions} />
            {programId && canAssignManagers ? (
              <div className="flex justify-end border-t border-surface-border pt-4">
                <Button
                  disabled={remove.isPending || publish.isPending}
                  onClick={() => {
                    if (window.confirm('작성 중인 프로그램을 삭제할까요? 저장된 지원서 문항도 함께 삭제되며 되돌릴 수 없습니다.')) remove.mutate()
                  }}
                  size="sm"
                  variant="danger"
                >
                  <Trash2 aria-hidden size={15} /> 초안 삭제
                </Button>
              </div>
            ) : null}
          </div>
        )
    }
  })()

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-body">
      <header className="sticky top-0 z-30 border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
          <Link
            aria-label="프로그램 목록으로 나가기"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-border bg-white text-ink-strong transition hover:border-brand-200"
            onClick={confirmLeave}
            to={programsPath(orgId)}
          >
            <ArrowLeft aria-hidden size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink-muted">{organization.name} · 프로그램 개설</p>
            <h1 className="truncate text-sm font-bold text-ink-strong sm:text-base">{form.title.trim() || '새 프로그램'}</h1>
          </div>
          {started ? <div className="hidden max-w-[16rem] sm:block">{saveIndicator}</div> : null}
          {started ? (
            <Button aria-label="임시저장" disabled={autosave.status === 'saving'} onClick={() => void saveNow()} size="sm" variant="secondary">
              <Save aria-hidden size={15} />
              <span className="hidden sm:inline">임시저장</span>
            </Button>
          ) : null}
        </div>
        {started ? <WizardProgress value={(stepIndex + 1) / steps.length} /> : null}
      </header>

      {!started ? (
        <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink-strong">어떤 방식으로 참여자를 모으나요?</h2>
            <p className="mt-1 text-sm text-ink-muted">선택한 방식에 따라 필요한 단계만 안내합니다. 다음 단계에서 언제든 바꿀 수 있습니다.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {START_ORDER.map((mode) => (
              <button
                className="group flex min-h-28 items-start justify-between gap-3 rounded-2xl border border-surface-border bg-white p-4 text-left shadow-sm transition hover:border-brand-400 hover:bg-brand-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                key={mode}
                onClick={() => chooseMode(mode)}
                type="button"
              >
                <span>
                  <span className="block text-sm font-bold text-ink-strong">{RECRUITMENT_MODE_META[mode].question}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-brand-700">{RECRUITMENT_MODE_META[mode].label}</span>
                  <span className="mt-1.5 block text-xs leading-5 text-ink-muted">{RECRUITMENT_MODE_META[mode].description}</span>
                </span>
                <ChevronRight aria-hidden className="mt-0.5 shrink-0 text-ink-muted group-hover:text-brand-600" size={18} />
              </button>
            ))}
          </div>
          {drafts.length > 0 ? (
            <Card aria-labelledby="wizard-drafts" className="rounded-2xl p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-ink-strong" id="wizard-drafts">
                <FileClock aria-hidden className="text-brand-600" size={16} /> 작성 중인 프로그램 {drafts.length}
              </h3>
              <ul className="mt-3 divide-y divide-surface-border">
                {drafts.map((draft) => (
                  <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={draft.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-strong">{draft.title}</p>
                      <p className="text-xs text-ink-muted">
                        {RECRUITMENT_MODE_META[draft.recruitment.mode].label} · 마지막 저장 {formatDateTime(draft.updatedAt)}
                      </p>
                    </div>
                    <Button aria-label={`${draft.title} 이어서 작성`} size="sm" to={`/org/${orgId}/programs/${draft.id}/setup`} variant="outline">
                      이어서 작성
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </main>
      ) : (
        <main className="mx-auto max-w-[1200px] px-4 pb-32 pt-5 sm:px-6 md:pb-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8 lg:pt-8">
          <div className="space-y-2 lg:sticky lg:top-24 lg:self-start">
            <WizardStepper current={step} onSelect={go} reachable={reachable} steps={steps} />
            <div className="sm:hidden">{saveIndicator}</div>
          </div>
          <div className="mt-4 min-w-0 lg:mt-0">
            <Card className="rounded-2xl p-5 sm:p-6 lg:p-8">
              <div className="mb-6">
                <p className="text-xs font-semibold text-brand-700">
                  {stepIndex + 1}단계 · {RECRUITMENT_MODE_META[form.recruitmentMode].label}
                </p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-ink-strong outline-none sm:text-2xl" ref={headingRef} tabIndex={-1}>
                  {STEP_INTRO[step].title}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">{STEP_INTRO[step].description}</p>
              </div>
              {content}
              {stepError ? (
                <p className="mt-5 rounded-xl bg-danger-50 px-4 py-2.5 text-sm font-medium text-danger-700" role="alert">
                  {stepError}
                </p>
              ) : null}
            </Card>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-border bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mt-5 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
              <div className="flex items-center gap-2 md:justify-between">
                <Button disabled={stepIndex === 0} onClick={() => go(steps[stepIndex - 1])} variant="ghost">
                  이전
                </Button>
                <div className="flex flex-1 justify-end md:flex-none">
                  {step === 'review' ? (
                    <Button
                      className="flex-1 md:flex-none"
                      disabled={problems.length > 0 || remove.isPending}
                      loading={publish.isPending}
                      onClick={() => {
                        setStepError(null)
                        publish.mutate()
                      }}
                    >
                      {recruiting ? '모집 공고 게시' : '프로그램 개설'}
                    </Button>
                  ) : (
                    <Button className="flex-1 md:flex-none" onClick={goNext}>
                      다음 단계 <ArrowRight aria-hidden size={16} />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}
