import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import {
  EVIDENCE_ACTION_LABEL,
  EVIDENCE_CATEGORY_LABEL,
  EVIDENCE_STATUS_META,
  formatDate,
} from '../../lib/programs'
import type { Evidence, EvidenceFile } from '../../types/program'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import { EvidenceFileList } from './EvidenceFileList'

type Props = {
  evidence: Evidence
  showProject?: boolean
  actions?: ReactNode
  onRemoveFile?: (file: EvidenceFile) => void
  removingFile?: boolean
}

export function EvidenceCard({ evidence, showProject, actions, onRemoveFile, removingFile }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const status = EVIDENCE_STATUS_META[evidence.status]

  return (
    <article className="rounded-2xl border border-surface-border bg-white p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink-strong">{evidence.title}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge>{EVIDENCE_CATEGORY_LABEL[evidence.category]}</Badge>
            {evidence.verifiedRecordId ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <ShieldCheck size={14} /> 검증 기록 발급
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
            {showProject && evidence.project ? (
              <span className="font-semibold text-ink-body">
                {evidence.project.teamName ?? evidence.project.title}
              </span>
            ) : null}
            <span>활동일 {formatDate(evidence.activityDate)}</span>
            {evidence.submittedAt ? <span>· 제출 {formatDate(evidence.submittedAt)}</span> : null}
          </p>
        </div>
        {evidence.author ? (
          <div className="flex items-center gap-2 text-sm">
            <Avatar name={evidence.author.name} size="sm" src={evidence.author.avatarUrl} />
            <span className="font-semibold text-ink-strong">{evidence.author.name}</span>
          </div>
        ) : null}
      </div>

      {evidence.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-body">{evidence.description}</p>
      ) : null}

      {evidence.status === 'rejected' && evidence.reviewNote ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">반려 사유 · {evidence.reviewedBy?.name}</p>
          <p className="mt-1 whitespace-pre-wrap">{evidence.reviewNote}</p>
        </div>
      ) : null}
      {evidence.status === 'approved' && evidence.reviewNote ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">검토 의견 · {evidence.reviewedBy?.name}</p>
          <p className="mt-1 whitespace-pre-wrap">{evidence.reviewNote}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <EvidenceFileList files={evidence.files} onRemove={onRemoveFile} removing={removingFile} />
      </div>

      {evidence.history.length > 0 ? (
        <div className="mt-4">
          <button
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink-strong"
            onClick={() => setHistoryOpen((open) => !open)}
            type="button"
          >
            검토 이력 {evidence.history.length}건
            <ChevronDown className={cn('transition', historyOpen && 'rotate-180')} size={14} />
          </button>
          {historyOpen ? (
            <ol className="mt-2 space-y-1.5 border-l-2 border-surface-border pl-4 text-xs">
              {evidence.history.map((entry) => (
                <li key={entry.id}>
                  <span className="font-semibold text-ink-strong">{EVIDENCE_ACTION_LABEL[entry.action]}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · {entry.actor?.name ?? '알 수 없음'} · {new Date(entry.createdAt).toLocaleString('ko-KR')}
                  </span>
                  {entry.note ? <p className="mt-0.5 text-ink-body">{entry.note}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {actions ? <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">{actions}</div> : null}
    </article>
  )
}
