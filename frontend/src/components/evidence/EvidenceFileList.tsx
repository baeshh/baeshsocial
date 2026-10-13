import { useQuery } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, Film, Image as ImageIcon, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { resolveApiUrl } from '../../lib/api'
import { formatBytes } from '../../lib/programs'
import { getEvidenceFileUrl } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { EvidenceFile } from '../../types/program'

const KIND_ICON = { image: ImageIcon, video: Film, pdf: FileText } as const

function ImageThumb({ file }: { file: EvidenceFile }) {
  const token = useAuthStore((state) => state.token)
  const urlQuery = useQuery({
    queryKey: ['evidence-file-url', file.id],
    queryFn: () => getEvidenceFileUrl(token!, file.id),
    enabled: Boolean(token),
    staleTime: 4 * 60 * 1000,
  })
  if (!urlQuery.data) {
    return <div className="h-full w-full animate-pulse bg-surface-muted" />
  }
  return <img alt={file.originalName} className="h-full w-full object-cover" src={resolveApiUrl(urlQuery.data.url)} />
}

type Props = {
  files: EvidenceFile[]
  onRemove?: (file: EvidenceFile) => void
  removing?: boolean
}

/** Every open/download goes through the API so access is re-checked and a short-lived URL is issued. */
export function EvidenceFileList({ files, onRemove, removing }: Props) {
  const token = useAuthStore((state) => state.token)
  const [opening, setOpening] = useState<string | null>(null)

  const open = async (file: EvidenceFile, download = false) => {
    if (!token) return
    setOpening(file.id)
    try {
      const { url } = await getEvidenceFileUrl(token, file.id, download)
      window.open(resolveApiUrl(url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setOpening(null)
    }
  }

  if (files.length === 0) {
    return <p className="text-sm text-ink-muted">첨부된 파일이 없습니다.</p>
  }

  const images = files.filter((file) => file.kind === 'image')

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.slice(0, 6).map((file) => (
            <button
              className="h-20 w-28 overflow-hidden rounded-xl border border-surface-border"
              key={file.id}
              onClick={() => void open(file)}
              title={file.originalName}
              type="button"
            >
              <ImageThumb file={file} />
            </button>
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-surface-border rounded-2xl border border-surface-border">
        {files.map((file) => {
          const Icon = KIND_ICON[file.kind]
          return (
            <li className="flex items-center gap-3 px-3 py-2 text-sm" key={file.id}>
              <Icon className="shrink-0 text-brand-600" size={18} />
              <span className="min-w-0 flex-1 truncate font-medium text-ink-strong" title={file.originalName}>
                {file.originalName}
              </span>
              <span className="shrink-0 text-xs text-ink-muted">{formatBytes(file.sizeBytes)}</span>
              <button
                aria-label={`${file.originalName} 열기`}
                className="rounded-full p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong disabled:opacity-50"
                disabled={opening === file.id}
                onClick={() => void open(file)}
                type="button"
              >
                <ExternalLink size={16} />
              </button>
              <button
                aria-label={`${file.originalName} 다운로드`}
                className="rounded-full p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink-strong disabled:opacity-50"
                disabled={opening === file.id}
                onClick={() => void open(file, true)}
                type="button"
              >
                <Download size={16} />
              </button>
              {onRemove ? (
                <button
                  aria-label={`${file.originalName} 삭제`}
                  className="rounded-full p-1.5 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                  disabled={removing}
                  onClick={() => onRemove(file)}
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
