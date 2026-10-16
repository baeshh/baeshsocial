import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getPublicPostsByUser } from '../../services/postService'
import { getProfileProjects } from '../../services/profileService'
import type { ProfileOverview } from '../../types/profile'
import { LoadMore } from '../common/LoadMore'
import { EmbeddedPostPreview } from '../posts/EmbeddedPostPreview'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import { HistoryItemCard } from './HistoryItemCard'
import { ProfileHeader } from './ProfileHeader'
import { ProfileLockedNotice } from './ProfileOverviewTab'
import { ProfileProjectCard } from './ProfileProjectCard'

type PublicProfileViewProps = {
  data: ProfileOverview
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink-strong">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function PublicProfileView({ data }: PublicProfileViewProps) {
  const userId = data.user.id
  const featuredIds = new Set(data.featuredProjects.map((project) => project.id))

  const projectsQuery = useInfiniteQuery({
    queryKey: ['profiles', 'public', userId, 'projects'],
    queryFn: ({ pageParam }) => getProfileProjects(null, userId, { cursor: pageParam, limit: 10 }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: data.canViewDetails,
  })
  const postsQuery = useInfiniteQuery({
    queryKey: ['posts', 'public', 'by-user', userId],
    queryFn: ({ pageParam }) => getPublicPostsByUser(userId, { cursor: pageParam, limit: 10 }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: data.canViewDetails,
  })

  const otherProjects = (projectsQuery.data?.pages.flatMap((page) => page.projects) ?? []).filter(
    (project) => !featuredIds.has(project.id),
  )
  const posts = postsQuery.data?.pages.flatMap((page) => page.posts) ?? []

  return (
    <div className="space-y-6">
      <ProfileHeader avatarUrl={data.user.avatarUrl} coverUrl={data.user.coverUrl} data={data} showShare={false} />

      {!data.canViewDetails ? (
        <ProfileLockedNotice />
      ) : (
        <>
          {data.profile.bio ? (
            <Section title="소개">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{data.profile.bio}</p>
            </Section>
          ) : null}

          {data.featuredProjects.length > 0 ? (
            <Section title={data.featuredMode === 'pinned' ? '대표 프로젝트' : '최근 프로젝트'}>
              <div className="grid gap-4">
                {data.featuredProjects.map((project) => (
                  <ProfileProjectCard key={project.id} linkToProject={false} project={project} variant="featured" />
                ))}
              </div>
            </Section>
          ) : null}

          {data.verifiedHighlights.length > 0 ? (
            <Section title={`검증된 성과 ${data.stats.verifiedCount}`}>
              <div className="space-y-3">
                {data.verifiedHighlights.map((item) => (
                  <HistoryItemCard item={item} key={item.id} />
                ))}
              </div>
            </Section>
          ) : null}

          {otherProjects.length > 0 ? (
            <Section title="프로젝트">
              <div className="grid gap-3">
                {otherProjects.map((project) => (
                  <ProfileProjectCard key={project.id} linkToProject={false} project={project} />
                ))}
              </div>
              <LoadMore
                auto={false}
                hasNextPage={Boolean(projectsQuery.hasNextPage)}
                isFetchingNextPage={projectsQuery.isFetchingNextPage}
                label="프로젝트 더 보기"
                onLoadMore={() => void projectsQuery.fetchNextPage()}
              />
            </Section>
          ) : null}

          {posts.length > 0 ? (
            <Section title="공개 게시물">
              <div className="space-y-4">
                {posts.map((post) => (
                  <article className="rounded-xl border border-surface-border p-4" key={post.id}>
                    {post.repostOf ? (
                      <div className="mb-3">
                        <EmbeddedPostPreview post={post.repostOf} profileLinks={false} />
                      </div>
                    ) : null}
                    {post.content.trim() ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
                    ) : null}
                    <PostMediaGrid urls={post.mediaUrls ?? []} />
                    <Link
                      className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700"
                      to={`/p/${post.id}`}
                    >
                      게시물 보기 →
                    </Link>
                  </article>
                ))}
              </div>
              <LoadMore
                hasNextPage={Boolean(postsQuery.hasNextPage)}
                isFetchingNextPage={postsQuery.isFetchingNextPage}
                label="게시물 더 보기"
                onLoadMore={() => void postsQuery.fetchNextPage()}
              />
            </Section>
          ) : null}
        </>
      )}
    </div>
  )
}
