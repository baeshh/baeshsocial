import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase,
  Globe,
  Upload,
  MessageSquare,
  Repeat2,
  Sparkles,
  ThumbsUp,
} from 'lucide-react'
import { Avatar } from '../../components/common/Avatar'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Select, Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { cn } from '../../lib/cn'
import { readMediaFile } from '../../lib/readMediaFile'
import { PostMediaGrid } from '../../components/posts/PostMediaGrid'
import { AppLayout } from '../../components/layout/AppLayout'
import {
  addComment,
  createPost,
  deletePost,
  getPosts,
  getRecommendedPosts,
  likePost,
  unlikePost,
  updatePost,
} from '../../services/postService'
import { getProjects } from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'
import type { Post, PostCore } from '../../types/post'

function extractHashtags(content: string) {
  return Array.from(content.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0])
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value))
}

function EmbeddedPostCore({ post, label }: { post: PostCore; label?: string }) {
  const hashtags = extractHashtags(post.content)

  return (
    <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-4">
      {label ? <p className="text-xs font-semibold text-ink-muted">{label}</p> : null}
      <div className="mt-2 flex items-center gap-2">
        <Link className="shrink-0 rounded-full ring-2 ring-white/80" to={`/profile/${post.author.id}`}>
          <Avatar name={post.author.name} size="sm" src={post.author.avatarUrl} />
        </Link>
        <div>
          <Link className="font-bold text-ink-strong hover:text-brand-600" to={`/profile/${post.author.id}`}>
            {post.author.name}
          </Link>
          <p className="text-xs text-ink-muted">{formatDate(post.createdAt)}</p>
        </div>
      </div>
      {post.content.trim() ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
      ) : null}
      <PostMediaGrid urls={post.mediaUrls ?? []} />
      {hashtags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hashtags.map((hashtag) => (
            <span
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
              key={hashtag}
            >
              {hashtag}
            </span>
          ))}
        </div>
      ) : null}
      {post.linkedProject ? (
        <Link
          className="mt-3 block rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm transition hover:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          <span className="font-semibold text-brand-700">연결 프로젝트 · </span>
          {post.linkedProject.title}
        </Link>
      ) : null}
    </div>
  )
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

        <div className="min-w-0 space-y-4">
          <Card className="rounded-2xl border-surface-border p-4 shadow-sm sm:p-5">
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
          <div className="space-y-4">
            {postsQuery.data?.posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                token={token ?? ''}
                userId={user?.id}
                onChanged={invalidateFeed}
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
    </AppLayout>
  )
}

type PostCardProps = {
  post: Post
  token: string
  userId?: string
  onChanged: () => void
}

function PostCard({ post, token, userId, onChanged }: PostCardProps) {
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content)
  const liked = post.likes.some((like) => like.userId === userId)
  const isAuthor = post.authorId === userId
  const hashtags = extractHashtags(post.content)
  const alreadyReposted = Boolean(
    userId && post.repostOf && post.authorId === userId && post.repostOf.id === post.repostOf?.id,
  )
  /* 단순화: 같은 원글에 대해 내가 이미 퍼간 게시물이 피드에 있는지는 별도 조회 없이 버튼만 비활성화하지 않음 */

  const likeMutation = useMutation({
    mutationFn: () => (liked ? unlikePost(token, post.id) : likePost(token, post.id)),
    onSuccess: onChanged,
  })
  const commentMutation = useMutation({
    mutationFn: () => addComment(token, post.id, comment),
    onSuccess: () => {
      setComment('')
      onChanged()
    },
  })
  const updateMutation = useMutation({
    mutationFn: () => updatePost(token, post.id, { content: editContent }),
    onSuccess: () => {
      setEditing(false)
      onChanged()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => deletePost(token, post.id),
    onSuccess: onChanged,
  })
  const repostMutation = useMutation({
    mutationFn: () =>
      createPost(token, {
        content: '',
        repostOfId: post.id,
        visibility: 'public',
      }),
    onSuccess: onChanged,
  })

  const canRepost = Boolean(userId && !isAuthor)

  return (
    <article className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link className="shrink-0 rounded-full ring-2 ring-white shadow-sm" to={`/profile/${post.author.id}`}>
            <Avatar name={post.author.name} src={post.author.avatarUrl} />
          </Link>
          <div>
            <Link className="font-bold text-ink-strong hover:text-brand-600" to={`/profile/${post.author.id}`}>
              {post.author.name}
            </Link>
            <p className="text-sm text-ink-muted">
              {formatDate(post.createdAt)} · {post.visibility}
            </p>
          </div>
        </div>
      </div>

      {post.repostOf ? (
        <div className="mt-3">
          <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <Repeat2 size={14} />
            퍼온 게시물
          </p>
          <div className="mt-2">
            <EmbeddedPostCore post={post.repostOf} />
          </div>
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            updateMutation.mutate()
          }}
        >
          <Textarea label="게시글 수정" onChange={(event) => setEditContent(event.target.value)} value={editContent} />
          <Button disabled={updateMutation.isPending} type="submit">
            수정 저장
          </Button>
        </form>
      ) : post.content.trim() ? (
        <p className="mt-4 whitespace-pre-wrap leading-relaxed text-ink-body">{post.content}</p>
      ) : post.repostOf ? null : (
        <p className="mt-4 text-sm text-ink-muted">내용 없음</p>
      )}

      <PostMediaGrid urls={post.mediaUrls ?? []} />

      {hashtags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {hashtags.map((hashtag) => (
            <span
              className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100"
              key={hashtag}
            >
              {hashtag}
            </span>
          ))}
        </div>
      ) : null}

      {!post.repostOf && post.linkedProject ? (
        <Link
          className="mt-4 block rounded-xl border border-brand-100 bg-brand-50/50 p-4 transition hover:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Linked Project</p>
          <p className="mt-1 font-bold text-ink-strong">{post.linkedProject.title}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{post.linkedProject.description ?? '설명 없음'}</p>
        </Link>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-4">
        <div className="flex flex-wrap gap-2">
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition',
              liked ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-muted',
            )}
            onClick={() => likeMutation.mutate()}
            type="button"
          >
            <ThumbsUp size={18} />
            좋아요 {post.likes.length}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted">
            <MessageSquare size={18} />
            댓글 {post.comments.length}
          </span>
          {canRepost ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-muted disabled:opacity-40"
              disabled={repostMutation.isPending || alreadyReposted}
              onClick={() => repostMutation.mutate()}
              type="button"
            >
              <Repeat2 size={18} />
              퍼가기
            </button>
          ) : null}
        </div>
        {isAuthor ? (
          <div className="flex w-full flex-shrink-0 justify-end gap-2 sm:w-auto">
            <Button className="rounded-full text-xs" onClick={() => setEditing((value) => !value)} variant="ghost">
              수정
            </Button>
            <Button className="rounded-full text-xs text-red-700 hover:bg-red-50" onClick={() => deleteMutation.mutate()} variant="ghost">
              삭제
            </Button>
          </div>
        ) : null}
      </div>
      {repostMutation.error ? (
        <p className="mt-2 text-xs text-red-600">{repostMutation.error.message}</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {post.comments.map((item) => (
          <div className="rounded-xl bg-surface-muted/80 p-4" key={item.id}>
            <div className="flex items-center gap-2">
              <Link className="shrink-0" to={`/profile/${item.author.id}`}>
                <Avatar name={item.author.name} size="sm" src={item.author.avatarUrl} />
              </Link>
              <Link className="text-sm font-bold text-ink-strong hover:text-brand-600" to={`/profile/${item.author.id}`}>
                {item.author.name}
              </Link>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-body">{item.content}</p>
          </div>
        ))}
      </div>

      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          commentMutation.mutate()
        }}
      >
        <div className="flex-1">
          <Textarea
            className="min-h-20 rounded-xl"
            label="댓글"
            onChange={(event) => setComment(event.target.value)}
            placeholder="댓글을 입력하세요"
            required
            value={comment}
          />
        </div>
        <Button className="self-end rounded-full" disabled={commentMutation.isPending} type="submit">
          댓글 작성
        </Button>
      </form>
    </article>
  )
}
