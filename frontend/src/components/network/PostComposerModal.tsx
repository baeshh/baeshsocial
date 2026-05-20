import { useMutation, useQuery } from '@tanstack/react-query'
import { Upload, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { Select, Textarea } from '../common/Input'
import { readMediaFile } from '../../lib/readMediaFile'
import { PostMediaGrid } from '../posts/PostMediaGrid'
import { createPost } from '../../services/postService'
import { getProjects } from '../../services/projectService'

function extractHashtags(content: string) {
  return Array.from(content.matchAll(/#[\p{L}\p{N}_-]+/gu)).map((match) => match[0])
}

type PostComposerModalProps = {
  open: boolean
  onClose: () => void
  token: string
  userName: string
  avatarUrl: string | null
  onSuccess: () => void
}

export function PostComposerModal({
  open,
  onClose,
  token,
  userName,
  avatarUrl,
  onSuccess,
}: PostComposerModalProps) {
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [content, setContent] = useState('')
  const [linkedProjectId, setLinkedProjectId] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(token),
    enabled: open && Boolean(token),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createPost(token, {
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
      onSuccess()
      onClose()
    },
  })

  const aiSuggestion = useMemo(() => {
    if (!content.trim()) {
      return '이번 주 프로젝트 진행 상황, 배운 점, 다음 목표를 함께 기록해보세요.'
    }
    const hashtags = extractHashtags(content)
    return hashtags.length > 0
      ? `${hashtags.join(', ')} 태그를 기준으로 관련 프로젝트와 기회를 함께 연결해보세요.`
      : '기술스택이나 역할을 해시태그로 추가하면 검색 가능성이 높아집니다.'
  }, [content])

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
        next.push(await readMediaFile(file, 'post'))
      } catch {
        /* skip */
      }
    }
    setMediaUrls(next)
    event.target.value = ''
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content.trim() && mediaUrls.length === 0) {
      return
    }
    createMutation.mutate()
  }

  return (
    <Modal onClose={onClose} open={open} title="새 게시물">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <Link className="shrink-0" to="/profile">
            <Avatar name={userName} src={avatarUrl} />
          </Link>
          <div className="flex-1">
            <Textarea
              className="min-h-28 rounded-2xl"
              label="내용"
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

        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            onClick={() => mediaInputRef.current?.click()}
            type="button"
            variant="secondary"
          >
            <Upload className="mr-1.5" size={18} />
            업로드 ({mediaUrls.length}/6)
          </Button>
        </div>

        {mediaUrls.length > 0 ? <PostMediaGrid urls={mediaUrls} variant="compact" /> : null}

        <Select label="연결 프로젝트" onChange={(e) => setLinkedProjectId(e.target.value)} value={linkedProjectId}>
          <option value="">연결하지 않음</option>
          {(projectsQuery.data?.projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>

        <Select label="공개 범위" onChange={(e) => setVisibility(e.target.value)} value={visibility}>
          <option value="public">공개</option>
          <option value="connections">연결 공개</option>
          <option value="private">비공개</option>
        </Select>

        <div className="flex items-start gap-2 rounded-xl bg-brand-50/80 p-3 text-sm text-brand-800 ring-1 ring-brand-100">
          <Sparkles className="mt-0.5 shrink-0" size={16} />
          <span>{aiSuggestion}</span>
        </div>

        {createMutation.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createMutation.error.message}
          </p>
        ) : null}

        <div className="flex gap-3 pt-2">
          <Button className="flex-1 rounded-lg" onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button className="flex-[2] rounded-lg" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? '게시 중…' : '게시하기'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
