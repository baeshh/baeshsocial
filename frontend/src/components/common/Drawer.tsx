import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type DrawerProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Left side sheet with focus trap, Escape/backdrop close and focus restore. */
export function Drawer({ open, title, onClose, children }: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLElement>(null)
  useFocusTrap(panelRef, open, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[55] flex" onClick={onClose} role="presentation">
      <div aria-hidden className="absolute inset-0 bg-ink-strong/40 backdrop-blur-[2px]" />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex h-full w-[min(20rem,86vw)] flex-col bg-white shadow-overlay outline-none"
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-surface-border px-4">
          <h2 className="text-base font-bold text-ink-strong" id={titleId}>
            {title}
          </h2>
          <button
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-body transition hover:bg-surface-muted"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </section>
    </div>,
    document.body,
  )
}
