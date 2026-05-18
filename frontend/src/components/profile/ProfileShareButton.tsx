import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { copyProfileShareLink } from '../../lib/profileShare'
import { Button } from '../common/Button'

type ProfileShareButtonProps = {
  userId: string
  className?: string
  variant?: 'button' | 'icon'
}

export function ProfileShareButton({
  userId,
  className,
  variant = 'button',
}: ProfileShareButtonProps) {
  const [hint, setHint] = useState<string | null>(null)

  const handleShare = async () => {
    try {
      await copyProfileShareLink(userId)
      setHint('프로필 링크를 복사했습니다.')
      window.setTimeout(() => setHint(null), 2500)
    } catch {
      setHint('링크 복사에 실패했습니다.')
    }
  }

  if (variant === 'icon') {
    return (
      <div className={cn('inline-flex flex-col items-end', className)}>
        <button
          aria-label="프로필 공유"
          className="inline-flex items-center justify-center rounded-full p-2 text-ink-muted transition hover:bg-surface-muted"
          onClick={() => void handleShare()}
          type="button"
        >
          <Share2 size={18} />
        </button>
        {hint ? <span className="mt-1 text-xs font-medium text-brand-600">{hint}</span> : null}
      </div>
    )
  }

  return (
    <div className={cn('inline-flex flex-col items-start', className)}>
      <Button
        className="rounded-full border-surface-border"
        onClick={() => void handleShare()}
        type="button"
        variant="secondary"
      >
        <Share2 className="mr-2" size={16} />
        공유
      </Button>
      {hint ? <span className="mt-1 text-xs font-medium text-brand-600">{hint}</span> : null}
    </div>
  )
}
