import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatPeriod, HISTORY_KIND_META } from '../../lib/profileFormat'
import { DISCLOSURE_META } from '../../lib/programs'
import { updateRecordDisclosure } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { HistoryItem, HistoryRecordControl } from '../../types/profile'
import type { RecordDisclosure } from '../../types/program'
import { Badge } from '../common/Badge'
import { VerificationBadge } from './VerificationBadge'

type HistoryItemCardProps = {
  item: HistoryItem
  onEdit?: (item: HistoryItem) => void
  onDelete?: (item: HistoryItem) => void
  compact?: boolean
}

const DISCLOSURE_ORDER: RecordDisclosure[] = ['hidden', 'summary', 'full']

/** Owner-only: how much of this verified record others see. The verified content itself never changes. */
function RecordDisclosureControl({ record }: { record: HistoryRecordControl }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (disclosure: RecordDisclosure) => updateRecordDisclosure(token!, record.id, disclosure),
    onSuccess: () => {
      showToast('공개 범위를 변경했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const capped = record.effective !== record.disclosure
  return (
    <label className="flex flex-col items-end gap-0.5 text-xs text-ink-muted">
      <span className="flex items-center gap-1">
        공개
        <select
          aria-label="인증 기록 공개 범위"
          className="rounded-full border border-surface-border bg-white px-2 py-0.5 text-xs font-semibold text-ink-strong"
          disabled={!token || change.isPending}
          onChange={(event) => change.mutate(event.target.value as RecordDisclosure)}
          title={DISCLOSURE_META[record.disclosure].description}
          value={record.disclosure}
        >
          {DISCLOSURE_ORDER.map((key) => (
            <option key={key} value={key}>
              {DISCLOSURE_META[key].label}
            </option>
          ))}
        </select>
      </span>
      {capped ? <span className="text-[11px]">기관 상한으로 {DISCLOSURE_META[record.effective].label} 적용</span> : null}
    </label>
  )
}

function statusLabel(item: HistoryItem) {
  if (item.kind === 'program') return item.status === 'COMPLETED' ? '수료' : '참여 중'
  if (item.kind === 'project' && item.status === 'PENDING') return '검증 대기'
  return null
}

export function HistoryItemCard({ item, onEdit, onDelete, compact = false }: HistoryItemCardProps) {
  const meta = HISTORY_KIND_META[item.kind]
  const status = statusLabel(item)
  const institution = item.verification?.kind === 'institution'

  return (
    <article
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm',
        institution ? 'border-emerald-200 bg-emerald-50/30' : 'border-surface-border',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge className="px-2 py-0.5" tone={meta.tone}>
              {meta.label}
            </Badge>
            {status ? (
              <Badge className="px-2 py-0.5" tone={status === '검증 대기' ? 'gray' : 'green'}>
                {status}
              </Badge>
            ) : null}
            <span className="text-xs font-semibold text-brand-600">
              {formatPeriod(item.date, item.endDate, item.ongoing, item.kind)}
            </span>
          </div>
          <h4 className="font-bold leading-snug text-ink-strong">{item.title}</h4>
          {item.subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{item.subtitle}</p> : null}
          {!compact && item.description ? (
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{item.description}</p>
          ) : null}
          {!compact && (item.link || item.project?.accessible) ? (
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
              {item.project?.accessible ? (
                <Link className="text-brand-600 hover:underline" to={`/projects/${item.project.id}`}>
                  프로젝트 보기 →
                </Link>
              ) : null}
              {item.link ? (
                <a
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  href={item.link}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  인증 링크 <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.verification ? <VerificationBadge className="items-end text-right" detailed={!compact} verification={item.verification} /> : null}
          {!compact && item.record ? <RecordDisclosureControl record={item.record} /> : null}
          {item.editable && (onEdit || onDelete) ? (
            <div className="flex gap-1">
              {onEdit ? (
                <button
                  aria-label="수정"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong"
                  onClick={() => onEdit(item)}
                  title="수정"
                  type="button"
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              {onDelete ? (
                <button
                  aria-label="삭제"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => onDelete(item)}
                  title="삭제"
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
