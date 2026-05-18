import { useState } from 'react'
import { Play } from 'lucide-react'
import { isVideoMediaUrl } from '../../lib/readMediaFile'
import { MediaLightbox } from './MediaLightbox'
import { cn } from '../../lib/cn'

type PostMediaGridProps = {
  urls: string[]
  className?: string
  /** feed: 대표 1장 + 추가 장수. compact: 작성 미리보기용 전체 썸네일 */
  variant?: 'feed' | 'compact'
}

function MediaThumb({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  if (isVideoMediaUrl(url)) {
    return (
      <>
        <video
          className={cn('h-full w-full object-cover', className)}
          muted
          playsInline
          preload="metadata"
          src={url}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink-strong shadow">
            <Play className="ml-0.5" size={18} />
          </span>
        </span>
      </>
    )
  }

  return (
    <img
      alt=""
      className={cn('h-full w-full object-cover transition group-hover:scale-[1.02]', className)}
      src={url}
    />
  )
}

export function PostMediaGrid({ urls, className, variant = 'feed' }: PostMediaGridProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  if (!urls.length) {
    return null
  }

  const openAt = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  const thumbButtonClass =
    'group relative overflow-hidden rounded-xl bg-surface-muted ring-1 ring-surface-border transition hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'

  if (variant === 'feed') {
    const cover = urls[0]
    const extraCount = urls.length - 1

    return (
      <>
        <div className={cn('mt-4', className)}>
          <button
            className={cn(thumbButtonClass, 'aspect-square w-full max-w-md')}
            onClick={() => openAt(0)}
            type="button"
          >
            <MediaThumb url={cover} />
            {extraCount > 0 ? (
              <span className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2.5 py-1 text-sm font-bold text-white shadow-lg backdrop-blur-sm">
                +{extraCount}
              </span>
            ) : null}
          </button>
        </div>

        <MediaLightbox
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          open={lightboxOpen}
          urls={urls}
        />
      </>
    )
  }

  return (
    <>
      <div
        className={cn('flex flex-wrap gap-2', className)}
      >
        {urls.map((url, index) => (
          <button
            className={cn(thumbButtonClass, 'h-20 w-20 shrink-0')}
            key={`${index}-${url.slice(0, 24)}`}
            onClick={() => openAt(index)}
            type="button"
          >
            <MediaThumb url={url} />
          </button>
        ))}
      </div>

      <MediaLightbox
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        open={lightboxOpen}
        urls={urls}
      />
    </>
  )
}
