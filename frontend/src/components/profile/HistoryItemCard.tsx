import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatPeriod, HISTORY_KIND_META } from '../../lib/profileFormat'
import type { HistoryItem } from '../../types/profile'
import { Badge } from '../common/Badge'
import { VerificationBadge } from './VerificationBadge'

type HistoryItemCardProps = {
  item: HistoryItem
  onEdit?: (item: HistoryItem) => void
  onDelete?: (item: HistoryItem) => void
  compact?: boolean
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
