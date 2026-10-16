import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

const fieldClasses =
  'mt-2 w-full rounded-2xl border border-surface-border bg-white px-4 py-3 text-ink-strong outline-none transition placeholder:text-ink-muted focus:border-brand-500 focus:ring-4 focus:ring-brand-100 disabled:bg-surface-muted disabled:text-ink-muted'
const invalidClasses = 'border-red-300 focus:border-red-500 focus:ring-red-100'

type FieldProps = {
  id?: string
  'aria-describedby'?: string
}

type ControlProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

type FieldWrapperProps = {
  label: string
  helperText?: string
  error?: string
  field: FieldProps
  children: (control: ControlProps) => ReactNode
}

/** Visible label, helper and error text wired to the control by id, so screen readers announce all three. */
function FieldWrapper({ label, helperText, error, field, children }: FieldWrapperProps) {
  const generatedId = useId()
  const id = field.id ?? generatedId
  const noteId = `${id}-note`
  const note = error ?? helperText
  const describedBy = [field['aria-describedby'], note ? noteId : undefined].filter(Boolean).join(' ') || undefined
  return (
    <div className="block">
      <label className="text-sm font-semibold text-ink-strong" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {note ? (
        <p className={cn('mt-2 text-sm', error ? 'font-medium text-red-700' : 'text-ink-muted')} id={noteId}>
          {note}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  helperText?: string
  error?: string
}

export function Input({ label, helperText, error, className = '', ...props }: InputProps) {
  return (
    <FieldWrapper error={error} field={props} helperText={helperText} label={label}>
      {(control) => <input {...props} {...control} className={cn(fieldClasses, error && invalidClasses, className)} />}
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
    <FieldWrapper error={error} field={props} helperText={helperText} label={label}>
      {(control) => (
        <select {...props} {...control} className={cn(fieldClasses, error && invalidClasses, className)}>
          {children}
        </select>
      )}
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
    <FieldWrapper error={error} field={props} helperText={helperText} label={label}>
      {(control) => <textarea {...props} {...control} className={cn(fieldClasses, 'min-h-32 resize-y', error && invalidClasses, className)} />}
    </FieldWrapper>
  )
}
