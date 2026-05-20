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

  const handleShare = async () => {
    try {
      await copyPostShareLink(postId)
      showToast('공유되었습니다.', 'success')
    } catch {
      showToast('링크 복사에 실패했습니다.', 'error')
    }
  }

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition hover:bg-surface-muted',
        className,
      )}
      onClick={() => void handleShare()}
      type="button"
    >
      <Link2 size={18} />
      공유
    </button>
  )
}
