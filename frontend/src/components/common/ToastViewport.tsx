import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'
import { useToastStore } from '../../stores/toastStore'

const variantClasses = {
  success: 'bg-ink-strong text-white ring-white/10',
  error: 'bg-red-600 text-white ring-red-400/30',
  info: 'bg-white text-ink-strong ring-surface-border shadow-xl',
}

export function ToastViewport() {
  const message = useToastStore((state) => state.message)
  const variant = useToastStore((state) => state.variant)

  if (!message) {
    return null
  }

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center px-8"
      role="status"
    >
      <p
        className={cn(
          'toast-pop max-w-[min(100%,20rem)] rounded-2xl px-5 py-3.5 text-center text-sm font-semibold leading-snug ring-1',
          variantClasses[variant],
        )}
      >
        {message}
      </p>
    </div>,
    document.body,
  )
}
