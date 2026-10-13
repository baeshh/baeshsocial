import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, RotateCw, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { INVITE_CSV_TEMPLATE, INVITE_STATUS_META, parseInviteCsv } from '../../lib/commercial'
import { formatDate } from '../../lib/programs'
import { createInvites, getInvites, resendInvite, revokeInvite } from '../../services/commercialService'
import { getOrganizationPrograms } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { BulkInviteResult, InviteRole, InviteRowInput } from '../../types/commercial'

const RESULT_LABEL: Record<string, { label: string; tone: 'green' | 'blue' | 'gray' | 'red' }> = {
  invited: { label: '초대함', tone: 'green' },
  reinvited: { label: '재초대', tone: 'blue' },
  already_member: { label: '이미 구성원', tone: 'gray' },
  suspended: { label: '정지된 구성원', tone: 'red' },
  invalid: { label: '오류', tone: 'red' },
}

const ROLE_LABEL: Record<InviteRole, string> = { admin: '관리자', manager: '담당자', member: '학생·참여자' }

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => showToast('링크를 복사했습니다.'),
    () => showToast('복사하지 못했습니다.', 'error'),
  )
}

export function OrgInvitesPanel({ orgId }: { orgId: string }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [programId, setProgramId] = useState('')
  const [role, setRole] = useState<InviteRole>('member')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [result, setResult] = useState<BulkInviteResult | null>(null)

  const programsQuery = useQuery({
    queryKey: ['programs', 'org', orgId],
    queryFn: () => getOrganizationPrograms(token!, orgId),
    enabled: Boolean(token),
  })
  const invitesQuery = useQuery({
    queryKey: ['organizations', orgId, 'invites', statusFilter],
    queryFn: () => getInvites(token!, orgId, { status: statusFilter }),
    enabled: Boolean(token),
  })

  const parsed = text.trim() ? parseInviteCsv(text) : { rows: [] as InviteRowInput[], errors: [] as string[] }
  const staffPrograms = (programsQuery.data?.programs ?? []).filter((program) => program.myAccess.isStaff && program.status !== 'archived')
  const canInviteStaff = invitesQuery.data?.canInviteStaff ?? false

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['organizations', orgId] })
    void queryClient.invalidateQueries({ queryKey: ['programs'] })
  }

  const send = useMutation({
    mutationFn: () => createInvites(token!, orgId, { programId: programId || null, role, rows: parsed.rows }),
    onSuccess: (data) => {
      setResult(data)
      setText('')
      const ok = (data.summary.invited ?? 0) + (data.summary.reinvited ?? 0)
      showToast(`${ok}명에게 초대를 보냈습니다.`)
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const resend = useMutation({
    mutationFn: (inviteId: string) => resendInvite(token!, orgId, inviteId),
    onSuccess: (data) => {
      showToast(data.delivery === 'sent' ? '초대 메일을 다시 보냈습니다.' : '새 링크를 발급했습니다. 링크를 직접 전달해 주세요.')
      copy(data.inviteUrl)
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const revoke = useMutation({
    mutationFn: (inviteId: string) => revokeInvite(token!, orgId, inviteId),
    onSuccess: () => {
      showToast('초대를 취소했습니다.', 'info')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 1024 * 1024) {
      showToast('CSV는 1MB 이하만 불러올 수 있습니다.', 'error')
      return
    }
    setText(await file.text())
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + INVITE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'baesh-invite-template.csv'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const counts = invitesQuery.data?.counts ?? {}

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>일괄 초대</CardTitle>
          <CardDescription>
            CSV(이메일, 이름, 학번, 학과, 역할)를 불러오거나 붙여 넣으세요. 초대 링크는 해당 이메일 계정으로만 수락할 수 있고, 프로그램을 고르면 수락과 동시에 참여자로 등록됩니다.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            aria-label="프로그램"
            className="h-11 rounded-2xl border border-surface-border bg-white px-3 text-sm"
            onChange={(event) => setProgramId(event.target.value)}
            value={programId}
          >
            {canInviteStaff ? <option value="">조직 전체 (프로그램 없이)</option> : <option value="">프로그램을 선택하세요</option>}
            {staffPrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
                {program.term ? ` · ${program.term}` : ''}
              </option>
            ))}
          </select>
          <select
            aria-label="기본 역할"
            className="h-11 rounded-2xl border border-surface-border bg-white px-3 text-sm"
            onChange={(event) => setRole(event.target.value as InviteRole)}
            value={role}
          >
            <option value="member">기본 역할: 학생·참여자</option>
            <option value="manager">기본 역할: 담당자</option>
            {canInviteStaff ? <option value="admin">기본 역할: 관리자</option> : null}
          </select>
          <div className="flex gap-2">
            <input accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(event) => void onFile(event.target.files?.[0])} ref={fileRef} type="file" />
            <Button className="gap-1.5" onClick={() => fileRef.current?.click()} variant="secondary">
              <Upload size={16} /> CSV 불러오기
            </Button>
            <Button className="gap-1.5" onClick={downloadTemplate} variant="ghost">
              <Download size={16} /> 양식
            </Button>
          </div>
        </div>
        <textarea
          className="mt-3 h-36 w-full rounded-2xl border border-surface-border bg-white p-3 font-mono text-xs text-ink-strong outline-none focus:border-brand-500"
          onChange={(event) => setText(event.target.value)}
          placeholder={'이메일,이름,학번,학과\nstudent01@univ.ac.kr,홍길동,20260001,컴퓨터공학과'}
          value={text}
        />
        {parsed.errors.length > 0 ? <p className="mt-2 text-sm text-red-700">{parsed.errors.slice(0, 3).join(' · ')}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">{parsed.rows.length > 0 ? `${parsed.rows.length}명 인식됨 (최대 500명)` : '구성원 한도를 넘는 초대는 거부됩니다.'}</p>
          <Button
            disabled={send.isPending || parsed.rows.length === 0 || parsed.errors.length > 0 || (!programId && !canInviteStaff)}
            onClick={() => send.mutate()}
          >
            {send.isPending ? '보내는 중…' : `${parsed.rows.length}명 초대`}
          </Button>
        </div>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>초대 결과</CardTitle>
              <button aria-label="결과 닫기" className="text-ink-muted hover:text-ink-strong" onClick={() => setResult(null)} type="button">
                <X size={18} />
              </button>
            </div>
            <CardDescription>
              {Object.entries(result.summary)
                .map(([status, count]) => `${RESULT_LABEL[status]?.label ?? status} ${count}`)
                .join(' · ')}{' '}
              · 링크 만료 {formatDate(result.expiresAt)}. 메일이 발송되지 않은 경우(개발 환경) 링크를 복사해 전달하세요.
            </CardDescription>
          </CardHeader>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-surface-border">
                {result.results.map((row, index) => (
                  <tr key={`${row.email}-${index}`}>
                    <td className="py-2 pr-3 text-ink-strong">{row.email || '(빈 이메일)'}</td>
                    <td className="pr-3">
                      <Badge tone={RESULT_LABEL[row.status]?.tone ?? 'gray'}>{RESULT_LABEL[row.status]?.label ?? row.status}</Badge>
                    </td>
                    <td className="pr-3 text-xs text-ink-muted">
                      {row.reason ?? (row.existingAccount ? '기존 회원' : row.status === 'invited' ? '신규 가입 필요' : '')}
                      {row.delivery === 'failed' ? ' · 메일 발송 실패' : ''}
                    </td>
                    <td className="text-right">
                      {row.inviteUrl ? (
                        <button className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700" onClick={() => copy(row.inviteUrl!)} type="button">
                          <Copy size={13} /> 링크
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>초대 현황</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {(['pending', 'accepted', 'expired', 'revoked', 'all'] as const).map((status) => (
                <button
                  className={
                    statusFilter === status
                      ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white'
                      : 'rounded-full border border-surface-border px-3 py-1 text-xs font-semibold text-ink-body hover:bg-surface-muted'
                  }
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status === 'all' ? '전체' : INVITE_STATUS_META[status].label}
                  {status !== 'all' && counts[status] ? ` ${counts[status]}` : ''}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        {invitesQuery.isLoading ? (
          <LoadingState />
        ) : invitesQuery.isError ? (
          <p className="text-sm text-red-700">{(invitesQuery.error as Error).message}</p>
        ) : invitesQuery.data!.invites.length === 0 ? (
          <p className="text-sm text-ink-muted">해당 상태의 초대가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2">이메일</th>
                  <th>이름·학번</th>
                  <th>역할</th>
                  <th>프로그램</th>
                  <th>상태</th>
                  <th>만료</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {invitesQuery.data!.invites.map((invite) => {
                  const meta = INVITE_STATUS_META[invite.status]
                  const open = invite.status === 'pending' || invite.status === 'expired'
                  return (
                    <tr key={invite.id}>
                      <td className="py-2.5 pr-2 font-medium text-ink-strong">{invite.email}</td>
                      <td className="pr-2 text-ink-body">
                        {invite.name ?? '—'}
                        {invite.studentNo ? <span className="text-xs text-ink-muted"> · {invite.studentNo}</span> : null}
                      </td>
                      <td className="pr-2">{ROLE_LABEL[invite.role]}</td>
                      <td className="pr-2 text-ink-body">{invite.program?.title ?? '조직 전체'}</td>
                      <td className="pr-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="pr-2 text-xs text-ink-muted">{invite.status === 'accepted' ? formatDate(invite.acceptedAt) : formatDate(invite.expiresAt)}</td>
                      <td className="whitespace-nowrap text-right">
                        {open ? (
                          <>
                            <button
                              aria-label="재발송"
                              className="mr-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 disabled:opacity-50"
                              disabled={resend.isPending}
                              onClick={() => resend.mutate(invite.id)}
                              type="button"
                            >
                              <RotateCw size={13} /> 재발송
                            </button>
                            <button
                              className="text-xs font-semibold text-red-700 disabled:opacity-50"
                              disabled={revoke.isPending}
                              onClick={() => {
                                if (window.confirm(`${invite.email} 초대를 취소할까요?`)) revoke.mutate(invite.id)
                              }}
                              type="button"
                            >
                              취소
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
