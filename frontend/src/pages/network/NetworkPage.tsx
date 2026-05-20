import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Globe, Plus, Sparkles, Upload } from 'lucide-react'
import { Avatar } from '../../components/common/Avatar'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { readMediaFile } from '../../lib/readMediaFile'
import { PostMediaGrid } from '../../components/posts/PostMediaGrid'
import { PostCard } from '../../components/posts/PostCard'
import { MobileFeedPostCard } from '../../components/network/MobileFeedPostCard'
import { PostComposerModal } from '../../components/network/PostComposerModal'
import { AppLayout } from '../../components/layout/AppLayout'
import { createPost, getPosts, getRecommendedPosts } from '../../services/postService'
import { getProjects } from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'

function extractHashtags(content: string) {
  return Array.from(content.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0])
}

export function NetworkPage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState('')
  const [linkedProjectId, setLinkedProjectId] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [composerOpen, setComposerOpen] = useState(false)

  const postsQuery = useQuery({
    queryKey: ['posts'],
    queryFn: () => getPosts(token ?? ''),
    enabled: Boolean(token),
  })
  const recommendedQuery = useQuery({
    queryKey: ['posts', 'recommended'],
    queryFn: () => getRecommendedPosts(token ?? '', 10),
    enabled: Boolean(token),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(token ?? ''),
    enabled: Boolean(token),
  })

  const invalidateFeed = () => {
    void queryClient.invalidateQueries({ queryKey: ['posts'] })
    void queryClient.invalidateQueries({ queryKey: ['posts', 'me'] })
    void queryClient.invalidateQueries({ queryKey: ['posts', 'by-user'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createPost(token ?? '', {
        content: content.trim(),
        linkedProjectId: linkedProjectId || null,
        visibility: visibility as 'public' | 'connections' | 'private',
        mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      }),
    onSuccess: () => {
      setContent('')
      setLinkedProjectId('')
      setVisibility('public')
      setMediaUrls([])
      invalidateFeed()
    },
  })

  const handlePickMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) {
      return
    }

    const next: string[] = [...mediaUrls]
    for (const file of Array.from(files)) {
      if (next.length >= 6) {
        break
      }
      try {
        const dataUrl = await readMediaFile(file, 'post')
        next.push(dataUrl)
      } catch {
        /* skip invalid */
      }
    }
    setMediaUrls(next)
    event.target.value = ''
  }

  const aiSuggestion = useMemo(() => {
    if (!content.trim()) {
      return '이번 주 프로젝트 진행 상황, 배운 점, 다음 목표를 함께 기록해보세요.'
    }

    const hashtags = extractHashtags(content)
    return hashtags.length > 0
      ? `${hashtags.join(', ')} 태그를 기준으로 관련 프로젝트와 기회를 함께 연결해보세요.`
      : '기술스택이나 역할을 해시태그로 추가하면 검색 가능성이 높아집니다.'
  }, [content])

  const projectCount = projectsQuery.data?.projects.length ?? 0

  const repostedSourceIds = useMemo(() => {
    const ids = new Set<string>()
    if (!user?.id) {
      return ids
    }
    for (const feedPost of postsQuery.data?.posts ?? []) {
      if (feedPost.authorId === user.id && feedPost.repostOfId) {
        ids.add(feedPost.repostOfId)
      }
    }
    return ids
  }, [postsQuery.data?.posts, user?.id])

  const handleComposerSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content.trim() && mediaUrls.length === 0) {
      return
    }
    createMutation.mutate()
  }

  return (
    <AppLayout>
      <div className="grid gap-6 xl:grid-cols-[260px_1fr_300px]">
        <aside className="hidden space-y-4 xl:block">
          <Card className="rounded-2xl border-surface-border p-5 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <Link className="inline-block" to="/profile">
                <Avatar name={user?.name ?? 'User'} size="lg" src={user?.avatarUrl} />
              </Link>
              <p className="mt-3 text-lg font-bold text-ink-strong">{user?.name}</p>
              <div className="mt-5 w-full border-t border-surface-border pt-4 text-center">
                <p className="text-base font-bold text-ink-strong">{projectCount}</p>
                <p className="text-xs font-medium text-ink-muted">내 프로젝트</p>
              </div>
            </div>
          </Card>

          <Card className="rounded-2xl border-surface-border p-2 shadow-sm">
            <nav className="space-y-1 p-1">
              <Link
                className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-semibold text-brand-700"
                to="/network"
              >
                <Globe size={18} />
                피드
              </Link>
              <Link
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-strong hover:bg-surface-muted"
                to="/projects"
              >
                <Briefcase size={18} />
                프로젝트
              </Link>
            </nav>
          </Card>
        </aside>

        <div className="min-w-0 space-y-3 md:space-y-4">
          <Card className="hidden rounded-2xl border-surface-border p-4 shadow-sm sm:p-5 md:block">
            <form className="space-y-4" onSubmit={handleComposerSubmit}>
              <div className="flex gap-3">
                <Link className="hidden shrink-0 sm:inline-block" to="/profile">
                  <Avatar name={user?.name ?? 'User'} src={user?.avatarUrl} />
                </Link>
                <div className="flex-1">
                  <Textarea
                    className="min-h-24 rounded-2xl border-surface-border bg-surface-muted/50"
                    label="게시글"
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="텍스트, 사진·동영상, 또는 프로젝트 연결로 기록해 보세요."
                    value={content}
                  />
                </div>
              </div>

              <input
                accept="image/*,video/*"
                className="hidden"
                multiple
                onChange={handlePickMedia}
                ref={mediaInputRef}
                type="file"
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="rounded-full"
                  onClick={() => mediaInputRef.current?.click()}
                  type="button"
                  variant="secondary"
                >
                  <Upload className="mr-1.5" size={18} />
                  업로드 ({mediaUrls.length}/6)
                </Button>
                {mediaUrls.length > 0 ? (
                  <Button
                    className="rounded-full text-xs"
                    onClick={() => setMediaUrls([])}
                    type="button"
                    variant="ghost"
                  >
                    첨부 비우기
                  </Button>
                ) : null}
              </div>

              {mediaUrls.length > 0 ? <PostMediaGrid urls={mediaUrls} variant="compact" /> : null}

              <div className="flex flex-col gap-3 border-t border-surface-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="hidden sm:grid sm:max-w-[280px] sm:gap-1">
                  <Select label="연결" onChange={(event) => setLinkedProjectId(event.target.value)} value={linkedProjectId}>
                    <option value="">프로젝트 연결</option>
                    {projectsQuery.data?.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button className="rounded-full px-6" disabled={createMutation.isPending} type="submit">
                  {createMutation.isPending ? '게시 중' : '게시하기'}
                </Button>
              </div>
              <div className="sm:hidden">
                <Select label="연결 프로젝트" onChange={(event) => setLinkedProjectId(event.target.value)} value={linkedProjectId}>
                  <option value="">연결하지 않음</option>
                  {projectsQuery.data?.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Select>
                <Select className="mt-2" label="공개 범위" onChange={(event) => setVisibility(event.target.value)} value={visibility}>
                  <option value="public">공개</option>
                  <option value="connections">팔로워(연결)</option>
                  <option value="private">비공개</option>
                </Select>
              </div>
              <div className="hidden sm:block">
                <Select label="공개 범위" onChange={(event) => setVisibility(event.target.value)} value={visibility}>
                  <option value="public">공개</option>
                  <option value="connections">팔로워(연결)</option>
                  <option value="private">비공개</option>
                </Select>
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-brand-50/80 p-3 text-sm text-brand-800 ring-1 ring-brand-100">
                <Sparkles className="mt-0.5 shrink-0" size={16} />
                <span>{aiSuggestion}</span>
              </div>
              {createMutation.error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {createMutation.error.message}
                </p>
              ) : null}
            </form>
          </Card>

          {postsQuery.isLoading ? <LoadingState /> : null}
          {postsQuery.data?.posts.length === 0 ? (
            <Card className="rounded-2xl border-surface-border p-8 shadow-sm">
              <EmptyState description="첫 게시글을 작성하면 이곳에 표시됩니다." title="게시글이 없습니다" />
            </Card>
          ) : null}
          <div className="space-y-3 md:hidden">
            {postsQuery.data?.posts.map((post) => (
              <MobileFeedPostCard key={post.id} post={post} />
            ))}
          </div>

          <div className="hidden space-y-4 md:block">
            {postsQuery.data?.posts.map((post) => (
              <PostCard
                key={post.id}
                onChanged={invalidateFeed}
                post={post}
                repostedSourceIds={repostedSourceIds}
                token={token ?? ''}
                userId={user?.id}
              />
            ))}
          </div>
        </div>

        <aside className="hidden space-y-6 xl:block">
          <Card className="rounded-2xl border-surface-border p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-strong">
              <Sparkles className="text-accent-600" size={18} />
              추천 게시물
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              좋아요·댓글·퍼가기 패턴과 팔로우, 해시태그, 연결 프로젝트를 기반으로 관련 글을 골라 보여 줍니다.
            </p>
            {recommendedQuery.isLoading ? (
              <p className="mt-4 text-sm text-ink-muted">불러오는 중…</p>
            ) : recommendedQuery.data?.posts.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">피드에서 반응을 남기면 추천이 채워집니다.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {recommendedQuery.data?.posts.map((post) => (
                  <li className="rounded-xl border border-surface-border bg-surface-muted/30 p-3 text-sm" key={post.id}>
                    <Link className="font-semibold text-brand-700 hover:underline" to={`/profile/${post.author.id}`}>
                      {post.author.name}
                    </Link>
                    <p className="mt-1 line-clamp-3 text-ink-body">{post.content}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      ♥ {post.likes.length} · 댓글 {post.comments.length}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-lg ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                <Briefcase className="text-violet-300" size={18} />
              </span>
              프로젝트
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/85">
              진행 중인 작업을 정리하고 피드와 연결해 보세요.
            </p>
            <Button className="mt-5 w-full rounded-full border-0 bg-white/15 text-white hover:bg-white/25" to="/projects" variant="secondary">
              프로젝트 보기
            </Button>
          </div>
          <p className="px-1 text-xs text-ink-muted">BAESH © {new Date().getFullYear()}</p>
        </aside>
      </div>

      <button
        aria-label="새 게시물 작성"
        className="fixed bottom-[5.5rem] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/40 transition hover:bg-brand-700 active:scale-95 md:hidden"
        onClick={() => setComposerOpen(true)}
        type="button"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <PostComposerModal
        avatarUrl={user?.avatarUrl ?? null}
        onClose={() => setComposerOpen(false)}
        onSuccess={invalidateFeed}
        open={composerOpen}
        token={token ?? ''}
        userName={user?.name ?? 'User'}
      />
    </AppLayout>
  )
}
