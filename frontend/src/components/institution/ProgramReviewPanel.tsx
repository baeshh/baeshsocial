import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { getReviewQueue } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import type { Program } from '../../types/program'
import { LoadingState } from '../common/LoadingState'
import { EvidenceCard } from '../evidence/EvidenceCard'
import { EvidenceReviewActions } from '../evidence/EvidenceReviewActions'
import { EvidenceRevokeAction } from '../evidence/EvidenceRevokeAction'

type Filter = 'submitted' | 'approved' | 'rejected' | 'all'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'submitted', label: '검토 대기' },
  { id: 'approved', label: '승인' },
  { id: 'rejected', label: '반려' },
  { id: 'all', label: '전체' },
]

export function ProgramReviewPanel({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const me = useAuthStore((s) => s.user)
  const [filter, setFilter] = useState<Filter>('submitted')
  const [team, setTeam] = useState('')

  const queueQuery = useQuery({
    queryKey: ['evidence', 'program', program.id, filter],
    queryFn: () => getReviewQueue(token!, program.id, filter),
    enabled: Boolean(token),
  })

  const items = queueQuery.data?.evidence ?? []
  const teams = [...new Map(items.filter((e) => e.project).map((e) => [e.project!.id, e.project!])).values()]
  const visible = team ? items.filter((e) => e.project?.id === team) : items

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              filter === item.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-surface-border bg-white text-ink-body hover:border-brand-200',
            )}
            key={item.id}
            onClick={() => {
              setFilter(item.id)
              setTeam('')
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
        <select
          aria-label="팀 필터"
          className="ml-auto h-9 rounded-full border border-surface-border bg-white px-3 text-xs font-semibold"
          onChange={(e) => setTeam(e.target.value)}
          value={team}
        >
          <option value="">모든 팀</option>
          {teams.map((project) => (
            <option key={project.id} value={project.id}>
              {project.teamName ?? project.title}
            </option>
          ))}
        </select>
      </div>

      {program.status === 'archived' ? (
        <p className="rounded-2xl bg-surface-muted/60 px-4 py-3 text-sm text-ink-muted">보관된 프로그램은 검토할 수 없습니다.</p>
      ) : null}

      {queueQuery.isLoading ? (
        <LoadingState />
      ) : queueQuery.isError ? (
        <p className="text-sm text-red-700">{(queueQuery.error as Error).message}</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-muted">
          {filter === 'submitted' ? '검토할 증빙이 없습니다.' : '해당하는 증빙이 없습니다.'}
        </p>
      ) : (
        visible.map((evidence) => (
          <EvidenceCard
            actions={
              evidence.status === 'submitted' && program.status !== 'archived' ? (
                evidence.author?.id === me?.id ? (
                  <p className="text-xs text-ink-muted">본인이 작성한 증빙은 다른 담당자가 검토해야 합니다.</p>
                ) : (
                  <EvidenceReviewActions evidence={evidence} />
                )
              ) : evidence.status === 'approved' && program.status !== 'archived' ? (
                <EvidenceRevokeAction evidence={evidence} />
              ) : undefined
            }
            evidence={evidence}
            key={evidence.id}
            showProject
          />
        ))
      )}
    </div>
  )
}
