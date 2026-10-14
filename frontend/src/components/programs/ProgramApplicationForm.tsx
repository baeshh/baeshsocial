import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Paperclip, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { resolveApiUrl } from '../../lib/api'
import { formatBytes, formatDateTime } from '../../lib/programs'
import {
  deleteApplicationFile,
  getApplicationFileUrl,
  saveMyApplication,
  uploadApplicationFile,
} from '../../services/programService'
import { showToast } from '../../stores/toastStore'
import type { AnswerValue, ApplicationField, ApplicationFile, DiscoverableProgram } from '../../types/program'
import { Button } from '../common/Button'

const MAX_FILES_PER_FIELD = 3
const inputClass =
  'mt-2 w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-sm text-ink-strong outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-surface-muted'

function isAnswered(field: ApplicationField, value: AnswerValue | undefined, fileCount: number) {
  if (field.type === 'file') return fileCount > 0
  if (field.type === 'consent') return value === true
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' && value.trim().length > 0
}

export function AttachmentLink({ token, file }: { token: string; file: ApplicationFile }) {
  const [opening, setOpening] = useState(false)
  const open = async () => {
    setOpening(true)
    try {
      const { url } = await getApplicationFileUrl(token, file.id)
      window.open(resolveApiUrl(url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setOpening(false)
    }
  }
  return (
    <button
      className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline disabled:opacity-50"
      disabled={opening}
      onClick={() => void open()}
      type="button"
    >
      <Paperclip className="shrink-0" size={14} />
      <span className="truncate">{file.originalName}</span>
      <span className="shrink-0 text-xs font-normal text-ink-muted">{formatBytes(file.sizeBytes)}</span>
      <ExternalLink className="shrink-0" size={12} />
    </button>
  )
}

function FileField({
  token,
  program,
  field,
  files,
  shareToken,
  onChanged,
}: {
  token: string
  program: DiscoverableProgram
  field: ApplicationField
  files: ApplicationFile[]
  shareToken: string | null
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => uploadApplicationFile(token, program.id, field.id, file, shareToken),
    onSuccess: onChanged,
    onError: (error: Error) => showToast(error.message, 'error'),
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = ''
    },
  })
  const remove = useMutation({
    mutationFn: (fileId: string) => deleteApplicationFile(token, program.id, fileId),
    onSuccess: onChanged,
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  return (
    <div className="mt-2 space-y-2">
      {files.length > 0 ? (
        <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border">
          {files.map((file) => (
            <li className="flex items-center gap-2 px-3 py-2" key={file.id}>
              <div className="min-w-0 flex-1">
                <AttachmentLink file={file} token={token} />
              </div>
              <button
                aria-label={`${file.originalName} 삭제`}
                className="rounded-full p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                disabled={remove.isPending}
                onClick={() => remove.mutate(file.id)}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length < MAX_FILES_PER_FIELD ? (
        <>
          <button
            aria-label={`${field.label} 파일 선택`}
            className="rounded-full border border-dashed border-surface-border px-4 py-2 text-sm font-medium text-ink-body hover:border-brand-300 disabled:opacity-50"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {upload.isPending ? '올리는 중…' : '파일 선택'}
          </button>
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload.mutate(file)
            }}
            ref={inputRef}
            type="file"
          />
        </>
      ) : null}
      <p className="text-xs text-ink-muted">PDF·이미지, 파일당 20MB 이하, 최대 {MAX_FILES_PER_FIELD}개. 담당자만 열람할 수 있습니다.</p>
    </div>
  )
}

/** Application form for one program: draft save, file upload and final submit. */
export function ProgramApplicationForm({
  token,
  program,
  shareToken,
  onChanged,
}: {
  token: string
  program: DiscoverableProgram
  shareToken: string | null
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const fields = program.applicationFields ?? []
  const application = program.myStatus.application
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => application?.answers ?? {})
  const [missing, setMissing] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const files = application?.files ?? []
  const filesFor = (fieldId: string) => files.filter((file) => file.fieldId === fieldId)
  const canSubmit = program.recruitment.state === 'open'

  const save = useMutation({
    mutationFn: (submit: boolean) => saveMyApplication(token, program.id, { answers, submit, shareToken }),
    onSuccess: (_, submit) => {
      setDirty(false)
      showToast(submit ? '지원서를 제출했습니다. 결과는 알림으로 알려드립니다.' : '임시저장했습니다. 마감 전까지 이어서 작성할 수 있습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs', 'applications', 'me'] })
      onChanged()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  // Answers live only in this component until 임시저장, so closing the tab would lose them.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setAnswer = (fieldId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }))
    setMissing((prev) => prev.filter((id) => id !== fieldId))
    setDirty(true)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const unanswered = fields.filter((field) => field.required && !isAnswered(field, answers[field.id], filesFor(field.id).length))
    if (unanswered.length > 0) {
      setMissing(unanswered.map((field) => field.id))
      showToast(`필수 항목을 입력해 주세요: ${unanswered.map((field) => field.label).join(', ')}`, 'error')
      const first = document.getElementById(`field-${unanswered[0].id}`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      first?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true })
      return
    }
    if (!window.confirm('제출한 지원서는 수정할 수 없습니다. 제출할까요?')) return
    save.mutate(true)
  }

  return (
    <form className="space-y-5" noValidate onSubmit={submit}>
      {application?.status === 'draft' ? (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-body">
          임시저장된 지원서입니다. {program.recruitment.applyEndAt ? `${formatDateTime(program.recruitment.applyEndAt)}까지 제출해 주세요.` : ''}
        </p>
      ) : null}
      {fields.map((field, index) => {
        const value = answers[field.id]
        const invalid = missing.includes(field.id)
        const labelId = `field-${field.id}-label`
        const noteId = `field-${field.id}-note`
        const errorId = `field-${field.id}-error`
        const described = {
          'aria-describedby': [field.description ? noteId : '', invalid ? errorId : ''].filter(Boolean).join(' ') || undefined,
          'aria-invalid': invalid || undefined,
          'aria-required': field.required || undefined,
        }
        const labelled = { 'aria-labelledby': labelId, ...described }
        return (
          <div className={`rounded-2xl ${invalid ? 'ring-2 ring-red-200 ring-offset-4' : ''}`} id={`field-${field.id}`} key={field.id}>
            {field.type === 'consent' ? (
              <div className="rounded-2xl border border-surface-border bg-surface-muted/50 p-4">
                {field.description ? (
                  <p className="whitespace-pre-wrap text-xs leading-5 text-ink-body" id={noteId}>
                    {field.description}
                  </p>
                ) : null}
                <label className="mt-2 flex cursor-pointer items-start gap-2 text-sm font-medium text-ink-strong">
                  <input
                    {...described}
                    checked={value === true}
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                    onChange={(event) => setAnswer(field.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    {field.label}
                    {field.required ? <span className="ml-1 text-red-600">*</span> : null}
                  </span>
                </label>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink-strong" id={labelId}>
                  {index + 1}. {field.label}
                  {field.required ? (
                    <span aria-hidden className="ml-1 text-red-600">
                      *
                    </span>
                  ) : (
                    <span className="ml-1 text-xs font-normal text-ink-muted">(선택)</span>
                  )}
                </p>
                {field.description ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-muted" id={noteId}>
                    {field.description}
                  </p>
                ) : null}
                {field.type === 'short_text' ? (
                  <input
                    {...labelled}
                    className={inputClass}
                    maxLength={200}
                    onChange={(event) => setAnswer(field.id, event.target.value)}
                    value={typeof value === 'string' ? value : ''}
                  />
                ) : null}
                {field.type === 'url' ? (
                  <input
                    {...labelled}
                    className={inputClass}
                    maxLength={500}
                    onChange={(event) => setAnswer(field.id, event.target.value)}
                    placeholder="https://"
                    type="url"
                    value={typeof value === 'string' ? value : ''}
                  />
                ) : null}
                {field.type === 'long_text' ? (
                  <>
                    <textarea
                      {...labelled}
                      className={`${inputClass} min-h-32 resize-y`}
                      maxLength={4000}
                      onChange={(event) => setAnswer(field.id, event.target.value)}
                      value={typeof value === 'string' ? value : ''}
                    />
                    <p className="mt-1 text-right text-xs text-ink-muted">{typeof value === 'string' ? value.length : 0} / 4000</p>
                  </>
                ) : null}
                {field.type === 'single_choice' ? (
                  <div {...labelled} className="mt-2 space-y-1.5" role="radiogroup">
                    {field.options.map((option) => (
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-body" key={option}>
                        <input
                          checked={value === option}
                          className="h-4 w-4 accent-brand-600"
                          name={`field-${field.id}`}
                          onChange={() => setAnswer(field.id, option)}
                          type="radio"
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : null}
                {field.type === 'multi_choice' ? (
                  <div aria-describedby={described['aria-describedby']} aria-labelledby={labelId} className="mt-2 space-y-1.5" role="group">
                    {field.options.map((option) => {
                      const selected = Array.isArray(value) ? value : []
                      return (
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-body" key={option}>
                          <input
                            checked={selected.includes(option)}
                            className="h-4 w-4 accent-brand-600"
                            onChange={(event) =>
                              setAnswer(field.id, event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))
                            }
                            type="checkbox"
                          />
                          {option}
                        </label>
                      )
                    })}
                  </div>
                ) : null}
                {field.type === 'file' ? (
                  <FileField
                    field={field}
                    files={filesFor(field.id)}
                    onChanged={() => {
                      setMissing((prev) => prev.filter((id) => id !== field.id))
                      onChanged()
                    }}
                    program={program}
                    shareToken={shareToken}
                    token={token}
                  />
                ) : null}
              </>
            )}
            {invalid ? (
              <p className="mt-1.5 text-xs font-medium text-red-700" id={errorId}>
                {field.type === 'consent' ? '동의가 필요합니다.' : '필수 항목입니다.'}
              </p>
            ) : null}
          </div>
        )
      })}
      <p className="text-xs text-ink-muted">
        BAESH 프로필(이름·소속·전공/직무·경력)이 지원서와 함께 이 프로그램 담당자에게만 공개됩니다. 선발되면 {program.organization.name}의
        프로그램 참여자로 자동 등록됩니다.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="sm:flex-1" disabled={save.isPending} onClick={() => save.mutate(false)} type="button" variant="secondary">
          임시저장
        </Button>
        <Button className="sm:flex-1" disabled={save.isPending || !canSubmit} type="submit">
          {save.isPending ? '저장 중…' : canSubmit ? '제출하기' : '모집 시작 후 제출 가능'}
        </Button>
      </div>
    </form>
  )
}
