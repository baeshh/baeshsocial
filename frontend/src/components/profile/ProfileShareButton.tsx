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
  const handleShare = async () => {
    try {
      await copyProfileShareLink(userId)
      showToast('공유되었습니다.', 'success')
    } catch {
      showToast('링크 복사에 실패했습니다.', 'error')
    }
  }

  if (variant === 'icon') {
    return (
      <button
        aria-label="프로필 공유"
        className={cn(
          'inline-flex items-center justify-center rounded-full p-2 text-ink-muted transition hover:bg-surface-muted',
          className,
        )}
        onClick={() => void handleShare()}
        type="button"
      >
        <Share2 size={18} />
      </button>
    )
  }

  return (
    <Button
      className={cn('rounded-full border-surface-border', className)}
      onClick={() => void handleShare()}
      type="button"
      variant="secondary"
    >
      <Share2 className="mr-2" size={16} />
      공유
    </Button>
  )
}
