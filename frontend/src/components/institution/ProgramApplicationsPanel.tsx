import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APPLICATION_STATUS_META, RECRUITMENT_STATE_META, formatDate, formatDateTime } from '../../lib/programs'
import { decideProgramApplication, getProgramApplications } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { AnswerValue, ApplicationStatus, Program, ProgramApplication } from '../../types/program'
import { AttachmentLink } from '../programs/ProgramApplicationForm'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'

const FILTERS: Array<{ id: ApplicationStatus | 'all'; label: string }> = [
  { id: 'pending', label: '심사 중' },
  { id: 'accepted', label: '선발' },
  { id: 'rejected', label: '미선발' },
  { id: 'all', label: '전체' },
]

function DecisionModal({
  program,
  application,
  decision,
  onClose,
}: {
  program: Program
  application: ProgramApplication
  decision: 'accept' | 'reject'
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: () => decideProgramApplication(token!, program.id, application.id, decision, note),
    onSuccess: () => {
      showToast(decision === 'accept' ? `${application.user.name}님을 선발했습니다.` : '미선발로 처리했습니다.', decision === 'accept' ? 'success' : 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const accept = decision === 'accept'

  return (
    <Modal
      description={
        accept
          ? '선발하면 이 프로그램의 참여자로 등록됩니다. 조직 구성원으로 가입되지는 않습니다.'
          : '지원자에게 결과 알림이 갑니다. 아래 메모는 지원자에게 사유로 표시됩니다.'
      }
      onClose={onClose}
      open
      title={`${application.user.name} ${accept ? '선발' : '미선발 처리'}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          decide.mutate()
        }}
      >
        <Textarea
          label={accept ? '내부 메모 (선택)' : '지원자에게 보낼 사유 (선택)'}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder={accept ? '' : '예: 이번 기수는 정원이 마감되었습니다.'}
          value={note}
        />
        <div className="flex justify-end">
          <Button disabled={decide.isPending} type="submit" variant={accept ? 'primary' : 'danger'}>
            {accept ? '선발' : '미선발 처리'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function formatAnswer(value: AnswerValue) {
  if (typeof value === 'boolean') return value ? '동의함' : '동의하지 않음'
  if (Array.isArray(value)) return value.join(', ')
  return value
}

function ApplicationAnswers({ application }: { application: ProgramApplication }) {
  const token = useAuthStore((s) => s.token)
  const [expanded, setExpanded] = useState(false)
  const answers = application.answers.filter((answer) => answer.type !== 'file')
  const fileFieldIds = [...new Set(application.files.map((file) => file.fieldId))]
  const fileLabels = new Map(application.files.map((file) => [file.fieldId, file.fieldLabel]))
  if (answers.length === 0 && application.files.length === 0) {
    return application.message ? (
      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-muted/60 px-3 py-2 text-sm text-ink-body">{application.message}</p>
    ) : (
      <p className="mt-2 text-sm text-ink-muted">작성한 답변이 없습니다.</p>
    )
  }
  const visible = expanded ? answers : answers.slice(0, 2)
  return (
    <div className="mt-3 space-y-3">
      {application.message ? (
        <p className="whitespace-pre-wrap rounded-xl bg-surface-muted/60 px-3 py-2 text-sm text-ink-body">{application.message}</p>
      ) : null}
      {visible.map((answer) => (
        <div key={answer.fieldId}>
          <p className="text-xs font-semibold text-ink-muted">
            {answer.label}
            {answer.archived ? <span className="ml-1 font-normal">(삭제된 문항)</span> : null}
          </p>
          <p className={`mt-0.5 whitespace-pre-wrap text-sm text-ink-body ${expanded ? '' : 'line-clamp-4'}`}>
            {answer.type === 'url' && typeof answer.value === 'string' ? (
              <a className="break-all text-brand-700 hover:underline" href={answer.value} rel="noopener noreferrer nofollow" target="_blank">
                {answer.value}
              </a>
            ) : (
              formatAnswer(answer.value)
            )}
          </p>
        </div>
      ))}
      {answers.length > 2 || (!expanded && answers.some((answer) => typeof answer.value === 'string' && answer.value.length > 200)) ? (
        <button className="text-xs font-semibold text-brand-600" onClick={() => setExpanded((value) => !value)} type="button">
          {expanded ? '접기' : `답변 전체 보기${answers.length > 2 ? ` (${answers.length}개)` : ''}`}
        </button>
      ) : null}
      {token && application.files.length > 0 ? (
        <div className="space-y-1">
          {fileFieldIds.map((fieldId) => (
            <div key={fieldId}>
              {fileLabels.get(fieldId) ? <p className="text-xs font-semibold text-ink-muted">{fileLabels.get(fieldId)}</p> : null}
              {application.files
                .filter((file) => file.fieldId === fieldId)
                .map((file) => (
                  <div key={file.id}>
                    <AttachmentLink file={file} token={token} />
                  </div>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ApplicationCard({ application, actions }: { application: ProgramApplication; actions?: ReactNode }) {
  const status = APPLICATION_STATUS_META[application.status]
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <Link className="flex min-w-0 items-center gap-3" to={`/profile/${application.user.id}`}>
          <Avatar name={application.user.name} size="md" src={application.user.avatarUrl} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-ink-strong hover:text-brand-600">{application.user.name}</span>
            <span className="block truncate text-xs text-ink-muted">{application.user.headline ?? application.user.email}</span>
          </span>
        </Link>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-3 text-xs text-ink-muted">제출 {formatDateTime(application.submittedAt ?? application.createdAt)}</p>
      <ApplicationAnswers application={application} />
      {application.reviewedBy ? (
        <p className="mt-2 text-xs text-ink-muted">
          {application.reviewedBy.name} · {formatDate(application.reviewedAt)}
          {application.reviewNote ? ` · ${application.reviewNote}` : ''}
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-4">{actions}</div> : null}
    </Card>
  )
}

export function ProgramApplicationsPanel({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('pending')
  const [decision, setDecision] = useState<{ application: ProgramApplication; decision: 'accept' | 'reject' } | null>(null)
  const writable = program.status !== 'archived'
  const recruitment = program.recruitment

  const applicationsQuery = useQuery({
    queryKey: ['programs', program.id, 'applications', filter],
    queryFn: () => getProgramApplications(token!, program.id, filter),
    enabled: Boolean(token),
  })
  const data = applicationsQuery.data
  const full = Boolean(data?.capacity && data.participantCount >= data.capacity)

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl p-4 text-sm">
        <Badge tone={RECRUITMENT_STATE_META[recruitment.state].tone}>{RECRUITMENT_STATE_META[recruitment.state].label}</Badge>
        <span className="text-ink-body">
          모집 {recruitment.applyStartAt ? formatDateTime(recruitment.applyStartAt) : '게시 즉시'} ~ {formatDateTime(recruitment.applyEndAt)}
        </span>
        {recruitment.mode === 'mixed' && recruitment.openSeats !== null ? (
          <span className="text-ink-body">추가 모집 {recruitment.openSeats}명 남음</span>
        ) : null}
        {recruitment.announceAt ? <span className="text-ink-body">발표 {formatDateTime(recruitment.announceAt)}</span> : null}
        {data ? (
          <span className={`font-semibold ${full ? 'text-red-600' : 'text-ink-strong'}`}>
            선발 {data.participantCount}
            {data.capacity ? ` / ${data.capacity}명` : '명'}
            {full ? ' · 정원 마감' : ''}
          </span>
        ) : null}
        {!program.publishedAt ? (
          <span className="text-xs font-medium text-amber-700">아직 게시하지 않아 지원을 받을 수 없습니다. 설정 탭에서 모집 공고를 게시해 주세요.</span>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-1 rounded-full border border-surface-border bg-white p-1 sm:w-fit">
        {FILTERS.map((item) => (
          <button
            className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
              filter === item.id ? 'bg-brand-600 text-white' : 'text-ink-body hover:bg-surface-muted'
            }`}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
            {item.id !== 'all' && data?.counts[item.id] ? ` ${data.counts[item.id]}` : ''}
          </button>
        ))}
      </div>

      {applicationsQuery.isLoading ? (
        <LoadingState />
      ) : applicationsQuery.isError ? (
        <p className="text-sm text-red-700">{(applicationsQuery.error as Error).message}</p>
      ) : (data?.applications ?? []).length === 0 ? (
        <EmptyState
          description={filter === 'pending' ? '지원서가 들어오면 알림과 함께 이곳에 표시됩니다.' : '해당하는 지원서가 없습니다.'}
          title={filter === 'pending' ? '심사할 지원서가 없습니다' : '지원서가 없습니다'}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data!.applications.map((application) => (
            <ApplicationCard
              actions={
                application.status === 'pending' && writable ? (
                  <>
                    <Button className="min-h-9 px-4" disabled={full} onClick={() => setDecision({ application, decision: 'accept' })}>
                      선발
                    </Button>
                    <Button className="min-h-9 px-4" onClick={() => setDecision({ application, decision: 'reject' })} variant="secondary">
                      미선발
                    </Button>
                  </>
                ) : undefined
              }
              application={application}
              key={application.id}
            />
          ))}
        </div>
      )}

      {decision ? (
        <DecisionModal application={decision.application} decision={decision.decision} onClose={() => setDecision(null)} program={program} />
      ) : null}
    </div>
  )
}
