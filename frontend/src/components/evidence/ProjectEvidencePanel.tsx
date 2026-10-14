import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import {
  checkEvidenceFile,
  EVIDENCE_ACCEPT,
  EVIDENCE_CATEGORY_LABEL,
  EVIDENCE_STATUS_META,
  toDateInput,
} from '../../lib/programs'
import {
  addEvidenceFiles,
  createEvidence,
  deleteEvidence,
  getProjectEvidence,
  removeEvidenceFile,
  submitEvidence,
  updateEvidence,
  type EvidenceFields,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Evidence, EvidenceCategory, EvidenceStatus } from '../../types/program'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Input, Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { EvidenceCard } from './EvidenceCard'
import { EvidenceFilePicker } from './EvidenceFilePicker'
import { EvidenceReviewActions } from './EvidenceReviewActions'
import { EvidenceRevokeAction } from './EvidenceRevokeAction'
import { ErrorState } from '../common/ErrorState'

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): EvidenceFields => ({ title: '', description: '', category: 'development', activityDate: today() })

type FormState = { mode: 'create' } | { mode: 'edit'; evidence: Evidence }

function EvidenceFormModal({
  projectId,
  state,
  maxFiles,
  onClose,
}: {
  projectId: string
  state: FormState
  maxFiles: number
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EvidenceFields>(() =>
    state.mode === 'edit'
      ? {
          title: state.evidence.title,
          description: state.evidence.description ?? '',
          category: state.evidence.category,
          activityDate: toDateInput(state.evidence.activityDate),
        }
      : emptyForm(),
  )
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async (andSubmit: boolean) => {
      const evidence =
        state.mode === 'create'
          ? (await createEvidence(token!, projectId, form, files)).evidence
          : (await updateEvidence(token!, state.evidence.id, form)).evidence
      return andSubmit ? (await submitEvidence(token!, evidence.id)).evidence : evidence
    },
    onSuccess: (evidence) => {
      showToast(evidence.status === 'submitted' ? '제출했습니다. 담당자 검토를 기다려 주세요.' : '저장했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['evidence'] })
      onClose()
    },
    onError: (err: Error) => {
      setError(err.message)
      void queryClient.invalidateQueries({ queryKey: ['evidence'] })
    },
  })

  const canSubmitNow = state.mode === 'create' ? files.length > 0 : state.evidence.files.length > 0

  return (
    <Modal
      description="활동 사진·영상·보고서를 첨부해 제출하면 프로그램 담당자가 검토합니다. 승인된 활동만 검증 기록이 됩니다."
      onClose={onClose}
      open
      title={state.mode === 'create' ? '활동 증빙 작성' : '활동 증빙 수정'}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          save.mutate(false)
        }}
      >
        <Input
          label="활동 제목"
          maxLength={120}
          minLength={2}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          required
          value={form.title}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="활동 유형"
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value as EvidenceCategory }))}
            value={form.category}
          >
            {Object.entries(EVIDENCE_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            label="활동 날짜"
            onChange={(event) => setForm((prev) => ({ ...prev, activityDate: event.target.value }))}
            required
            type="date"
            value={form.activityDate}
          />
        </div>
        <Textarea
          label="활동 내용"
          maxLength={4000}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          placeholder="무엇을 했고, 본인이 맡은 역할은 무엇이었는지 적어 주세요."
          value={form.description}
        />
        {state.mode === 'create' ? (
          <EvidenceFilePicker files={files} max={maxFiles} onChange={setFiles} onError={(message) => showToast(message, 'error')} />
        ) : (
          <p className="text-xs text-ink-muted">첨부 파일은 증빙 카드에서 추가·삭제할 수 있습니다.</p>
        )}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700" role="alert">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={save.isPending} type="submit" variant="secondary">
            임시저장
          </Button>
          <Button
            disabled={save.isPending || !canSubmitNow}
            onClick={() => {
              setError(null)
              save.mutate(true)
            }}
            title={canSubmitNow ? undefined : '파일을 1개 이상 첨부해야 제출할 수 있습니다.'}
          >
            {save.isPending ? '저장 중…' : state.mode === 'edit' && state.evidence.status === 'rejected' ? '수정 후 재제출' : '저장 후 제출'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function AddFilesButton({ evidence, max }: { evidence: Evidence; max: number }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (files: File[]) => addEvidenceFiles(token!, evidence.id, files),
    onSuccess: () => {
      showToast('파일을 추가했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['evidence'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <>
      <Button
        disabled={upload.isPending || evidence.files.length >= max}
        onClick={() => inputRef.current?.click()}
        variant="secondary"
      >
        {upload.isPending ? '업로드 중…' : '파일 추가'}
      </Button>
      <input
        accept={EVIDENCE_ACCEPT}
        className="hidden"
        multiple
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? [])
          event.target.value = ''
          const problems = picked.map(checkEvidenceFile).filter(Boolean)
          if (problems.length) {
            showToast(problems[0]!, 'error')
            return
          }
          if (picked.length) upload.mutate(picked)
        }}
        ref={inputRef}
        type="file"
      />
    </>
  )
}

const FILTERS: Array<{ id: 'all' | EvidenceStatus; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'submitted', label: '검토 대기' },
  { id: 'approved', label: '승인' },
  { id: 'rejected', label: '반려' },
  { id: 'draft', label: '임시저장' },
]

export function ProjectEvidencePanel({ projectId }: { projectId: string }) {
  const token = useAuthStore((s) => s.token)
  const me = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [formState, setFormState] = useState<FormState | null>(null)
  const [filter, setFilter] = useState<'all' | EvidenceStatus>('all')

  const evidenceQuery = useQuery({
    queryKey: ['evidence', 'project', projectId],
    queryFn: () => getProjectEvidence(token!, projectId),
    enabled: Boolean(token),
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['evidence'] })
  const onError = (error: Error) => showToast(error.message, 'error')
  const submit = useMutation({
    mutationFn: (id: string) => submitEvidence(token!, id),
    onSuccess: () => {
      showToast('제출했습니다. 담당자 검토를 기다려 주세요.')
      invalidate()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteEvidence(token!, id),
    onSuccess: () => {
      showToast('임시저장 증빙을 삭제했습니다.', 'info')
      invalidate()
    },
    onError,
  })
  const removeFile = useMutation({
    mutationFn: ({ evidenceId, fileId }: { evidenceId: string; fileId: string }) =>
      removeEvidenceFile(token!, evidenceId, fileId),
    onSuccess: invalidate,
    onError,
  })

  if (evidenceQuery.isLoading) return <LoadingState />
  if (evidenceQuery.isError || !evidenceQuery.data) {
    return <ErrorState error={evidenceQuery.error} onRetry={() => void evidenceQuery.refetch()} />
  }

  const { evidence, program, canCreate, canReview, limits } = evidenceQuery.data
  const visible = filter === 'all' ? evidence : evidence.filter((item) => item.status === filter)
  const approvedCount = evidence.filter((item) => item.status === 'approved').length

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-brand-600" size={20} /> 활동 증빙
            </CardTitle>
            <CardDescription>
              {program.title} · 승인 {approvedCount}건. 제출된 파일은 비공개로 보관되며 팀원과 담당자만 열람할 수 있습니다.
            </CardDescription>
          </div>
          {canCreate ? (
            <Button onClick={() => setFormState({ mode: 'create' })}>
              <Plus className="mr-1" size={16} /> 증빙 작성
            </Button>
          ) : null}
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const count = item.id === 'all' ? evidence.length : evidence.filter((e) => e.status === item.id).length
            if (item.id === 'draft' && count === 0) return null
            return (
              <button
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  filter === item.id
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-surface-border bg-white text-ink-body hover:border-brand-200',
                )}
                key={item.id}
                onClick={() => setFilter(item.id)}
                type="button"
              >
                {item.label} {count}
              </button>
            )
          })}
        </div>
      </Card>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-muted">
          {evidence.length === 0
            ? canCreate
              ? '아직 활동 증빙이 없습니다. 회의 사진, 시연 영상, 보고서 PDF를 올려 보세요.'
              : '아직 제출된 활동 증빙이 없습니다.'
            : `${filter === 'all' ? '' : EVIDENCE_STATUS_META[filter].label} 증빙이 없습니다.`}
        </p>
      ) : (
        visible.map((item) => {
          const isAuthor = item.author?.id === me?.id
          const editable = isAuthor && (item.status === 'draft' || item.status === 'rejected')
          const actions = editable ? (
            <>
              <Button
                disabled={submit.isPending || item.files.length === 0 || program.status !== 'active'}
                onClick={() => submit.mutate(item.id)}
                title={item.files.length === 0 ? '파일을 1개 이상 첨부해야 제출할 수 있습니다.' : undefined}
              >
                {item.status === 'rejected' ? '재제출' : '제출'}
              </Button>
              <Button onClick={() => setFormState({ mode: 'edit', evidence: item })} variant="secondary">
                내용 수정
              </Button>
              <AddFilesButton evidence={item} max={limits.maxFilesPerEvidence} />
              {item.status === 'draft' ? (
                <Button
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm('이 임시저장 증빙을 삭제할까요?')) remove.mutate(item.id)
                  }}
                  variant="ghost"
                >
                  삭제
                </Button>
              ) : null}
            </>
          ) : canReview && !isAuthor && item.status === 'submitted' ? (
            <EvidenceReviewActions evidence={item} />
          ) : canReview && item.status === 'approved' ? (
            <EvidenceRevokeAction evidence={item} />
          ) : null

          return (
            <EvidenceCard
              actions={actions}
              evidence={item}
              key={item.id}
              onRemoveFile={editable ? (file) => removeFile.mutate({ evidenceId: item.id, fileId: file.id }) : undefined}
              removingFile={removeFile.isPending}
            />
          )
        })
      )}

      {formState ? (
        <EvidenceFormModal
          maxFiles={limits.maxFilesPerEvidence}
          onClose={() => setFormState(null)}
          projectId={projectId}
          state={formState}
        />
      ) : null}
    </div>
  )
}
