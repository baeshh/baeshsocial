import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Repeat2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { LoadingState } from '../common/LoadingState'
import { Select, Textarea } from '../common/Input'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import { PostShareButton } from '../posts/PostShareButton'
import { EmbeddedPostPreview } from '../posts/EmbeddedPostPreview'
import {
  createPost,
  deletePost,
  getPostsByUser,
  updatePost,
  type PostPayload,
} from '../../services/postService'
import { getProjects } from '../../services/projectService'
import type { Post, PostVisibility } from '../../types/post'
import { notifyRepostAlreadyDone, notifyRepostError, notifyRepostSuccess } from '../../lib/repostPost'
import { useAuthStore } from '../../stores/authStore'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function visibilityLabel(visibility: string) {
  if (visibility === 'PUBLIC') {
    return '공개'
  }
  if (visibility === 'CONNECTIONS') {
    return '연결 공개'
  }
  return '비공개'
}

function visibilityToApi(visibility: PostVisibility): PostPayload['visibility'] {
  if (visibility === 'CONNECTIONS') {
    return 'connections'
  }
  if (visibility === 'PRIVATE') {
    return 'private'
  }
  return 'public'
}

type ProfilePostsPanelProps = {
  token: string
  userId: string
  userName: string
  avatarUrl: string | null
  isOwnProfile: boolean
}

type EditFormState = {
  content: string
  visibility: PostPayload['visibility']
  linkedProjectId: string
}

function buildEditForm(post: Post): EditFormState {
  return {
    content: post.content,
    visibility: visibilityToApi(post.visibility),
    linkedProjectId: post.linkedProjectId ?? '',
  }
}

type ProfilePostCardProps = {
  post: Post
  token: string
  userName: string
  avatarUrl: string | null
  isOwnProfile: boolean
  onChanged: () => void
  canRepost: boolean
  alreadyReposted: boolean
}

function ProfilePostCard({
  post,
  token,
  userName,
  avatarUrl,
  isOwnProfile,
  onChanged,
  canRepost,
  alreadyReposted,
}: ProfilePostCardProps) {
  const currentUserId = useAuthStore((state) => state.user?.id)
  const canManage = Boolean(isOwnProfile && currentUserId && post.authorId === currentUserId)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>(() => buildEditForm(post))
  const [error, setError] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(token),
    enabled: Boolean(token) && canManage && editing,
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePost(token, post.id, {
        content: editForm.content.trim(),
        visibility: editForm.visibility,
        linkedProjectId: editForm.linkedProjectId || null,
      }),
    onSuccess: () => {
      setEditing(false)
      setError(null)
      onChanged()
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(token, post.id),
    onSuccess: () => {
      setConfirmDelete(false)
      setError(null)
      onChanged()
    },
    onError: (err: Error) => setError(err.message),
  })

  const repostMutation = useMutation({
    mutationFn: () =>
      createPost(token, {
        content: '',
        repostOfId: post.id,
        visibility: 'public',
      }),
    onSuccess: () => {
      notifyRepostSuccess()
      onChanged()
    },
    onError: (err: Error) => {
      notifyRepostError(err.message)
    },
  })

  const handleRepost = () => {
    if (alreadyReposted) {
      notifyRepostAlreadyDone()
      return
    }
    repostMutation.mutate()
  }

  const startEdit = () => {
    setEditForm(buildEditForm(post))
    setEditing(true)
    setConfirmDelete(false)
    setError(null)
  }

  const cancelEdit = () => {
    setEditing(false)
    setEditForm(buildEditForm(post))
    setError(null)
  }

  return (
    <article className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Avatar name={userName} size="sm" src={avatarUrl} />
        <div>
          <p className="font-semibold text-ink-strong">{userName}</p>
          <p className="text-xs text-ink-muted">
            {formatDate(post.createdAt)} · {visibilityLabel(post.visibility)}
          </p>
        </div>
      </div>

      {confirmDelete ? (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50/80 p-4">
          <p className="text-sm font-semibold text-red-800">이 게시물을 삭제할까요?</p>
          <p className="mt-1 text-xs text-red-700">삭제 후에는 복구할 수 없습니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              type="button"
              variant="danger"
            >
              {deleteMutation.isPending ? '삭제 중…' : '삭제 확인'}
            </Button>
            <Button
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmDelete(false)}
              type="button"
              variant="secondary"
            >
              취소
            </Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3 border-t border-surface-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            updateMutation.mutate()
          }}
        >
          <Textarea
            label="내용"
            onChange={(event) => setEditForm((prev) => ({ ...prev, content: event.target.value }))}
            value={editForm.content}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="공개 범위"
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  visibility: event.target.value as PostPayload['visibility'],
                }))
              }
              value={editForm.visibility}
            >
              <option value="public">공개</option>
              <option value="connections">연결 공개</option>
              <option value="private">비공개</option>
            </Select>
            <Select
              label="연결 프로젝트"
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, linkedProjectId: event.target.value }))
              }
              value={editForm.linkedProjectId}
            >
              <option value="">없음</option>
              {(projectsQuery.data?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={updateMutation.isPending} type="submit">
              {updateMutation.isPending ? '저장 중…' : '저장'}
            </Button>
            <Button onClick={cancelEdit} type="button" variant="secondary">
              취소
            </Button>
          </div>
        </form>
      ) : (
        <>
          {post.repostOf ? (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink-muted">퍼온 게시물</p>
              <div className="mt-2">
                <EmbeddedPostPreview post={post.repostOf} />
              </div>
            </div>
          ) : null}
          {post.content.trim() ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-body">{post.content}</p>
          ) : post.repostOf ? null : (
            <p className="mt-3 text-sm text-ink-muted">내용 없음</p>
          )}
        </>
      )}

      {!editing ? <PostMediaGrid urls={post.mediaUrls ?? []} /> : null}

      {!editing && post.linkedProject ? (
        <Link
          className="mt-3 block rounded-lg border border-surface-border bg-surface-muted/40 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          to={`/projects/${post.linkedProject.id}`}
        >
          프로젝트: {post.linkedProject.title}
        </Link>
      ) : null}

      {!editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
          <p className="text-xs text-ink-muted">
            좋아요 {post.likes.length} · 댓글 {post.comments.length}
          </p>
          <PostShareButton postId={post.id} visibility={post.visibility} />
          {canRepost ? (
            <button
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition hover:bg-surface-muted disabled:opacity-50 ${
                alreadyReposted ? 'text-ink-muted/70' : 'text-ink-muted'
              }`}
              disabled={repostMutation.isPending}
              onClick={handleRepost}
              type="button"
            >
              <Repeat2 size={14} />
              {alreadyReposted ? '퍼감' : '퍼가기'}
            </button>
          ) : null}
          <Link className="text-xs font-semibold text-brand-600 hover:text-brand-700" to={`/p/${post.id}`}>
            게시물 보기
          </Link>
        </div>
      ) : null}

      {canManage && !editing && !confirmDelete ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-surface-border pt-4">
          <Button className="min-h-9 rounded-full px-4 text-sm" onClick={startEdit} type="button" variant="secondary">
            수정
          </Button>
          <Button
            className="min-h-9 rounded-full px-4 text-sm text-red-700 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
            type="button"
            variant="ghost"
          >
            삭제
          </Button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </article>
  )
}

export function ProfilePostsPanel({
  token,
  userId,
  userName,
  avatarUrl,
  isOwnProfile,
}: ProfilePostsPanelProps) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((state) => state.user?.id)

  const postsQuery = useQuery({
    queryKey: ['posts', 'by-user', userId],
    queryFn: () => getPostsByUser(token, userId),
    enabled: Boolean(token && userId),
    refetchOnMount: 'always',
  })

  const myPostsQuery = useQuery({
    queryKey: ['posts', 'by-user', currentUserId, 'repost-tracker'],
    queryFn: () => getPostsByUser(token, currentUserId!),
    enabled: Boolean(token && currentUserId && currentUserId !== userId),
  })

  const repostedSourceIds = useMemo(() => {
    const ids = new Set<string>()
    const sourcePosts = isOwnProfile ? postsQuery.data?.posts : myPostsQuery.data?.posts
    for (const item of sourcePosts ?? []) {
      if (item.repostOfId) {
        ids.add(item.repostOfId)
      }
    }
    return ids
  }, [isOwnProfile, myPostsQuery.data?.posts, postsQuery.data?.posts])

  const handleChanged = () => {
    void queryClient.invalidateQueries({ queryKey: ['posts', 'by-user', userId] })
    if (currentUserId) {
      void queryClient.invalidateQueries({
        queryKey: ['posts', 'by-user', currentUserId, 'repost-tracker'],
      })
    }
    void queryClient.invalidateQueries({ queryKey: ['posts'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }

  if (postsQuery.isLoading) {
    return <LoadingState />
  }

  if (postsQuery.error) {
    return (
      <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        {postsQuery.error.message}
      </p>
    )
  }

  const posts = postsQuery.data?.posts ?? []

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-muted/50 px-4 py-8 text-center">
        <p className="text-sm text-ink-muted">
          {isOwnProfile ? '아직 게시물이 없습니다.' : '공개된 게시물이 없습니다.'}
        </p>
        {isOwnProfile ? (
          <Button className="mt-4" to="/network" variant="secondary">
            Network에서 첫 게시물 작성
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <ProfilePostCard
          alreadyReposted={repostedSourceIds.has(post.id)}
          avatarUrl={avatarUrl}
          canRepost={Boolean(
            !isOwnProfile &&
              currentUserId &&
              post.authorId !== currentUserId &&
              post.visibility === 'PUBLIC',
          )}
          isOwnProfile={isOwnProfile}
          key={post.id}
          onChanged={handleChanged}
          post={post}
          token={token}
          userName={userName}
        />
      ))}
    </div>
  )
}
