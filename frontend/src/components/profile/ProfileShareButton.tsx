import type { MouseEvent } from 'react'
import { Share2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { copyProfileShareLink } from '../../lib/profileShare'
import { showToast } from '../../stores/toastStore'
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
  const handleShare = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    try {
      await copyProfileShareLink(userId)
      showToast('링크를 복사했습니다.', 'success')
    } catch {
      showToast('링크 복사에 실패했습니다.', 'error')
    } finally {
      button.blur()
    }
  }

  if (variant === 'icon') {
    return (
      <button
        aria-label="프로필 링크 복사"
        className={cn(
          'inline-flex touch-manipulation select-none items-center justify-center rounded-full p-2 text-ink-muted transition hover:bg-surface-muted active:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
          className,
        )}
        onClick={(event) => void handleShare(event)}
        type="button"
      >
        <Share2 size={18} />
      </button>
    )
  }

  return (
    <Button
      className={cn(
        'touch-manipulation select-none rounded-full border-surface-border focus:outline-none active:scale-100',
        className,
      )}
      onClick={(event) => void handleShare(event)}
      type="button"
      variant="secondary"
    >
      <Share2 className="mr-2" size={16} />
      공유
    </Button>
  )
}
