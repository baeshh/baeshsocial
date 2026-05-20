import type { MouseEvent } from 'react'
import { Link2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { copyPostShareLink } from '../../lib/postShare'
import { showToast } from '../../stores/toastStore'
import type { PostVisibility } from '../../types/post'

type PostShareButtonProps = {
  postId: string
  visibility: PostVisibility
  className?: string
}

export function PostShareButton({ postId, visibility, className }: PostShareButtonProps) {
  if (visibility !== 'PUBLIC') {
    return null
  }

  const handleShare = async (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    try {
      await copyPostShareLink(postId)
      showToast('링크를 복사했습니다.', 'success')
    } catch {
      showToast('링크 복사에 실패했습니다.', 'error')
    } finally {
      button.blur()
    }
  }

  return (
    <button
      className={cn(
        'inline-flex touch-manipulation select-none items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-muted active:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
        className,
      )}
      onClick={(event) => void handleShare(event)}
      type="button"
    >
      <Link2 size={18} />
      공유
    </button>
  )
}
