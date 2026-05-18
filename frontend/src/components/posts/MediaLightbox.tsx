import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { isVideoMediaUrl } from '../../lib/readMediaFile'

type MediaLightboxProps = {
  urls: string[]
  initialIndex?: number
  open: boolean
  onClose: () => void
}

export function MediaLightbox({ urls, initialIndex = 0, open, onClose }: MediaLightboxProps) {
  const [index, setIndex] = useState(initialIndex)

  useEffect(() => {
    if (open) {
      setIndex(initialIndex)
    }
  }, [open, initialIndex])

  useEffect(() => {
    if (!open) {
      return
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const goPrev = useCallback(() => {
    setIndex((current) => (current <= 0 ? urls.length - 1 : current - 1))
  }, [urls.length])

  const goNext = useCallback(() => {
    setIndex((current) => (current >= urls.length - 1 ? 0 : current + 1))
  }, [urls.length])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
      if (event.key === 'ArrowLeft') {
        goPrev()
      }
      if (event.key === 'ArrowRight') {
        goNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, goPrev, goNext])

  if (!open || urls.length === 0) {
    return null
  }

  const current = urls[index] ?? urls[0]
  const hasMultiple = urls.length > 1

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="미디어 보기"
    >
      <button
        aria-label="닫기"
        className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white shadow-lg transition hover:bg-black/80"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        type="button"
      >
        <X size={22} />
      </button>

      {hasMultiple ? (
        <p className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-white/20 bg-black/60 px-4 py-1.5 text-sm font-semibold text-white shadow-lg">
          {index + 1} / {urls.length}
        </p>
      ) : null}

      {hasMultiple ? (
        <>
          <button
            aria-label="이전"
            className="absolute left-3 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/40 bg-white text-black shadow-xl transition hover:scale-105 hover:bg-white sm:left-6"
            onClick={(event) => {
              event.stopPropagation()
              goPrev()
            }}
            type="button"
          >
            <ChevronLeft size={32} strokeWidth={2.5} />
          </button>

          <button
            aria-label="다음"
            className="absolute right-3 top-1/2 z-30 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/40 bg-white text-black shadow-xl transition hover:scale-105 hover:bg-white sm:right-6"
            onClick={(event) => {
              event.stopPropagation()
              goNext()
            }}
            type="button"
          >
            <ChevronRight size={32} strokeWidth={2.5} />
          </button>

          <button
            aria-hidden
            className="absolute inset-y-0 left-0 z-20 w-[22%] max-w-[120px] cursor-w-resize"
            onClick={(event) => {
              event.stopPropagation()
              goPrev()
            }}
            tabIndex={-1}
            type="button"
          />
          <button
            aria-hidden
            className="absolute inset-y-0 right-0 z-20 w-[22%] max-w-[120px] cursor-e-resize"
            onClick={(event) => {
              event.stopPropagation()
              goNext()
            }}
            tabIndex={-1}
            type="button"
          />
        </>
      ) : null}

      <div
        className="relative z-10 flex max-h-[85vh] max-w-[min(92vw,720px)] items-center justify-center px-14 sm:px-20"
        onClick={(event) => event.stopPropagation()}
      >
        {isVideoMediaUrl(current) ? (
          <video
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            controls
            autoPlay
            playsInline
            src={current}
          />
        ) : (
          <img
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
            src={current}
          />
        )}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
