import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Plus } from 'lucide-react'
import { useState } from 'react'
import { safeExternalUrl } from '../../../lib/opportunityDisplay'
import { dateTimeLabel } from '../../../lib/projectDisplay'
import { addProjectFile } from '../../../services/projectService'
import { showToast } from '../../../stores/toastStore'
import { Button } from '../../common/Button'
import { Input } from '../../common/Input'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const emptyForm = { name: '', url: '', fileType: '' }

export function ProjectFilesTab({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, can, invalidate } = ctx
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const create = useMutation({
    mutationFn: () => addProjectFile(token, project.id, form),
    onSuccess: () => {
      setForm(emptyForm)
      setFormOpen(false)
      showToast('파일 링크를 추가했습니다.', 'success')
      invalidate()
    },
  })

  return (
    <ProjectSection
      actions={
        can('files.upload') && !formOpen ? (
          <Button onClick={() => setFormOpen(true)} size="sm" type="button">
            <Plus aria-hidden size={15} />
            파일 링크 추가
          </Button>
        ) : null
      }
      description="문서·디자인·저장소처럼 팀이 함께 보는 산출물의 링크를 모읍니다. 파일 자체를 올리는 활동 증빙은 ‘증빙’에서 제출합니다."
      title="파일·산출물"
    >
      {formOpen ? (
        <form
          aria-label="새 파일 링크"
          className="mb-4 grid gap-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Input autoFocus label="이름" maxLength={200} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required value={form.name} />
          <Input
            label="종류"
            maxLength={80}
            onChange={(event) => setForm((prev) => ({ ...prev, fileType: event.target.value }))}
            placeholder="예: 기획서, 디자인, 발표자료"
            required
            value={form.fileType}
          />
          <div className="sm:col-span-2">
            <Input label="URL" onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://" required type="url" value={form.url} />
          </div>
          {create.error ? (
            <p className="text-sm font-medium text-danger-700 sm:col-span-2" role="alert">
              {create.error.message}
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button
              onClick={() => {
                setFormOpen(false)
                setForm(emptyForm)
              }}
              type="button"
              variant="secondary"
            >
              취소
            </Button>
            <Button loading={create.isPending} type="submit">
              추가
            </Button>
          </div>
        </form>
      ) : null}

      {project.files.length === 0 ? (
        <p className="rounded-xl bg-surface-muted/60 p-4 text-sm text-ink-muted">아직 연결된 파일이 없습니다.</p>
      ) : (
        <ul aria-label="파일 목록" className="divide-y divide-surface-border rounded-xl border border-surface-border">
          {project.files.map((file) => {
            const href = safeExternalUrl(file.url)
            return (
              <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between" key={file.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-strong">{file.name}</p>
                  <p className="text-xs text-ink-muted">
                    {file.fileType} · {file.uploader?.name ?? '알 수 없음'} · {dateTimeLabel(file.createdAt)}
                  </p>
                </div>
                {href ? (
                  <a
                    className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
                    href={href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink aria-hidden size={14} />
                    열기<span className="sr-only"> {file.name} (새 창)</span>
                  </a>
                ) : (
                  <span className="text-xs text-ink-muted">열 수 없는 주소</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </ProjectSection>
  )
}
