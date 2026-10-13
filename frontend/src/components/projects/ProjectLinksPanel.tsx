import { useMutation } from '@tanstack/react-query'
import { Check, ExternalLink, Info, Link2, Pencil, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Input, Select } from '../common/Input'
import { addProjectLink, deleteProjectLink, updateProjectLink } from '../../services/projectService'
import type { ProjectLink, ProjectLinkType } from '../../types/profile'
import { guessLinkType, PROJECT_LINK_META } from './projectLinkMeta'

const MAX_LINKS = 20
const TYPE_OPTIONS: ProjectLinkType[] = ['github', 'deployment', 'figma', 'notion', 'google_drive', 'other']

type ProjectLinksPanelProps = {
  token: string
  projectId: string
  links: ProjectLink[]
  canEdit: boolean
  onChanged: () => void
}

export function ProjectLinksPanel({ token, projectId, links, canEdit, onChanged }: ProjectLinksPanelProps) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<ProjectLinkType | 'auto'>('auto')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const guessed = url.trim() ? guessLinkType(url) : null

  const addMutation = useMutation({
    mutationFn: () =>
      addProjectLink(token, projectId, {
        url: url.trim(),
        ...(type === 'auto' ? {} : { type }),
        ...(label.trim() ? { label: label.trim() } : {}),
      }),
    onSuccess: () => {
      setUrl('')
      setLabel('')
      setType('auto')
      onChanged()
    },
  })

  const renameMutation = useMutation({
    mutationFn: (linkId: string) => updateProjectLink(token, projectId, linkId, { label: editLabel.trim() || null }),
    onSuccess: () => {
      setEditingId(null)
      onChanged()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => deleteProjectLink(token, projectId, linkId),
    onSuccess: onChanged,
  })

  if (!canEdit && links.length === 0) {
    return null
  }

  const error = addMutation.error ?? renameMutation.error ?? deleteMutation.error

  return (
    <Card className="rounded-2xl border-surface-border shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="text-brand-600" size={20} />
          <CardTitle>외부 연결</CardTitle>
        </div>
        <CardDescription>GitHub 저장소, 배포 사이트, Figma·Notion·Google Drive 문서를 연결합니다.</CardDescription>
      </CardHeader>

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link) => {
            const meta = PROJECT_LINK_META[link.type]
            const Icon = meta.icon
            const editing = editingId === link.id
            return (
              <li
                className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-white px-3 py-2.5"
                key={link.id}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.tone}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      aria-label="링크 이름"
                      autoFocus
                      className="w-full rounded-lg border border-surface-border px-2 py-1 text-sm"
                      maxLength={80}
                      onChange={(event) => setEditLabel(event.target.value)}
                      value={editLabel}
                    />
                  ) : (
                    <p className="truncate text-sm font-semibold text-ink-strong">{link.label ?? meta.label}</p>
                  )}
                  <p className="truncate text-xs text-ink-muted">
                    {meta.label} · {link.url}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {editing ? (
                    <>
                      <IconButton
                        disabled={renameMutation.isPending}
                        label="이름 저장"
                        onClick={() => renameMutation.mutate(link.id)}
                      >
                        <Check size={16} />
                      </IconButton>
                      <IconButton label="취소" onClick={() => setEditingId(null)}>
                        <X size={16} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <a
                        aria-label="새 창에서 열기"
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong"
                        href={link.url}
                        rel="noopener noreferrer nofollow"
                        target="_blank"
                      >
                        <ExternalLink size={16} />
                      </a>
                      {canEdit ? (
                        <>
                          <IconButton
                            label="이름 수정"
                            onClick={() => {
                              setEditingId(link.id)
                              setEditLabel(link.label ?? '')
                            }}
                          >
                            <Pencil size={15} />
                          </IconButton>
                          <IconButton
                            disabled={deleteMutation.isPending}
                            label="연결 해제"
                            onClick={() => {
                              if (window.confirm('이 링크 연결을 해제할까요?')) {
                                deleteMutation.mutate(link.id)
                              }
                            }}
                          >
                            <Trash2 size={15} />
                          </IconButton>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {canEdit && links.length < MAX_LINKS ? (
        <form
          className="mt-4 grid gap-3 border-t border-surface-border pt-4 sm:grid-cols-[1fr_160px]"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            addMutation.mutate()
          }}
        >
          <Input
            helperText={
              guessed
                ? `${PROJECT_LINK_META[type === 'auto' ? guessed : type].label} 링크로 연결됩니다.`
                : 'https:// 로 시작하는 주소를 붙여 넣으세요.'
            }
            label="URL"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repo"
            required
            type="url"
            value={url}
          />
          <Select label="유형" onChange={(event) => setType(event.target.value as ProjectLinkType | 'auto')} value={type}>
            <option value="auto">자동 인식</option>
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {PROJECT_LINK_META[option].label}
              </option>
            ))}
          </Select>
          <Input
            className="sm:col-span-2"
            label="이름 (선택)"
            maxLength={80}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="예: 백엔드 저장소, 발표 자료"
            value={label}
          />
          <div className="flex items-center justify-end sm:col-span-2">
            <Button className="rounded-full" disabled={addMutation.isPending || !url.trim()} type="submit">
              {addMutation.isPending ? '연결 중…' : '링크 연결'}
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error.message}</p> : null}

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted/70 px-3 py-2.5 text-xs leading-relaxed text-ink-muted">
        <Info className="mt-0.5 shrink-0" size={14} />
        외부 링크는 참고 자료이며 검증 기록이 아닙니다. 검증된 성과는 기관 담당자가 활동 증빙을 승인한 경우에만
        표시됩니다.
      </p>
    </Card>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  )
}
