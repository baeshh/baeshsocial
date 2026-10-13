import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useManagerCandidates } from '../../hooks/useManagerCandidates'
import { draftToFieldPayload, fieldsToDraft, programToForm, toProgramPayload, validateDraftFields, type DraftField } from '../../lib/programForm'
import { PROGRAM_VISIBILITY_META, RECRUITMENT_STATE_META, formatDateTime, programShareUrl, takesApplications } from '../../lib/programs'
import {
  deleteProgram,
  getApplicationForm,
  saveApplicationForm,
  updateProgram,
  updateProgramPublication,
  type PublicationAction,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program, ProgramAccess } from '../../types/program'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { ApplicationFormBuilder } from './ApplicationFormBuilder'
import { ManagersField, ProgramBasicsFields, ProgramPolicyFields, ProgramRecruitmentFields, ProgramVisibilityFields } from './ProgramFormFields'

const PUBLICATION_DONE: Record<PublicationAction, string> = {
  publish: '프로그램을 게시했습니다.',
  unpublish: '게시를 취소했습니다. 담당자만 볼 수 있습니다.',
  close_recruitment: '모집을 마감했습니다.',
  reopen_recruitment: '모집을 다시 열었습니다.',
  rotate_share_link: '새 링크를 만들었습니다. 이전 링크로는 더 이상 볼 수 없습니다.',
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-surface-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-base font-bold text-ink-strong">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function PublicationCard({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const recruiting = takesApplications(program.recruitment.mode)
  const state = program.recruitment.state
  const writable = program.status !== 'archived'
  const shareable = program.visibility !== 'private' && Boolean(program.publishedAt)
  const shareUrl = programShareUrl(program.id, program.visibility === 'unlisted' ? program.shareToken : null)

  const act = useMutation({
    mutationFn: (action: PublicationAction) => updateProgramPublication(token!, program.id, action),
    onSuccess: (_, action) => {
      showToast(PUBLICATION_DONE[action], action === 'unpublish' ? 'info' : 'success')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      showToast('링크를 복사했습니다.')
    } catch {
      showToast('링크를 복사하지 못했습니다. 직접 선택해 복사해 주세요.', 'error')
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          게시·모집 상태
          {program.publishedAt ? <Badge tone="green">게시됨</Badge> : <Badge>임시저장</Badge>}
          {recruiting && program.publishedAt ? <Badge tone={RECRUITMENT_STATE_META[state].tone}>{RECRUITMENT_STATE_META[state].label}</Badge> : null}
        </CardTitle>
        <CardDescription>
          {program.publishedAt
            ? `${formatDateTime(program.publishedAt)}에 게시했습니다. ${PROGRAM_VISIBILITY_META[program.visibility].description}`
            : '아직 게시하지 않았습니다. 담당자만 볼 수 있고, Jobs·검색에도 나오지 않습니다.'}
        </CardDescription>
      </CardHeader>
      {shareable ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-surface-border bg-surface-muted/50 px-3 py-2">
          <input aria-label="공유 링크" className="min-w-0 flex-1 bg-transparent text-sm text-ink-body outline-none" readOnly value={shareUrl} />
          <button className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600" onClick={() => void copy()} type="button">
            <Copy size={14} /> 복사
          </button>
          {program.visibility === 'unlisted' ? (
            <button
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink-strong disabled:opacity-50"
              disabled={act.isPending || !writable}
              onClick={() => {
                if (window.confirm('새 링크를 만들면 지금까지 공유한 링크로는 더 이상 볼 수 없습니다. 계속할까요?')) act.mutate('rotate_share_link')
              }}
              type="button"
            >
              <RefreshCw size={14} /> 재발급
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {program.publishedAt ? (
          <>
            {recruiting && (state === 'open' || state === 'scheduled') ? (
              <Button
                disabled={act.isPending || !writable}
                onClick={() => {
                  if (window.confirm('모집을 지금 마감할까요? 더 이상 지원서를 받지 않습니다.')) act.mutate('close_recruitment')
                }}
                variant="secondary"
              >
                모집 조기 마감
              </Button>
            ) : null}
            {recruiting && program.recruitment.closedEarlyAt ? (
              <Button disabled={act.isPending || !writable} onClick={() => act.mutate('reopen_recruitment')} variant="secondary">
                모집 재개
              </Button>
            ) : null}
            <Button
              disabled={act.isPending || !writable}
              onClick={() => {
                if (window.confirm('게시를 취소하면 Jobs·공개 페이지에서 내려가고 새 지원을 받지 않습니다. 계속할까요?')) act.mutate('unpublish')
              }}
              variant="ghost"
            >
              게시 취소
            </Button>
          </>
        ) : (
          <Button disabled={act.isPending || !writable} onClick={() => act.mutate('publish')}>
            {recruiting ? '모집 공고 게시' : '게시'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function ApplicationFormCard({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const formQuery = useQuery({
    queryKey: ['programs', program.id, 'application-form'],
    queryFn: () => getApplicationForm(token!, program.id),
    enabled: Boolean(token),
  })
  const [draft, setDraft] = useState<DraftField[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fields = draft ?? (formQuery.data ? fieldsToDraft(formQuery.data.fields) : [])

  const save = useMutation({
    mutationFn: () => saveApplicationForm(token!, program.id, draftToFieldPayload(fields)),
    onSuccess: ({ fields: saved }) => {
      showToast('지원서 문항을 저장했습니다.')
      queryClient.setQueryData(['programs', program.id, 'application-form'], { fields: saved, submittedCount: formQuery.data?.submittedCount ?? 0 })
      setDraft(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg">지원서 문항</CardTitle>
        <CardDescription>
          지원자가 작성할 질문입니다.
          {formQuery.data?.submittedCount
            ? ` 이미 제출된 지원서 ${formQuery.data.submittedCount}건은 제출 당시의 질문과 답변 그대로 보존됩니다.`
            : ''}
        </CardDescription>
      </CardHeader>
      {formQuery.isLoading ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <ApplicationFormBuilder disabled={program.status === 'archived'} fields={fields} onChange={setDraft} />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}
          {draft ? (
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDraft(null)} variant="ghost">
                되돌리기
              </Button>
              <Button
                disabled={save.isPending}
                onClick={() => {
                  setError(null)
                  const problem = validateDraftFields(fields)
                  if (problem) setError(problem)
                  else save.mutate()
                }}
              >
                {save.isPending ? '저장 중…' : '문항 저장'}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

export function ProgramSettingsPanel({ program, access }: { program: Program; access: ProgramAccess }) {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => programToForm(program))
  const [error, setError] = useState<string | null>(null)
  const managerCandidates = useManagerCandidates(program.organizationId, access.isOrgAdmin)

  const save = useMutation({
    mutationFn: () =>
      updateProgram(token!, program.id, {
        ...toProgramPayload(form),
        ...(access.isOrgAdmin ? { managerUserIds: form.managerUserIds } : {}),
      }),
    onSuccess: () => {
      showToast('프로그램 정보를 저장했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (err: Error) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: () => deleteProgram(token!, program.id),
    onSuccess: () => {
      showToast('프로그램을 삭제했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      navigate(`/org/${program.organizationId}?tab=programs`)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  return (
    <div className="space-y-5">
      <PublicationCard program={program} />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">프로그램 정보</CardTitle>
          <CardDescription>
            보관 상태로 바꾸면 프로젝트·참여자·증빙이 더 이상 수정되지 않습니다. 모집 마감일과 운영 종료일, 정원과 실제 참여 인원은 각각 따로 관리됩니다.
          </CardDescription>
        </CardHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            save.mutate()
          }}
        >
          <Section title="기본 정보">
            <ProgramBasicsFields
              managers={
                access.isOrgAdmin ? (
                  <ManagersField candidates={managerCandidates} onChange={(ids) => setForm((prev) => ({ ...prev, managerUserIds: ids }))} value={form.managerUserIds} />
                ) : (
                  <p className="text-xs text-ink-muted">담당자 변경은 조직 관리자에게 요청하세요.</p>
                )
              }
              onChange={setForm}
              showStatus
              value={form}
            />
          </Section>
          <Section title="모집">
            <ProgramRecruitmentFields onChange={setForm} value={form} />
          </Section>
          <Section title="공개 범위">
            <ProgramVisibilityFields onChange={setForm} value={form} />
          </Section>
          <Section description="참여자 프로젝트·팀 구성·기록 공개 범위 같은 운영 규칙입니다." title="운영 정책">
            <ProgramPolicyFields onChange={(policy) => setForm((prev) => ({ ...prev, policy }))} value={form.policy} />
          </Section>
          {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </Card>

      {takesApplications(program.recruitment.mode) ? <ApplicationFormCard program={program} /> : null}

      {access.isOrgAdmin ? (
        <Card className="rounded-2xl border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-700">프로그램 삭제</CardTitle>
            <CardDescription>프로젝트가 하나도 없는 프로그램만 삭제할 수 있습니다. 운영이 끝난 프로그램은 보관 상태로 바꿔 기록을 남기세요.</CardDescription>
          </CardHeader>
          <Button
            className="w-fit"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`'${program.title}' 프로그램을 삭제할까요?`)) remove.mutate()
            }}
            variant="danger"
          >
            삭제
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
