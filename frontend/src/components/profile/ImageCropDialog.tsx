import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn } from 'lucide-react'
import {
  CROP_VIEWPORT,
  clampCropTransform,
  exportCroppedImage,
  getDisplayScale,
  loadImageFromFile,
  type CropTransform,
  type LoadedCropImage,
} from '../../lib/cropImage'
import type { ImageUploadPreset } from '../../lib/readImageFile'
import { cn } from '../../lib/cn'

type ImageCropDialogProps = {
  open: boolean
  file: File | null
  preset: ImageUploadPreset
  title: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

const presetLabels: Record<ImageUploadPreset, string> = {
  avatar: '프로필 사진',
  cover: '배경 이미지',
  post: '게시물 이미지',
}

export function ImageCropDialog({
  open,
  file,
  preset,
  title,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const viewport = CROP_VIEWPORT[preset]
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const [loaded, setLoaded] = useState<LoadedCropImage | null>(null)
  const [displaySize, setDisplaySize] = useState(viewport)
  const [transform, setTransform] = useState<CropTransform>({ panX: 0, panY: 0, zoom: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  useLayoutEffect(() => {
    if (!open || !viewportRef.current) {
      return
    }

    const element = viewportRef.current
    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setDisplaySize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, preset, loading, loaded])

  useEffect(() => {
    if (!open || !file) {
      setLoaded(null)
      setTransform({ panX: 0, panY: 0, zoom: 1 })
      setDisplaySize(viewport)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void loadImageFromFile(file)
      .then((result) => {
        if (cancelled) {
          result.revoke?.()
          return
        }
        setLoaded(result)
        setTransform({ panX: 0, panY: 0, zoom: 1 })
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '이미지를 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, file, viewport])

  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    return () => {
      loaded?.revoke?.()
    }
  }, [loaded])

  if (!open || !file) {
    return null
  }

  const image = loaded?.image ?? null
  const previewSrc = loaded?.src ?? ''
  const displayScale =
    image && image.naturalWidth > 0
      ? getDisplayScale(image, displaySize.width, displaySize.height, transform.zoom)
      : null

  const panScaleX = displaySize.width > 0 ? viewport.width / displaySize.width : 1
  const panScaleY = displaySize.height > 0 ? viewport.height / displaySize.height : 1

  const updateTransform = (next: CropTransform) => {
    if (!image) {
      return
    }
    setTransform(clampCropTransform(image, viewport.width, viewport.height, next))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image) {
      return
    }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: transform.panX,
      panY: transform.panY,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !image) {
      return
    }
    event.preventDefault()
    const deltaX = (event.clientX - dragRef.current.startX) * panScaleX
    const deltaY = (event.clientY - dragRef.current.startY) * panScaleY
    updateTransform({
      ...transform,
      panX: dragRef.current.panX + deltaX,
      panY: dragRef.current.panY + deltaY,
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
  }

  const handleApply = () => {
    if (!image) {
      return
    }

    try {
      setApplying(true)
      setError(null)
      const dataUrl = exportCroppedImage(image, preset, transform, viewport)
      onConfirm(dataUrl)
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : '이미지 저장에 실패했습니다.')
    } finally {
      setApplying(false)
    }
  }

  const imageWidth = image && displayScale ? image.naturalWidth * displayScale : 0
  const imageHeight = image && displayScale ? image.naturalHeight * displayScale : 0
  const visualPanX = transform.panX / panScaleX
  const visualPanY = transform.panY / panScaleY

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col justify-end bg-slate-900/60 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <section
        className="flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {presetLabels[preset]} 영역에 맞게 드래그하고 슬라이더로 확대/축소하세요.
            </p>
          </div>
          <button
            aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          <div
            className={cn(
              'relative mx-auto w-full overflow-hidden rounded-xl bg-slate-800 ring-2 ring-slate-200',
              preset === 'avatar' ? 'max-w-[320px]' : 'max-w-[480px]',
            )}
            ref={viewportRef}
            style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}
          >
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                이미지 불러오는 중…
              </div>
            ) : image && displayScale && previewSrc ? (
              <div
                className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                <img
                  alt=""
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  draggable={false}
                  src={previewSrc}
                  style={{
                    width: imageWidth,
                    height: imageHeight,
                    transform: `translate(calc(-50% + ${visualPanX}px), calc(-50% + ${visualPanY}px))`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25" />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-slate-400">
                {error ?? '이미지를 불러올 수 없습니다.'}
              </div>
            )}
          </div>

          {image ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <ZoomIn size={14} />
                확대/축소
              </div>
              <input
                className="w-full accent-blue-600"
                max={3}
                min={1}
                onChange={(event) =>
                  updateTransform({ ...transform, zoom: Number(event.target.value) })
                }
                step={0.01}
                type="range"
                value={transform.zoom}
              />
              <p className="mt-2 text-center text-xs text-slate-400">사진을 드래그해 위치를 맞춰 주세요</p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
          <button
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={!image || applying || loading}
            onClick={handleApply}
            type="button"
          >
            {applying ? '적용 중…' : '적용'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
