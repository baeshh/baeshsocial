import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

type ModalProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  /** 넓은 폼(프로필 편집 등) */
  wide?: boolean
}

export function Modal({ open, title, description, children, onClose, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-strong/40 px-4 py-6 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={cn(
          'flex max-h-[min(90dvh,100%)] w-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card',
          wide ? 'max-w-4xl' : 'max-w-lg',
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border bg-white px-6 py-5">
          <div className="min-w-0 pr-2">
            <h2 className="text-xl font-bold text-ink-strong" id="modal-title">
              {title}
            </h2>
            {description ? <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p> : null}
          </div>
          <button
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-border bg-white text-ink-strong shadow-sm transition hover:border-brand-200 hover:bg-surface-muted"
            onClick={onClose}
            type="button"
          >
            <X size={20} strokeWidth={2.25} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
