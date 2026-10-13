import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { cn } from '../../lib/cn'

type ModalProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  /** 넓은 폼(프로필 편집 등) */
  wide?: boolean
  /** When set, closing (Esc, backdrop, close button) asks for confirmation with this message. */
  confirmCloseMessage?: string | null
}

export function Modal({ open, title, description, children, onClose, wide = false, confirmCloseMessage = null }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)

  const requestClose = () => {
    if (confirmCloseMessage && !window.confirm(confirmCloseMessage)) return
    onClose()
  }

  useFocusTrap(dialogRef, open, requestClose)

  if (!open) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink-strong/40 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
      onClick={requestClose}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          'flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border border-surface-border bg-white shadow-overlay outline-none sm:max-h-[min(90dvh,100%)] sm:rounded-2xl',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
        )}
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border bg-white px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg font-bold text-ink-strong sm:text-xl" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-sm leading-6 text-ink-muted" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-border bg-white text-ink-strong transition hover:border-brand-200 hover:bg-surface-muted"
            onClick={requestClose}
            type="button"
          >
            <X size={20} strokeWidth={2.25} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
          {children}
        </div>
      </section>
    </div>,
    document.body,
  )
}
