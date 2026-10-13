import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { getProfileProjects, setFeaturedProjects } from '../../services/profileService'
import type { ProfileProjectFilter } from '../../types/profile'
import { Button } from '../common/Button'
import { LoadMore } from '../common/LoadMore'
import { LoadingState } from '../common/LoadingState'
import { ProfileProjectCard } from './ProfileProjectCard'

const PAGE_SIZE = 10
export const MAX_FEATURED_PROJECTS = 3

const FILTERS: { id: ProfileProjectFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'owned', label: '직접 만든' },
  { id: 'joined', label: '팀원으로 참여' },
  { id: 'verified', label: '기관 검증' },
]

type ProfileProjectsTabProps = {
  token: string | null
  userId: string
  isOwnProfile: boolean
  featuredProjectIds: string[]
  onChanged: () => void
}

export function ProfileProjectsTab({ token, userId, isOwnProfile, featuredProjectIds, onChanged }: ProfileProjectsTabProps) {
  const [filter, setFilter] = useState<ProfileProjectFilter>('all')

  const projectsQuery = useInfiniteQuery({
    queryKey: ['profiles', userId, 'projects', filter],
    queryFn: ({ pageParam }) => getProfileProjects(token, userId, { filter, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const pinMutation = useMutation({
    mutationFn: (projectIds: string[]) => setFeaturedProjects(token ?? '', projectIds),
    onSuccess: onChanged,
  })

  const projects = useMemo(() => projectsQuery.data?.pages.flatMap((page) => page.projects) ?? [], [projectsQuery.data])

  const togglePin = (projectId: string) => {
    const pinned = featuredProjectIds.includes(projectId)
    pinMutation.mutate(pinned ? featuredProjectIds.filter((id) => id !== projectId) : [...featuredProjectIds, projectId])
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((chip) => (
            <button
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                filter === chip.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-surface-border bg-white text-ink-body hover:border-brand-200',
              )}
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>
        {isOwnProfile ? (
          <p className="text-xs text-ink-muted">
            대표 프로젝트 {featuredProjectIds.length}/{MAX_FEATURED_PROJECTS} · 고정한 순서대로 개요에 표시됩니다.
          </p>
        ) : null}
      </div>

      {pinMutation.error ? <p className="text-sm text-red-600">{pinMutation.error.message}</p> : null}
      {projectsQuery.isLoading ? <LoadingState /> : null}
      {projectsQuery.error ? <p className="text-sm text-red-600">{projectsQuery.error.message}</p> : null}

      {!projectsQuery.isLoading && projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-10 text-center text-sm text-ink-muted">
          {filter === 'all'
            ? isOwnProfile
              ? 'Projects에서 프로젝트를 만들거나 팀에 참여하면 이곳에 표시됩니다.'
              : '공개된 프로젝트가 없습니다.'
            : '조건에 맞는 프로젝트가 없습니다.'}
          {isOwnProfile && filter === 'all' ? (
            <div className="mt-4">
              <Button to="/projects" variant="secondary">
                프로젝트 만들기
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => {
          const pinned = featuredProjectIds.includes(project.id)
          return (
            <ProfileProjectCard
              key={project.id}
              pin={
                isOwnProfile
                  ? {
                      pinned,
                      disabled: pinMutation.isPending || (!pinned && featuredProjectIds.length >= MAX_FEATURED_PROJECTS),
                      onToggle: () => togglePin(project.id),
                    }
                  : undefined
              }
              project={project}
            />
          )
        })}
      </div>

      <LoadMore
        hasNextPage={Boolean(projectsQuery.hasNextPage)}
        isFetchingNextPage={projectsQuery.isFetchingNextPage}
        label="프로젝트 더 보기"
        onLoadMore={() => void projectsQuery.fetchNextPage()}
      />
    </div>
  )
}
