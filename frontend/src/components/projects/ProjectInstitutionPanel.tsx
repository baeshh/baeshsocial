import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, MessageSquare, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { REVIEW_KIND_LABEL, formatDate } from '../../lib/programs'
import {
  createProjectReview,
  getProjectReviews,
  getProjectVerification,
  removeProgramProject,
  resolveProjectReview,
  revokeProjectVerification,
  verifyProject,
  verifyProjectMembers,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { ProjectReview, ProjectReviewKind, ProjectVerificationResponse, VerifyMemberInput } from '../../types/program'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Input, Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { ErrorState } from '../common/ErrorState'

type Props = { projectId: string; programId: string; programTitle: string; organizationName: string }

const KIND_TONE: Record<ProjectReviewKind, 'blue' | 'purple' | 'gray' | 'red'> = {
  feedback: 'blue',
  revision_request: 'purple',
  response: 'gray',
  removal_request: 'red',
}

function ReviewItem({ review, canResolve, onResolve }: { review: ProjectReview; canResolve: boolean; onResolve: () => void }) {
  return (
    <li className={`rounded-2xl border p-4 ${review.authorIsStaff ? 'border-brand-100 bg-brand-50/40' : 'border-surface-border bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={review.author?.name ?? '?'} size="sm" src={review.author?.avatarUrl} />
        <span className="text-sm font-semibold text-ink-strong">{review.author?.name ?? '탈퇴한 사용자'}</span>
        {review.authorIsStaff ? <Badge tone="blue">담당자</Badge> : null}
        <Badge tone={KIND_TONE[review.kind]}>{REVIEW_KIND_LABEL[review.kind]}</Badge>
        {review.status === 'open' ? <Badge tone="purple">처리 대기</Badge> : null}
        {review.status === 'resolved' ? <Badge tone="green">처리됨</Badge> : null}
        <span className="ml-auto text-xs text-ink-muted">{formatDate(review.createdAt)}</span>
      </div>
      {review.targetUser ? <p className="mt-2 text-xs font-semibold text-red-700">제외 대상: {review.targetUser.name}</p> : null}
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-body">{review.body}</p>
      {review.resolvedBy ? (
        <p className="mt-2 text-xs text-ink-muted">
          {review.resolvedBy.name} · {formatDate(review.resolvedAt)} 처리
        </p>
      ) : null}
      {canResolve && review.status === 'open' ? (
        <Button className="mt-3 min-h-8 px-3 text-xs" onClick={onResolve} variant="secondary">
          처리 완료로 표시
        </Button>
      ) : null}
    </li>
  )
}

function VerifyModal({
  data,
  mode,
  onClose,
  onSubmit,
  pending,
}: {
  data: ProjectVerificationResponse
  mode: 'project' | 'members'
  onClose: () => void
  onSubmit: (payload: { outcomeSummary: string; members: VerifyMemberInput[] }) => void
  pending: boolean
}) {
  const candidates = data.candidates.filter((c) => !c.verified)
  const [outcome, setOutcome] = useState('')
  const [rows, setRows] = useState(() =>
    candidates.map((c) => ({
      userId: c.userId,
      name: c.name,
      evidence: c.approvedEvidence,
      selected: c.approvedEvidence > 0,
      role: c.role,
      contribution: '',
      startDate: '',
      endDate: '',
    })),
  )
  const update = (userId: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((prev) => prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row)))
  const selected = rows.filter((row) => row.selected)
  const valid =
    selected.length > 0 &&
    selected.every((row) => row.role.trim() && row.contribution.trim().length >= 10) &&
    (mode === 'members' || outcome.trim().length >= 10)

  return (
    <Modal
      description="승인된 활동 증빙을 근거로 인증합니다. 승인 증빙이 없는 참여자는 인증할 수 없으며, 인증 후 내용은 고정되어 본인이 수정할 수 없습니다."
      onClose={onClose}
      open
      title={mode === 'project' ? '프로젝트 성과 인증' : '팀원 추가 인증'}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({
            outcomeSummary: outcome.trim(),
            members: selected.map((row) => ({
              userId: row.userId,
              role: row.role.trim(),
              contribution: row.contribution.trim(),
              startDate: row.startDate || null,
              endDate: row.endDate || null,
            })),
          })
        }}
      >
        {mode === 'project' ? (
          <Textarea
            helperText="10자 이상. 실제로 확인한 결과만 적어 주세요."
            label="프로젝트 성과 요약"
            maxLength={4000}
            onChange={(e) => setOutcome(e.target.value)}
            required
            value={outcome}
          />
        ) : null}
        <div className="space-y-3">
          {rows.length === 0 ? <p className="text-sm text-ink-muted">추가로 인증할 팀원이 없습니다.</p> : null}
          {rows.map((row) => (
            <div className={`rounded-2xl border p-4 ${row.selected ? 'border-brand-200' : 'border-surface-border opacity-70'}`} key={row.userId}>
              <label className="flex items-center gap-2">
                <input
                  checked={row.selected}
                  disabled={row.evidence === 0}
                  onChange={(e) => update(row.userId, { selected: e.target.checked })}
                  type="checkbox"
                />
                <span className="text-sm font-semibold text-ink-strong">{row.name}</span>
                <span className={`text-xs ${row.evidence ? 'text-emerald-700' : 'text-red-600'}`}>
                  승인 증빙 {row.evidence}건{row.evidence === 0 ? ' · 인증 불가' : ''}
                </span>
              </label>
              {row.selected ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input label="역할" maxLength={60} onChange={(e) => update(row.userId, { role: e.target.value })} required value={row.role} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="참여 시작" onChange={(e) => update(row.userId, { startDate: e.target.value })} type="date" value={row.startDate} />
                    <Input label="참여 종료" onChange={(e) => update(row.userId, { endDate: e.target.value })} type="date" value={row.endDate} />
                  </div>
                  <div className="sm:col-span-2">
                    <Textarea
                      helperText="10자 이상. 승인된 증빙으로 확인되는 기여만 적어 주세요."
                      label="기여 내용"
                      maxLength={2000}
                      onChange={(e) => update(row.userId, { contribution: e.target.value })}
                      required
                      value={row.contribution}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button disabled={!valid || pending} type="submit">
            {pending ? '인증 중…' : '인증'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function VerificationSection({ projectId, programId, organizationName }: Omit<Props, 'programTitle'>) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<'project' | 'members' | null>(null)
  const query = useQuery({
    queryKey: ['programs', programId, 'verification', projectId],
    queryFn: () => getProjectVerification(token!, programId, projectId),
    enabled: Boolean(token),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['programs', programId] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }
  const verify = useMutation({
    mutationFn: async (payload: { outcomeSummary: string; members: VerifyMemberInput[] }) => {
      if (modal === 'project') await verifyProject(token!, programId, projectId, payload)
      else await verifyProjectMembers(token!, programId, projectId, payload.members)
    },
    onSuccess: () => {
      showToast('기관 공식 인증을 완료했습니다.')
      setModal(null)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const revoke = useMutation({
    mutationFn: ({ reason, userId }: { reason: string; userId?: string }) => revokeProjectVerification(token!, programId, projectId, reason, userId),
    onSuccess: () => {
      showToast('인증을 취소했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const askRevoke = (userId?: string) => {
    const reason = window.prompt(userId ? '이 팀원의 인증 취소 사유를 입력하세요.' : '프로젝트 성과 인증 전체를 취소합니다. 사유를 입력하세요.')
    if (reason && reason.trim().length >= 2) revoke.mutate({ reason: reason.trim(), userId })
  }

  if (query.isLoading) return <LoadingState />
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const data = query.data
  const current = data.verifications.find((v) => v.id === data.current) ?? null
  const history = data.verifications.filter((v) => v.id !== data.current)

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="text-emerald-600" size={20} /> 성과 인증
        </CardTitle>
        <CardDescription>
          등록 승인과 성과 인증은 별개입니다. 기관 담당자가 승인된 증빙을 근거로 프로젝트 성과와 참여자별 역할·기여를 인증하면 참여자 프로필에 “기관 공식 인증
          완료”로 표시됩니다.
        </CardDescription>
      </CardHeader>

      {current ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-800">
              <CheckCircle2 size={16} /> {organizationName} 공식 인증 완료 · {formatDate(current.verifiedAt)}
              {current.verifiedBy ? ` · ${current.verifiedBy.name}` : ''}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-body">{current.outcomeSummary}</p>
          </div>
          <ul className="space-y-2">
            {current.members.map((member) => (
              <li className="rounded-2xl border border-surface-border p-3" key={member.recordId}>
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar name={member.user.name} size="sm" src={member.user.avatarUrl} />
                  <span className="text-sm font-semibold text-ink-strong">{member.user.name}</span>
                  <Badge tone="blue">{member.role}</Badge>
                  {member.status === 'verified' ? <Badge tone="green">인증</Badge> : <Badge tone="gray">취소됨</Badge>}
                  <span className="text-xs text-ink-muted">승인 증빙 {member.evidenceCount}건 근거</span>
                  {data.canVerify && member.status === 'verified' ? (
                    <button className="ml-auto text-xs font-semibold text-red-600 hover:underline" onClick={() => askRevoke(member.user.id)} type="button">
                      인증 취소
                    </button>
                  ) : null}
                </div>
                {member.contribution ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink-body">{member.contribution}</p> : null}
                {member.revokeReason ? <p className="mt-1 text-xs text-red-600">취소 사유: {member.revokeReason}</p> : null}
              </li>
            ))}
          </ul>
          {data.canVerify ? (
            <div className="flex flex-wrap gap-2">
              {data.candidates.some((c) => !c.verified) ? (
                <Button className="min-h-9 px-4" onClick={() => setModal('members')} variant="secondary">
                  팀원 추가 인증
                </Button>
              ) : null}
              <Button className="min-h-9 px-4" onClick={() => askRevoke()} variant="danger">
                성과 인증 전체 취소
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="rounded-2xl bg-surface-muted/60 p-4 text-sm text-ink-body">
            아직 성과 인증 전입니다. 승인된 활동 증빙 {data.approvedEvidenceTotal}건.
            {data.approvedEvidenceTotal === 0 ? ' 증빙이 승인되어야 인증할 수 있습니다.' : ''}
          </p>
          {data.canVerify ? (
            <Button disabled={data.approvedEvidenceTotal === 0} onClick={() => setModal('project')}>
              <ShieldCheck className="mr-1" size={16} /> 성과 인증하기
            </Button>
          ) : null}
        </div>
      )}

      {history.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-muted">이전 인증 이력 {history.length}건</summary>
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li className="rounded-xl bg-surface-muted/50 p-3 text-sm text-ink-body" key={item.id}>
                {formatDate(item.verifiedAt)} 인증 → {formatDate(item.revokedAt)} 취소
                {item.revokedBy ? ` (${item.revokedBy.name})` : ''}
                {item.revokeReason ? ` · ${item.revokeReason}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {modal ? <VerifyModal data={data} mode={modal} onClose={() => setModal(null)} onSubmit={(payload) => verify.mutate(payload)} pending={verify.isPending} /> : null}
    </Card>
  )
}

export function ProjectInstitutionPanel({ projectId, programId, programTitle, organizationName }: Props) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<ProjectReviewKind | ''>('')
  const [body, setBody] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeReason, setRemoveReason] = useState('')

  const query = useQuery({
    queryKey: ['programs', programId, 'reviews', projectId],
    queryFn: () => getProjectReviews(token!, programId, projectId),
    enabled: Boolean(token),
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['programs', programId] })

  const post = useMutation({
    mutationFn: (selectedKind: ProjectReviewKind) =>
      createProjectReview(token!, programId, projectId, {
        kind: selectedKind,
        body: body.trim(),
        targetUserId: selectedKind === 'removal_request' && targetUserId ? targetUserId : undefined,
      }),
    onSuccess: () => {
      setBody('')
      setTargetUserId('')
      showToast('남겼습니다.')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const resolve = useMutation({
    mutationFn: (reviewId: string) => resolveProjectReview(token!, programId, projectId, reviewId),
    onSuccess: refresh,
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const removeProject = useMutation({
    mutationFn: () => removeProgramProject(token!, programId, projectId, removeReason.trim()),
    onSuccess: () => {
      showToast('프로그램에서 제거했습니다. 프로젝트는 참여자의 개인 프로젝트로 남습니다.', 'info')
      setRemoveOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const { reviews, members, tasks, permissions, origin } = query.data

  const kindOptions: ProjectReviewKind[] = [
    ...(permissions.canFeedback ? (['feedback', 'revision_request'] as const) : []),
    ...(permissions.canRespond ? (['response'] as const) : []),
    ...(permissions.canRequestRemoval ? (['removal_request'] as const) : []),
  ]
  const selectedKind = kind && kindOptions.includes(kind) ? kind : kindOptions[0]
  const missing = members.filter((m) => m.missingSubmission)

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">진행 현황</CardTitle>
          <CardDescription>
            {programTitle} · {origin === 'student' ? '참여자 주도 프로젝트 — 담당자는 내용 수정 대신 피드백·수정 요청으로 관여합니다.' : '기관 배정 프로젝트'}
          </CardDescription>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-muted/60 p-3">
            <p className="text-xs text-ink-muted">태스크</p>
            <p className="text-lg font-bold text-ink-strong">
              {tasks.done}/{tasks.total}
            </p>
            {tasks.overdue ? <p className="text-xs font-semibold text-red-600">기한 지남 {tasks.overdue}</p> : null}
          </div>
          <div className="rounded-2xl bg-surface-muted/60 p-3">
            <p className="text-xs text-ink-muted">미제출 팀원</p>
            <p className={`text-lg font-bold ${missing.length ? 'text-red-600' : 'text-ink-strong'}`}>{missing.length}</p>
            {missing.length ? <p className="truncate text-xs text-ink-muted">{missing.map((m) => m.name).join(', ')}</p> : null}
          </div>
          <div className="rounded-2xl bg-surface-muted/60 p-3">
            <p className="text-xs text-ink-muted">처리 대기</p>
            <p className="text-lg font-bold text-ink-strong">{reviews.filter((r) => r.status === 'open').length}</p>
          </div>
        </div>
        <ul className="mt-4 divide-y divide-surface-border rounded-2xl border border-surface-border">
          {members.map((member) => (
            <li className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm" key={member.userId}>
              <Avatar name={member.name} size="sm" src={member.avatarUrl} />
              <span className="font-semibold text-ink-strong">{member.name}</span>
              <span className="text-xs text-ink-muted">{member.teamRole === 'leader' ? '팀장' : member.role}</span>
              <span className="ml-auto text-xs text-ink-muted">
                증빙 제출 {member.evidence.submitted} · 승인 {member.evidence.approved} · 반려 {member.evidence.rejected}
                {member.lastEvidenceAt ? ` · 최근 ${formatDate(member.lastEvidenceAt)}` : ''}
              </span>
              {member.missingSubmission ? <Badge tone="red">미제출</Badge> : null}
            </li>
          ))}
        </ul>
      </Card>

      <VerificationSection organizationName={organizationName} programId={programId} projectId={projectId} />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="text-brand-600" size={20} /> 피드백 · 리뷰 이력
          </CardTitle>
          <CardDescription>담당자 피드백과 수정 요청, 팀 답변, 팀원 제외·프로젝트 제거 요청이 모두 기록됩니다.</CardDescription>
        </CardHeader>
        {reviews.length === 0 ? (
          <p className="mb-4 text-sm text-ink-muted">아직 남겨진 리뷰가 없습니다.</p>
        ) : (
          <ul className="mb-4 space-y-3">
            {reviews.map((review) => (
              <ReviewItem canResolve={permissions.canResolve} key={review.id} onResolve={() => resolve.mutate(review.id)} review={review} />
            ))}
          </ul>
        )}
        {selectedKind ? (
          <form
            className="space-y-3 border-t border-surface-border pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              post.mutate(selectedKind)
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="종류" onChange={(e) => setKind(e.target.value as ProjectReviewKind)} value={selectedKind}>
                {kindOptions.map((option) => (
                  <option key={option} value={option}>
                    {REVIEW_KIND_LABEL[option]}
                  </option>
                ))}
              </Select>
              {selectedKind === 'removal_request' ? (
                <Select label="대상" onChange={(e) => setTargetUserId(e.target.value)} value={targetUserId}>
                  <option value="">프로젝트 전체를 프로그램에서 제거 요청</option>
                  {members
                    .filter((m) => m.teamRole !== 'leader')
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} 제외 요청
                      </option>
                    ))}
                </Select>
              ) : null}
            </div>
            <Textarea label="내용" maxLength={4000} minLength={2} onChange={(e) => setBody(e.target.value)} required value={body} />
            <div className="flex justify-end">
              <Button disabled={post.isPending || body.trim().length < 2} type="submit">
                남기기
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      {permissions.canRemoveProject ? (
        <Card className="rounded-2xl border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-700">
              <AlertTriangle size={18} /> 프로그램에서 제거
            </CardTitle>
            <CardDescription>프로젝트를 삭제하지 않고 프로그램 연결만 해제합니다. 사유는 팀에 전달되고 감사 로그에 남습니다.</CardDescription>
          </CardHeader>
          <Button className="w-fit" onClick={() => setRemoveOpen(true)} variant="danger">
            제거
          </Button>
        </Card>
      ) : null}

      {removeOpen ? (
        <Modal onClose={() => setRemoveOpen(false)} open title="프로그램에서 제거">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              removeProject.mutate()
            }}
          >
            <Textarea label="제거 사유 (필수)" maxLength={1000} onChange={(e) => setRemoveReason(e.target.value)} required value={removeReason} />
            <div className="flex justify-end">
              <Button disabled={removeProject.isPending || removeReason.trim().length < 2} type="submit" variant="danger">
                제거
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
