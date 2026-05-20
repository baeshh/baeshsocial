import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../common/Avatar'

type ProfileAvatarLightboxProps = {
  open: boolean
  onClose: () => void
  src: string
  name: string
}

export function ProfileAvatarLightbox({ open, onClose, src, name }: ProfileAvatarLightboxProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) {
    return null
  }

  return createPortal(
    <button
      aria-label="프로필 사진 닫기"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      type="button"
    >
      <img
        alt={`${name} 프로필 사진`}
        className="aspect-square h-auto max-h-[min(85dvh,85vw)] w-auto max-w-[min(85dvh,85vw)] rounded-full object-cover shadow-2xl ring-4 ring-white/25 sm:max-h-[min(72dvh,28rem)] sm:max-w-[min(72dvh,28rem)]"
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        src={src}
      />
    </button>,
    document.body,
  )
}

type ClickableProfileAvatarProps = {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

/** 프로필 헤더용 — 사진이 있으면 탭 시 원형 확대 뷰 */
export function ClickableProfileAvatar({ name, src, size = 'xl', className }: ClickableProfileAvatarProps) {
  const avatar = <Avatar className={className} name={name} size={size} src={src} />

  if (!src) {
    return avatar
  }

  return <ClickableProfileAvatarInner avatar={avatar} name={name} src={src} />
}

function ClickableProfileAvatarInner({
  avatar,
  name,
  src,
}: {
  avatar: ReactNode
  name: string
  src: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        aria-label={`${name} 프로필 사진 크게 보기`}
        className="rounded-full transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
        onClick={() => setOpen(true)}
        type="button"
      >
        {avatar}
      </button>
      <ProfileAvatarLightbox name={name} onClose={() => setOpen(false)} open={open} src={src} />
    </>
  )
}
