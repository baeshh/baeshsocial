import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

type BaeshLogoProps = {
  className?: string
  imageClassName?: string
  to?: string
  onClick?: () => void
}

export function BaeshLogo({ className, imageClassName, to = '/dashboard', onClick }: BaeshLogoProps) {
  const image = (
    <img
      alt="BAESH"
      className={cn('h-9 w-9 object-contain', imageClassName)}
      height={36}
      src="/baesh-logo.png"
      width={36}
    />
  )

  if (to) {
    return (
      <Link className={cn('inline-flex shrink-0 items-center', className)} onClick={onClick} to={to}>
        {image}
      </Link>
    )
  }

  return <span className={cn('inline-flex shrink-0 items-center', className)}>{image}</span>
}
