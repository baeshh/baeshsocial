import { Link2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { copyPostShareLink } from '../../lib/postShare'
import type { PostVisibility } from '../../types/post'

type PostShareButtonProps = {
  postId: string
  visibility: PostVisibility
  className?: string
}

export function PostShareButton({ postId, visibility, className }: PostShareButtonProps) {
  const [hint, setHint] = useState<string | null>(null)

  if (visibility !== 'PUBLIC') {
    return null
  }

  const handleShare = async () => {
    try {
      await copyPostShareLink(postId)
      setHint('링크가 복사되었습니다.')
      window.setTimeout(() => setHint(null), 2500)
    } catch {
      setHint('링크 복사에 실패했습니다.')
    }
  }

  return (
    <div className={cn('inline-flex flex-col items-start', className)}>
      <button
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-muted"
        onClick={() => void handleShare()}
        type="button"
      >
        <Link2 size={18} />
        공유
      </button>
      {hint ? <span className="mt-1 px-3 text-xs font-medium text-brand-600">{hint}</span> : null}
    </div>
  )
}
