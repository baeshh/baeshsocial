import { Upload, X } from 'lucide-react'
import { useRef } from 'react'
import { checkEvidenceFile, EVIDENCE_ACCEPT, formatBytes } from '../../lib/programs'

type Props = {
  files: File[]
  onChange: (files: File[]) => void
  max: number
  onError: (message: string) => void
}

export function EvidenceFilePicker({ files, onChange, max, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const add = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    for (const file of Array.from(list)) {
      const problem = checkEvidenceFile(file)
      if (problem) {
        onError(problem)
        continue
      }
      if (next.length >= max) {
        onError(`파일은 최대 ${max}개까지 첨부할 수 있습니다.`)
        break
      }
      next.push(file)
    }
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <button
        className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-surface-border bg-surface-muted/40 px-4 py-5 text-sm text-ink-muted transition hover:border-brand-300 hover:text-ink-strong"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          add(event.dataTransfer.files)
        }}
        type="button"
      >
        <Upload size={20} />
        <span className="font-semibold">사진·영상·PDF 선택 또는 끌어다 놓기</span>
        <span className="text-xs">사진 15MB · PDF 25MB · 영상 100MB · 최대 {max}개</span>
      </button>
      <input accept={EVIDENCE_ACCEPT} className="hidden" multiple onChange={(event) => add(event.target.files)} ref={inputRef} type="file" />
      {files.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {files.map((file, index) => (
            <li className="flex items-center gap-2 rounded-xl bg-surface-muted/60 px-3 py-2 text-sm" key={`${file.name}-${index}`}>
              <span className="min-w-0 flex-1 truncate text-ink-strong">{file.name}</span>
              <span className="text-xs text-ink-muted">{formatBytes(file.size)}</span>
              <button
                aria-label={`${file.name} 제거`}
                className="rounded-full p-1 text-ink-muted hover:bg-white hover:text-ink-strong"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                type="button"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
