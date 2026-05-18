import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const fieldClasses =
  'mt-2 w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-ink-strong outline-none transition placeholder:text-ink-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-surface-muted disabled:text-ink-muted'

type FieldWrapperProps = {
  label: string
  helperText?: string
  error?: string
  children: ReactNode
}

function FieldWrapper({ label, helperText, error, children }: FieldWrapperProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink-strong">{label}</span>
      {children}
      {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
      {!error && helperText ? <p className="mt-2 text-sm text-ink-muted">{helperText}</p> : null}
    </label>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  helperText?: string
  error?: string
}

export function Input({ label, helperText, error, className = '', ...props }: InputProps) {
  return (
    <FieldWrapper error={error} helperText={helperText} label={label}>
      <input className={cn(fieldClasses, className)} {...props} />
    </FieldWrapper>
  )
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  helperText?: string
  error?: string
}

export function Select({ label, helperText, error, className = '', children, ...props }: SelectProps) {
  return (
    <FieldWrapper error={error} helperText={helperText} label={label}>
      <select className={cn(fieldClasses, className)} {...props}>
        {children}
      </select>
    </FieldWrapper>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  helperText?: string
  error?: string
}

export function Textarea({ label, helperText, error, className = '', ...props }: TextareaProps) {
  return (
    <FieldWrapper error={error} helperText={helperText} label={label}>
      <textarea className={cn(fieldClasses, 'min-h-32 resize-y', className)} {...props} />
    </FieldWrapper>
  )
}
