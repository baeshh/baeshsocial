import { useMutation } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, Film, Image as ImageIcon, Link2, Plus, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'
import { resolveApiUrl } from '../../../lib/api'
import { safeExternalUrl } from '../../../lib/opportunityDisplay'
import { formatBytes } from '../../../lib/programs'
import { dateTimeLabel } from '../../../lib/projectDisplay'
import { checkProjectFile, PROJECT_FILE_ACCEPT, PROJECT_FILE_HINT, PROJECT_FILE_MAX_PER_UPLOAD, projectFileKind } from '../../../lib/projectFiles'
import { addProjectFile, deleteProjectFile, getProjectFileUrl, uploadProjectFiles } from '../../../services/projectService'
import { useAuthStore } from '../../../stores/authStore'
import { showToast } from '../../../stores/toastStore'
import type { ProjectFile } from '../../../types/project'
import { Button } from '../../common/Button'
import { Input } from '../../common/Input'
import { EvidenceFilePicker } from '../../evidence/EvidenceFilePicker'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const emptyLink = { name: '', url: '', fileType: '' }
const KIND_ICON = { link: Link2, image: ImageIcon, video: Film, pdf: FileText, document: FileText } as const

type Panel = 'upload' | 'link' | null

export function ProjectFilesTab({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, can, invalidate } = ctx
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [panel, setPanel] = useState<Panel>(null)
  const [link, setLink] = useState(emptyLink)
  const [files, setFiles] = useState<File[]>([])
  const [fileType, setFileType] = useState('')
  const [opening, setOpening] = useState<string | null>(null)

  const close = () => {
    setPanel(null)
    setLink(emptyLink)
    setFiles([])
    setFileType('')
  }

  const createLink = useMutation({
    mutationFn: () => addProjectFile(token, project.id, link),
    onSuccess: () => {
      close()
      showToast('파일 링크를 추가했습니다.', 'success')
      invalidate()
    },
  })
  const upload = useMutation({
    mutationFn: () => uploadProjectFiles(token, project.id, files, fileType.trim() || undefined),
    onSuccess: (result) => {
      close()
      showToast(`파일 ${result.files.length}개를 올렸습니다.`, 'success')
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (file: ProjectFile) => deleteProjectFile(token, project.id, file.id),
    onSuccess: () => {
      showToast('파일을 삭제했습니다.', 'success')
      invalidate()
    },
    onError: (error) => showToast(error.message, 'error'),
  })

  const open = async (file: ProjectFile, download = false) => {
    setOpening(file.id)
    try {
      const { url } = await getProjectFileUrl(token, project.id, file.id, download)
      window.open(resolveApiUrl(url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setOpening(null)
    }
  }

  const canRemove = (file: ProjectFile) => can('files.delete') || (file.uploadedBy === currentUserId && can('files.upload'))

  return (
    <ProjectSection
      actions={
        can('files.upload') && !panel ? (
          <div className="flex gap-2">
            <Button onClick={() => setPanel('link')} size="sm" type="button" variant="secondary">
              <Plus aria-hidden size={15} />
              링크 추가
            </Button>
            <Button onClick={() => setPanel('upload')} size="sm" type="button">
              <Upload aria-hidden size={15} />
              파일 올리기
            </Button>
          </div>
        ) : null
      }
      description="기획서·디자인·발표자료 같은 팀 산출물을 올리거나 링크로 모읍니다. 기관 검토가 필요한 활동 증빙은 ‘증빙’에서 제출합니다."
      title="파일·산출물"
    >
      {panel === 'upload' ? (
        <form
          aria-label="파일 올리기"
          className="mb-4 space-y-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (files.length > 0) upload.mutate()
          }}
        >
          <EvidenceFilePicker
            accept={PROJECT_FILE_ACCEPT}
            check={checkProjectFile}
            files={files}
            hint={PROJECT_FILE_HINT}
            label="사진·영상·PDF·문서 선택 또는 끌어다 놓기"
            max={PROJECT_FILE_MAX_PER_UPLOAD}
            onChange={setFiles}
            onError={(message) => showToast(message, 'error')}
          />
          <Input
            label="종류 (선택)"
            maxLength={80}
            onChange={(event) => setFileType(event.target.value)}
            placeholder="비워 두면 파일 형식으로 표시됩니다. 예: 기획서, 디자인"
            value={fileType}
          />
          {upload.error ? (
            <p className="text-sm font-medium text-danger-700" role="alert">
              {upload.error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={close} type="button" variant="secondary">
              취소
            </Button>
            <Button disabled={files.length === 0} loading={upload.isPending} type="submit">
              올리기
            </Button>
          </div>
        </form>
      ) : null}

      {panel === 'link' ? (
        <form
          aria-label="새 파일 링크"
          className="mb-4 grid gap-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            createLink.mutate()
          }}
        >
          <Input autoFocus label="이름" maxLength={200} onChange={(event) => setLink((prev) => ({ ...prev, name: event.target.value }))} required value={link.name} />
          <Input
            label="종류"
            maxLength={80}
            onChange={(event) => setLink((prev) => ({ ...prev, fileType: event.target.value }))}
            placeholder="예: 기획서, 디자인, 발표자료"
            required
            value={link.fileType}
          />
          <div className="sm:col-span-2">
            <Input label="URL" onChange={(event) => setLink((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://" required type="url" value={link.url} />
          </div>
          {createLink.error ? (
            <p className="text-sm font-medium text-danger-700 sm:col-span-2" role="alert">
              {createLink.error.message}
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={close} type="button" variant="secondary">
              취소
            </Button>
            <Button loading={createLink.isPending} type="submit">
              추가
            </Button>
          </div>
        </form>
      ) : null}

      {project.files.length === 0 ? (
        <p className="rounded-xl bg-surface-muted/60 p-4 text-sm text-ink-muted">아직 올리거나 연결한 파일이 없습니다.</p>
      ) : (
        <ul aria-label="파일 목록" className="divide-y divide-surface-border rounded-xl border border-surface-border">
          {project.files.map((file) => {
            const kind = projectFileKind(file)
            const Icon = KIND_ICON[kind]
            const href = file.url ? safeExternalUrl(file.url) : null
            const iconButton = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50'
            return (
              <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" key={file.id}>
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon aria-hidden className="mt-0.5 shrink-0 text-brand-600" size={18} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-strong">{file.name}</p>
                    <p className="text-xs text-ink-muted">
                      {file.fileType}
                      {file.sizeBytes !== null ? ` · ${formatBytes(file.sizeBytes)}` : ' · 링크'} · {file.uploader?.name ?? '알 수 없음'} ·{' '}
                      {dateTimeLabel(file.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {kind === 'link' ? (
                    href ? (
                      <a className={iconButton} href={href} rel="noopener noreferrer" target="_blank">
                        <ExternalLink aria-hidden size={14} />
                        열기<span className="sr-only"> {file.name} (새 창)</span>
                      </a>
                    ) : (
                      <span className="text-xs text-ink-muted">열 수 없는 주소</span>
                    )
                  ) : (
                    <>
                      {kind !== 'document' ? (
                        <button className={iconButton} disabled={opening === file.id} onClick={() => void open(file)} type="button">
                          <ExternalLink aria-hidden size={14} />
                          열기<span className="sr-only"> {file.name}</span>
                        </button>
                      ) : null}
                      <button className={iconButton} disabled={opening === file.id} onClick={() => void open(file, true)} type="button">
                        <Download aria-hidden size={14} />
                        다운로드<span className="sr-only"> {file.name}</span>
                      </button>
                    </>
                  )}
                  {canRemove(file) ? (
                    <button
                      aria-label={`${file.name} 삭제`}
                      className="rounded-lg p-2 text-danger-700 hover:bg-danger-50 disabled:opacity-50"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`'${file.name}'을(를) 삭제할까요? 되돌릴 수 없습니다.`)) remove.mutate(file)
                      }}
                      type="button"
                    >
                      <Trash2 aria-hidden size={15} />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ProjectSection>
  )
}
