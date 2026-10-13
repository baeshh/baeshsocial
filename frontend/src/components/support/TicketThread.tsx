import { useState, type FormEvent, type ReactNode } from 'react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { cn } from '../../lib/cn'
import { formatDateTime, TICKET_CATEGORY_LABEL, TICKET_STATUS_META } from '../../lib/commercial'
import type { SupportTicket } from '../../types/commercial'

type Props = {
  ticket: SupportTicket
  onReply: (body: string) => Promise<unknown>
  replying: boolean
  staffView?: boolean
  actions?: ReactNode
}

export function TicketThread({ ticket, onReply, replying, staffView = false, actions }: Props) {
  const [body, setBody] = useState('')
  const meta = TICKET_STATUS_META[ticket.status]
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!body.trim()) return
    await onReply(body.trim())
    setBody('')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <CardTitle>{ticket.subject}</CardTitle>
        </div>
        <CardDescription>
          {TICKET_CATEGORY_LABEL[ticket.category] ?? ticket.category} · {ticket.organization?.name ?? '개인'}
          {ticket.requester ? ` · ${ticket.requester.name}${staffView && ticket.requester.email ? ` (${ticket.requester.email})` : ''}` : ''} · {formatDateTime(ticket.createdAt)}
        </CardDescription>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </CardHeader>
      <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
        {ticket.messages.map((message) => (
          <li
            className={cn('rounded-2xl px-4 py-3 text-sm', message.isStaff ? 'ml-6 bg-brand-50 text-brand-900' : 'mr-6 bg-surface-muted text-ink-body')}
            key={message.id}
          >
            <p className="mb-1 text-xs font-semibold text-ink-muted">
              {message.author?.name ?? '알 수 없음'} · {formatDateTime(message.createdAt)}
            </p>
            <p className="whitespace-pre-wrap leading-6">{message.body}</p>
          </li>
        ))}
      </ol>
      {ticket.status !== 'closed' ? (
        <form className="mt-4 space-y-2" onSubmit={(event) => void submit(event)}>
          <textarea
            className="h-24 w-full rounded-2xl border border-surface-border bg-white p-3 text-sm outline-none focus:border-brand-500"
            maxLength={5000}
            onChange={(event) => setBody(event.target.value)}
            placeholder={staffView ? '운영팀 답변을 입력하세요 (요청자에게 알림이 갑니다)' : '추가 내용을 입력하세요'}
            value={body}
          />
          <div className="flex justify-end">
            <Button disabled={replying || !body.trim()} type="submit">
              {staffView ? '답변 등록' : '보내기'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">종료된 문의입니다. 추가 문의는 새로 등록해 주세요.</p>
      )}
    </Card>
  )
}
