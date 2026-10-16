import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { AdminNav } from '../../components/admin/AdminNav'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input, Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { TicketThread } from '../../components/support/TicketThread'
import { formatDateTime, TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_META } from '../../lib/commercial'
import {
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminGetAnnouncements,
  adminGetTickets,
  adminReplyTicket,
  adminUpdateTicket,
} from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Announcement } from '../../types/commercial'

const SEVERITY_LABEL: Record<Announcement['severity'], string> = { info: '안내', warning: '주의', critical: '긴급' }
const AUDIENCE_LABEL = { all: '전체 사용자', org_admins: '조직 관리자', organization: '특정 조직' } as const

function AnnouncementsCard() {
  const token = useAuthStore((state) => state.token)!
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState('info')
  const [audience, setAudience] = useState('all')
  const [organizationId, setOrganizationId] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const list = useQuery({ queryKey: ['admin', 'announcements'], queryFn: () => adminGetAnnouncements(token) })
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'announcements'] })
    void queryClient.invalidateQueries({ queryKey: ['announcements'] })
  }
  const create = useMutation({
    mutationFn: () =>
      adminCreateAnnouncement(token, {
        title,
        body,
        severity,
        audience,
        organizationId: audience === 'organization' ? organizationId : null,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      }),
    onSuccess: () => {
      showToast('공지를 게시했습니다.')
      setTitle('')
      setBody('')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteAnnouncement(token, id),
    onSuccess: invalidate,
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>공지</CardTitle>
        <CardDescription>점검·장애·정책 변경을 알립니다. 긴급 공지는 사용자가 닫을 수 없습니다.</CardDescription>
      </CardHeader>
      <form className="space-y-3" onSubmit={submit}>
        <Input label="제목" minLength={2} onChange={(e) => setTitle(e.target.value)} required value={title} />
        <Textarea label="내용" minLength={2} onChange={(e) => setBody(e.target.value)} required rows={3} value={body} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="중요도" onChange={(e) => setSeverity(e.target.value)} value={severity}>
            <option value="info">안내</option>
            <option value="warning">주의</option>
            <option value="critical">긴급</option>
          </Select>
          <Select label="대상" onChange={(e) => setAudience(e.target.value)} value={audience}>
            {Object.entries(AUDIENCE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="게시 종료일" onChange={(e) => setExpiresAt(e.target.value)} type="date" value={expiresAt} />
        </div>
        {audience === 'organization' ? <Input label="조직 ID" onChange={(e) => setOrganizationId(e.target.value)} required value={organizationId} /> : null}
        <div className="flex justify-end">
          <Button disabled={create.isPending} type="submit">
            게시
          </Button>
        </div>
      </form>
      <ul className="mt-5 divide-y divide-surface-border text-sm">
        {(list.data?.announcements ?? []).map((item) => {
          const expired = item.expiresAt && new Date(item.expiresAt) < new Date()
          return (
            <li className="flex items-start gap-3 py-2.5" key={item.id}>
              <Badge tone={item.severity === 'critical' ? 'red' : item.severity === 'warning' ? 'purple' : 'blue'}>{SEVERITY_LABEL[item.severity]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-strong">{item.title}</p>
                <p className="text-xs text-ink-muted">
                  {AUDIENCE_LABEL[item.audience]} · {formatDateTime(item.publishedAt)}
                  {item.expiresAt ? ` ~ ${formatDateTime(item.expiresAt)}` : ''}
                  {expired ? ' · 종료됨' : ''}
                </p>
              </div>
              <Button className="min-h-8 px-3" disabled={remove.isPending} onClick={() => window.confirm('공지를 삭제할까요?') && remove.mutate(item.id)} variant="ghost">
                삭제
              </Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function AdminSupportPage() {
  const token = useAuthStore((state) => state.token)!
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('active')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const tickets = useQuery({ queryKey: ['admin', 'support', status], queryFn: () => adminGetTickets(token, status) })
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'support'] })
  const reply = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => adminReplyTicket(token, id, body),
    onSuccess: invalidate,
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status?: string; priority?: string } }) => adminUpdateTicket(token, id, body),
    onSuccess: invalidate,
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const list = tickets.data?.tickets ?? []
  const selected = list.find((ticket) => ticket.id === selectedId) ?? null

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminNav description="기관·개인 문의에 답변하고, 공지를 게시합니다." title="지원·공지" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Card className="p-0">
            <div className="flex gap-1.5 border-b border-surface-border p-4">
              {[
                ['active', '처리 대기'],
                ['resolved', '해결'],
                ['closed', '종료'],
                ['all', '전체'],
              ].map(([value, label]) => (
                <button
                  className={status === value ? 'rounded-full bg-ink-strong px-3 py-1 text-xs font-semibold text-white' : 'rounded-full border border-surface-border px-3 py-1 text-xs font-semibold'}
                  key={value}
                  onClick={() => setStatus(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            {tickets.isLoading ? (
              <LoadingState />
            ) : list.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">문의가 없습니다.</p>
            ) : (
              <ul className="max-h-[70vh] divide-y divide-surface-border overflow-y-auto">
                {list.map((ticket) => (
                  <li key={ticket.id}>
                    <button className={`w-full px-4 py-3 text-left hover:bg-surface-muted ${ticket.id === selectedId ? 'bg-brand-50' : ''}`} onClick={() => setSelectedId(ticket.id)} type="button">
                      <div className="flex items-center gap-2">
                        <Badge tone={TICKET_STATUS_META[ticket.status].tone}>{TICKET_STATUS_META[ticket.status].label}</Badge>
                        {ticket.priority === 'urgent' || ticket.priority === 'high' ? <Badge tone="red">{TICKET_PRIORITY_LABEL[ticket.priority]}</Badge> : null}
                        <span className="truncate font-semibold text-ink-strong">{ticket.subject}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category} · {ticket.organization?.name ?? '개인'} · {ticket.requester?.name} · {formatDateTime(ticket.lastMessageAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {selected ? (
            <TicketThread
              actions={
                <>
                  {(['in_progress', 'resolved', 'closed'] as const).map((next) => (
                    <Button
                      className="min-h-8 px-3"
                      disabled={update.isPending || selected.status === next}
                      key={next}
                      onClick={() => update.mutate({ id: selected.id, body: { status: next } })}
                      variant="secondary"
                    >
                      {TICKET_STATUS_META[next].label}
                    </Button>
                  ))}
                </>
              }
              onReply={(body) => reply.mutateAsync({ id: selected.id, body })}
              replying={reply.isPending}
              staffView
              ticket={selected}
            />
          ) : (
            <Card className="flex items-center justify-center text-sm text-ink-muted">문의를 선택하세요.</Card>
          )}
        </div>
        <AnnouncementsCard />
      </div>
    </AppLayout>
  )
}
