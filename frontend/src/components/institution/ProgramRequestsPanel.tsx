import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderPlus, Link2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { REGISTRATION_STATUS_META, VISIBILITY_META, formatDate } from '../../lib/programs'
import { decideProjectRequest, getProjectRequests } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program, ProjectRegistration, RegistrationStatus } from '../../types/program'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { ErrorState } from '../common/ErrorState'

const FILTERS: Array<{ id: RegistrationStatus | 'all'; label: string }> = [
  { id: 'pending', label: '승인 대기' },
  { id: 'all', label: '전체 이력' },
]

function DecisionModal({
  program,
  request,
  decision,
  onClose,
}: {
  program: Program
  request: ProjectRegistration
  decision: 'approve' | 'reject'
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const decide = useMutation({
    mutationFn: () => decideProjectRequest(token!, program.id, request.id, decision, note.trim()),
    onSuccess: () => {
      showToast(decision === 'approve' ? '등록을 승인했습니다. 성과 인증은 별도로 진행됩니다.' : '등록 요청을 반려했습니다.', decision === 'approve' ? 'success' : 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
      onClose()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const needsNote = decision === 'reject'

  return (
    <Modal
      description={
        decision === 'approve'
          ? '승인하면 같은 프로젝트가 그대로 프로그램에 연결되고 팀원은 참여자로 등록됩니다. 등록 승인은 성과 인증이 아닙니다.'
          : '반려해도 참여자의 프로젝트는 개인 프로젝트로 그대로 남습니다. 사유는 신청자에게 전달됩니다.'
      }
      onClose={onClose}
      open
      title={`${request.project.title} ${decision === 'approve' ? '등록 승인' : '반려'}`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          decide.mutate()
        }}
      >
        <Textarea
          label={needsNote ? '반려 사유 (필수)' : '메모 (선택)'}
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          placeholder={needsNote ? '예: 프로젝트 목표와 프로그램 주제가 맞지 않습니다.' : ''}
          required={needsNote}
          value={note}
        />
        <div className="flex justify-end">
          <Button disabled={decide.isPending || (needsNote && !note.trim())} type="submit" variant={needsNote ? 'danger' : 'primary'}>
            {decision === 'approve' ? '승인' : '반려'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function RegistrationCard({
  request,
  actions,
}: {
  request: ProjectRegistration
  actions?: ReactNode
}) {
  const status = REGISTRATION_STATUS_META[request.status]
  const snapshot = request.snapshot
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            {request.source === 'new_project' ? <FolderPlus size={13} /> : <Link2 size={13} />}
            {request.source === 'new_project' ? '새 프로젝트' : '기존 프로젝트 연결'} · {formatDate(request.createdAt)}
            {request.requester ? ` · ${request.requester.name}` : ''}
          </p>
          <p className="mt-1 truncate font-bold text-ink-strong">
            {snapshot?.teamName ? <span className="mr-1 text-brand-600">{snapshot.teamName}</span> : null}
            {request.project.title}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {snapshot?.objective || snapshot?.description ? (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-ink-body">{snapshot.objective ?? snapshot.description}</p>
      ) : null}
      {snapshot ? (
        <p className="mt-2 text-xs text-ink-muted">
          팀원 {snapshot.members.map((m) => m.name).join(', ') || '없음'} · 태스크 {snapshot.counts.tasks} · 활동 {snapshot.counts.activities} · 링크{' '}
          {snapshot.counts.links} · {VISIBILITY_META[request.project.visibility]?.label ?? request.project.visibility}
        </p>
      ) : null}
      {request.message ? <p className="mt-2 rounded-xl bg-surface-muted/60 px-3 py-2 text-sm text-ink-body">“{request.message}”</p> : null}
      {request.reviewNote || request.reviewedBy ? (
        <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${request.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}>
          {request.reviewedBy ? `${request.reviewedBy.name} · ` : ''}
          {request.reviewedAt ? `${formatDate(request.reviewedAt)} · ` : ''}
          {request.reviewNote ?? '메모 없음'}
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-4">{actions}</div> : null}
    </Card>
  )
}

export function ProgramRequestsPanel({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const [filter, setFilter] = useState<RegistrationStatus | 'all'>('pending')
  const [decision, setDecision] = useState<{ request: ProjectRegistration; decision: 'approve' | 'reject' } | null>(null)
  const writable = program.status !== 'archived' && program.status !== 'completed'

  const requestsQuery = useQuery({
    queryKey: ['programs', program.id, 'project-requests', filter],
    queryFn: () => getProjectRequests(token!, program.id, filter),
    enabled: Boolean(token),
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {program.policy.allowStudentProjects
            ? program.policy.requireProjectApproval
              ? '참여자가 만들거나 연결한 프로젝트는 승인 후 프로그램에 등록됩니다. 등록 승인은 성과 인증과 별개입니다.'
              : '이 프로그램은 참여자 프로젝트를 자동 승인합니다. 아래에서 등록 이력을 확인하세요.'
            : '참여자 프로젝트 등록이 꺼져 있습니다. 설정 탭의 운영 정책에서 켤 수 있습니다.'}
        </p>
        <div className="flex gap-1 rounded-full border border-surface-border bg-white p-1">
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
            </button>
          ))}
        </div>
      </div>

      {requestsQuery.isLoading ? (
        <LoadingState />
      ) : requestsQuery.isError ? (
        <ErrorState error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} />
      ) : (requestsQuery.data?.requests ?? []).length === 0 ? (
        <EmptyState
          description={filter === 'pending' ? '새 등록 요청이 들어오면 알림과 함께 이곳에 표시됩니다.' : '아직 등록 이력이 없습니다.'}
          title={filter === 'pending' ? '대기 중인 요청이 없습니다' : '이력이 없습니다'}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {requestsQuery.data!.requests.map((request) => (
            <RegistrationCard
              actions={
                request.status === 'pending' && writable ? (
                  <>
                    <Button className="min-h-9 px-4" onClick={() => setDecision({ request, decision: 'approve' })}>
                      승인
                    </Button>
                    <Button className="min-h-9 px-4" onClick={() => setDecision({ request, decision: 'reject' })} variant="danger">
                      반려
                    </Button>
                  </>
                ) : undefined
              }
              key={request.id}
              request={request}
            />
          ))}
        </div>
      )}

      {decision ? (
        <DecisionModal decision={decision.decision} onClose={() => setDecision(null)} program={program} request={decision.request} />
      ) : null}
    </div>
  )
}
