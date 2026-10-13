import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { HISTORY_FILTERS } from '../../lib/profileFormat'
import { deleteHistoryItem, getProfileHistoryPage, type EditableHistoryKind } from '../../services/profileService'
import type { HistoryCounts, HistoryFilter, HistoryItem } from '../../types/profile'
import { Button } from '../common/Button'
import { LoadingState } from '../common/LoadingState'
import { Pagination } from '../common/Pagination'
import { HistoryFormModal, type HistoryFormTarget } from './HistoryFormModal'
import { HistoryItemCard } from './HistoryItemCard'

const PAGE_SIZE = 10
const EDITABLE_KINDS = new Set<string>(['career', 'award', 'certificate'])

type ProfileExperienceTabProps = {
  token: string | null
  userId: string
  isOwnProfile: boolean
  counts: HistoryCounts | null
  filter: HistoryFilter
  onFilterChange: (filter: HistoryFilter) => void
  onChanged: () => void
}

function groupByYear(items: HistoryItem[]) {
  const groups: { year: string; items: HistoryItem[] }[] = []
  for (const item of items) {
    const year = item.date ? String(new Date(item.date).getFullYear()) : '날짜 미입력'
    const last = groups[groups.length - 1]
    if (last?.year === year) {
      last.items.push(item)
    } else {
      groups.push({ year, items: [item] })
    }
  }
  return groups
}

export function ProfileExperienceTab({
  token,
  userId,
  isOwnProfile,
  counts,
  filter,
  onFilterChange,
  onChanged,
}: ProfileExperienceTabProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [formTarget, setFormTarget] = useState<HistoryFormTarget>(null)

  const [pageState, setPageState] = useState({ filter, page: 1 })
  const requestedPage = pageState.filter === filter ? pageState.page : 1
  const [knownTotalPages, setKnownTotalPages] = useState<number | null>(null)
  const page = knownTotalPages ? Math.min(requestedPage, knownTotalPages) : requestedPage
  const listTopRef = useRef<HTMLDivElement>(null)

  const historyQuery = useQuery({
    queryKey: ['profiles', userId, 'history', filter, page],
    queryFn: () => getProfileHistoryPage(token, userId, { type: filter, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const totalPages = historyQuery.data?.totalPages ?? null
  if (totalPages !== null && !historyQuery.isPlaceholderData && totalPages !== knownTotalPages) {
    setKnownTotalPages(totalPages)
  }

  const goToPage = (next: number) => {
    setPageState({ filter, page: next })
    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const deleteMutation = useMutation({
    mutationFn: (item: HistoryItem) => deleteHistoryItem(token ?? '', item.kind as EditableHistoryKind, item.sourceId),
    onSuccess: onChanged,
  })

  const items = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data])
  const groups = useMemo(() => groupByYear(items), [items])
  const chips = HISTORY_FILTERS.filter((chip) => chip.id === 'all' || chip.id === 'verified' || (counts?.[chip.id] ?? 0) > 0 || chip.id === filter)

  const openEdit = (item: HistoryItem) => {
    if (!item.fields || !EDITABLE_KINDS.has(item.kind)) return
    setFormTarget({ kind: item.kind as EditableHistoryKind, id: item.sourceId, fields: item.fields })
    setFormOpen(true)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          경력·프로젝트 활동·프로그램·수상·자격을 시간순으로 보여 줍니다. 기관이 승인한 활동은 검증 주체와 승인일이 함께
          표시됩니다.
        </p>
        {isOwnProfile ? (
          <Button
            className="rounded-full"
            onClick={() => {
              setFormTarget(null)
              setFormOpen(true)
            }}
            variant="secondary"
          >
            <Plus className="mr-1" size={16} />
            이력 추가
          </Button>
        ) : null}
      </div>

      <div
        className="-mx-1 flex scroll-mt-24 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={listTopRef}
      >
        {chips.map((chip) => (
          <button
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              filter === chip.id
                ? chip.id === 'verified'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-surface-border bg-white text-ink-body hover:border-brand-200',
            )}
            key={chip.id}
            onClick={() => onFilterChange(chip.id)}
            type="button"
          >
            {chip.label}
            {counts ? <span className="ml-1 text-ink-muted">{counts[chip.id] ?? 0}</span> : null}
          </button>
        ))}
      </div>

      {historyQuery.isLoading ? <LoadingState /> : null}
      {historyQuery.error ? <p className="text-sm text-red-600">{historyQuery.error.message}</p> : null}
      {deleteMutation.error ? <p className="text-sm text-red-600">{deleteMutation.error.message}</p> : null}

      {!historyQuery.isLoading && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-10 text-center text-sm text-ink-muted">
          {filter === 'verified'
            ? '아직 검증된 성과가 없습니다. 기관 프로그램에서 활동 증빙이 승인되면 이곳에 표시됩니다.'
            : isOwnProfile
              ? '등록된 이력이 없습니다. 이력을 추가하거나 프로그램에 참여해 기록을 남겨 보세요.'
              : '등록된 이력이 없습니다.'}
          {isOwnProfile && filter !== 'verified' ? (
            <div className="mt-3">
              <Link className="font-semibold text-brand-600 hover:underline" to="/opportunities">
                Jobs에서 프로그램 찾기 →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <ol className={cn('space-y-6 transition-opacity', historyQuery.isPlaceholderData && 'opacity-60')}>
        {groups.map((group) => (
          <li key={group.year}>
            <h3 className="mb-3 flex items-center gap-3 text-sm font-bold text-ink-strong">
              {group.year}
              <span className="h-px flex-1 bg-surface-border" />
            </h3>
            <div className="space-y-3 border-l-2 border-surface-border pl-4 sm:pl-5">
              {group.items.map((item) => (
                <HistoryItemCard
                  item={item}
                  key={item.id}
                  onDelete={
                    isOwnProfile
                      ? (target) => {
                          if (window.confirm(`'${target.title}' 이력을 삭제할까요?`)) {
                            deleteMutation.mutate(target)
                          }
                        }
                      : undefined
                  }
                  onEdit={isOwnProfile ? openEdit : undefined}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>

      {historyQuery.data && historyQuery.data.totalPages > 1 ? (
        <div className="space-y-2 pt-1">
          <Pagination
            disabled={historyQuery.isPlaceholderData}
            onPageChange={goToPage}
            page={historyQuery.data.page}
            totalPages={historyQuery.data.totalPages}
          />
          <p className="text-center text-xs text-ink-muted">
            {(historyQuery.data.page - 1) * PAGE_SIZE + 1}–{Math.min(historyQuery.data.page * PAGE_SIZE, historyQuery.data.total)} /{' '}
            {historyQuery.data.total}건
          </p>
        </div>
      ) : null}

      <HistoryFormModal
        onClose={() => setFormOpen(false)}
        onSaved={onChanged}
        open={formOpen}
        target={formTarget}
        token={token ?? ''}
      />
    </div>
  )
}
