import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Input, Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { TicketThread } from '../../components/support/TicketThread'
import { useMyOrganizations } from '../../hooks/useMyOrganizations'
import { formatDateTime, TICKET_CATEGORY_LABEL, TICKET_PRIORITY_LABEL, TICKET_STATUS_META } from '../../lib/commercial'
import { hasOrgRole } from '../../lib/organizations'
import { createTicket, getTickets, replyTicket } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'

function NewTicketForm({ onCreated, onCancel }: { onCreated: (ticketId: string) => void; onCancel: () => void }) {
  const token = useAuthStore((state) => state.token)
  const [searchParams] = useSearchParams()
  const { activeMemberships } = useMyOrganizations()
  const staffOrgs = activeMemberships.filter((membership) => hasOrgRole(membership.role, 'manager'))
  const [organizationId, setOrganizationId] = useState(() => searchParams.get('org') ?? '')
  const [category, setCategory] = useState(() => searchParams.get('new') ?? 'other')
  const [priority, setPriority] = useState('normal')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: () => createTicket(token!, { organizationId: organizationId || null, category, priority, subject, body }),
    onSuccess: ({ ticket }) => {
      showToast('문의를 등록했습니다. 운영팀이 확인 후 답변드립니다.')
      void queryClient.invalidateQueries({ queryKey: ['support'] })
      onCreated(ticket.id)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>새 문의</CardTitle>
        <CardDescription>계약·갱신, 오류, 운영 문의를 남겨 주세요. 비밀번호나 개인정보는 적지 마세요.</CardDescription>
      </CardHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="관련 조직" onChange={(e) => setOrganizationId(e.target.value)} value={organizationId}>
            <option value="">개인 문의</option>
            {staffOrgs.map((membership) => (
              <option key={membership.organization.id} value={membership.organization.id}>
                {membership.organization.name}
              </option>
            ))}
          </Select>
          <Select label="분류" onChange={(e) => setCategory(e.target.value)} value={category}>
            {Object.entries(TICKET_CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="긴급도" onChange={(e) => setPriority(e.target.value)} value={priority}>
            {Object.entries(TICKET_PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Input label="제목" maxLength={120} minLength={2} onChange={(e) => setSubject(e.target.value)} required value={subject} />
        <Textarea label="내용" maxLength={5000} minLength={5} onChange={(e) => setBody(e.target.value)} required rows={6} value={body} />
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="ghost">
            취소
          </Button>
          <Button disabled={create.isPending} type="submit">
            등록
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function SupportPage() {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('ticket')
  const composing = searchParams.has('new')
  const query = useQuery({ queryKey: ['support', 'tickets'], queryFn: () => getTickets(token!), enabled: Boolean(token) })
  const reply = useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) => replyTicket(token!, ticketId, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['support'] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const tickets = query.data?.tickets ?? []
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">고객 지원</h1>
            <p className="mt-2 text-sm text-ink-body">내 문의와, 내가 관리자인 조직의 문의를 함께 볼 수 있습니다.</p>
          </div>
          {!composing ? (
            <Button className="gap-1.5" onClick={() => setSearchParams({ new: 'other' })}>
              <Plus size={16} /> 새 문의
            </Button>
          ) : null}
        </div>

        {composing ? <NewTicketForm onCancel={() => setSearchParams({})} onCreated={(id) => setSearchParams({ ticket: id })} /> : null}

        {query.isLoading ? (
          <LoadingState />
        ) : tickets.length === 0 && !composing ? (
          <EmptyState description="궁금한 점이나 계약 관련 요청이 있으면 문의를 남겨 주세요." title="등록된 문의가 없습니다" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Card className="p-0">
              <ul className="divide-y divide-surface-border">
                {tickets.map((ticket) => {
                  const meta = TICKET_STATUS_META[ticket.status]
                  return (
                    <li key={ticket.id}>
                      <button
                        className={`w-full px-5 py-4 text-left hover:bg-surface-muted ${ticket.id === selectedId ? 'bg-brand-50' : ''}`}
                        onClick={() => setSearchParams({ ticket: ticket.id })}
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {ticket.priority === 'urgent' || ticket.priority === 'high' ? <Badge tone="red">{TICKET_PRIORITY_LABEL[ticket.priority]}</Badge> : null}
                          <span className="truncate font-semibold text-ink-strong">{ticket.subject}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          {TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category} · {ticket.organization?.name ?? '개인'} · {formatDateTime(ticket.lastMessageAt)}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Card>
            {selected ? (
              <TicketThread
                onReply={(body) => reply.mutateAsync({ ticketId: selected.id, body })}
                replying={reply.isPending}
                ticket={selected}
              />
            ) : (
              <Card className="flex items-center justify-center text-sm text-ink-muted">왼쪽에서 문의를 선택하세요.</Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
