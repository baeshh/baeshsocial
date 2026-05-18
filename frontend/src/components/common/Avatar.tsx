import { cn } from '../../lib/cn'

type AvatarProps = {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-11 w-11 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-28 w-28 text-3xl border-4 border-white shadow-lg',
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || 'B'

  if (src) {
    return (
      <img
        alt={`${name} avatar`}
        className={cn('rounded-full border border-surface-border object-cover', sizeClasses[size], className)}
        src={src}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-ink-strong font-bold text-white',
        sizeClasses[size],
        className,
      )}
    >
      {initial}
    </span>
  )
}
