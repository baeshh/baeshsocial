import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300',
  secondary:
    'border border-surface-border bg-white text-ink-strong hover:border-brand-200 hover:bg-brand-50 focus-visible:outline-brand-600 disabled:text-ink-muted',
  outline:
    'border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-brand-600 disabled:text-ink-muted',
  ghost: 'text-ink-body hover:bg-surface-muted hover:text-ink-strong focus-visible:outline-brand-600',
  danger:
    'border border-danger-100 bg-white text-danger-700 hover:bg-danger-50 focus-visible:outline-danger-600 disabled:text-danger-600/50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'min-h-11 gap-2 rounded-xl px-5 py-2.5 text-sm',
  lg: 'min-h-12 gap-2 rounded-xl px-6 py-3 text-base',
}

type BaseButtonProps = {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner and blocks repeated clicks while a request is in flight. */
  loading?: boolean
  className?: string
}

type ButtonProps = BaseButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    to?: never
  }

type ButtonLinkProps = BaseButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string
  }

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  ...props
}: ButtonProps | ButtonLinkProps) {
  const classes = cn(
    'inline-flex items-center justify-center font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    sizeClasses[size],
    variantClasses[variant],
    className,
  )

  if ('to' in props && props.to) {
    const { to, ...linkProps } = props

    return (
      <Link className={classes} to={to} {...linkProps}>
        {children}
      </Link>
    )
  }

  const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>

  return (
    <button
      {...buttonProps}
      aria-busy={loading || undefined}
      className={classes}
      disabled={buttonProps.disabled || loading}
      type={buttonProps.type ?? 'button'}
    >
      {loading ? <Loader2 aria-hidden className="animate-spin" size={16} /> : null}
      {children}
    </button>
  )
}
