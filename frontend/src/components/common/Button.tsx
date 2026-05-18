import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-soft hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300',
  secondary:
    'border border-surface-border bg-white text-ink-strong hover:border-brand-100 hover:bg-brand-50 focus-visible:outline-brand-600 disabled:text-ink-muted',
  ghost: 'text-ink-body hover:bg-surface-muted hover:text-ink-strong focus-visible:outline-brand-600',
  danger:
    'border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-600 disabled:text-red-300',
}

type BaseButtonProps = {
  children: ReactNode
  variant?: ButtonVariant
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
  className = '',
  ...props
}: ButtonProps | ButtonLinkProps) {
  const classes = cn(
    'inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
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
    <button {...buttonProps} className={classes} type={buttonProps.type ?? 'button'}>
      {children}
    </button>
  )
}
