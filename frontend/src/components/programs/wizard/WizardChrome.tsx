import { AlertCircle, Check, CloudOff, Loader2, PencilLine } from 'lucide-react'
import type { AutosaveStatus } from '../../../hooks/useProgramAutosave'
import { cn } from '../../../lib/cn'
import { WIZARD_STEP_LABEL, type WizardStepId } from '../../../lib/programPreview'

type StepperProps = {
  steps: WizardStepId[]
  current: WizardStepId
  /** Steps that may be opened; the rest render disabled. */
  reachable: (step: WizardStepId) => boolean
  onSelect: (step: WizardStepId) => void
}

/**
 * Three presentations of the same step list: a vertical rail on desktop, a scrollable row on tablets and a compact
 * "2 / 5" header on phones. Only one is displayed at a time, so assistive tech never hears the list twice.
 */
export function WizardStepper({ steps, current, reachable, onSelect }: StepperProps) {
  const currentIndex = steps.indexOf(current)
  const item = (step: WizardStepId, index: number, layout: 'vertical' | 'horizontal') => {
    const done = index < currentIndex
    const active = step === current
    const enabled = reachable(step)
    return (
      <li className={layout === 'horizontal' ? 'shrink-0' : undefined} key={step}>
        <button
          aria-current={active ? 'step' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl text-left text-sm font-semibold transition disabled:cursor-not-allowed',
            layout === 'vertical' ? 'min-h-12 px-3' : 'min-h-10 px-3',
            active ? 'bg-brand-50 text-brand-700' : enabled ? 'text-ink-body hover:bg-surface-muted' : 'text-ink-muted',
          )}
          disabled={!enabled}
          onClick={() => onSelect(step)}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
              active ? 'border-brand-600 bg-brand-600 text-white' : done ? 'border-brand-200 bg-white text-brand-600' : 'border-surface-border bg-white',
            )}
          >
            {done ? <Check size={14} /> : index + 1}
          </span>
          <span className="whitespace-nowrap">{WIZARD_STEP_LABEL[step]}</span>
          {done ? <span className="sr-only">(완료)</span> : null}
        </button>
      </li>
    )
  }

  return (
    <>
      <nav aria-label="프로그램 개설 단계" className="hidden lg:block">
        <ol className="space-y-1">{steps.map((step, index) => item(step, index, 'vertical'))}</ol>
      </nav>
      <nav aria-label="프로그램 개설 단계" className="hidden md:block lg:hidden">
        <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">{steps.map((step, index) => item(step, index, 'horizontal'))}</ol>
      </nav>
      <div className="md:hidden">
        <p className="text-xs font-semibold text-brand-700">
          {currentIndex + 1} / {steps.length} 단계
        </p>
        <label className="sr-only" htmlFor="wizard-step-select">
          단계 이동
        </label>
        <select
          className="mt-1 w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm font-semibold text-ink-strong"
          id="wizard-step-select"
          onChange={(event) => onSelect(event.target.value as WizardStepId)}
          value={current}
        >
          {steps.map((step, index) => (
            <option disabled={!reachable(step)} key={step} value={step}>
              {index + 1}. {WIZARD_STEP_LABEL[step]}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}

export function WizardProgress({ value }: { value: number }) {
  return (
    <div aria-hidden className="h-1 w-full bg-surface-muted">
      <div className="h-full bg-brand-600 transition-[width] duration-300" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  )
}

const timeLabel = (date: Date) => date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })

/** Live save state. Announced politely so screen-reader users know their work is kept without being interrupted. */
export function SaveIndicator({
  status,
  savedAt,
  error,
  fieldsProblem,
  hasDraft,
  onRetry,
}: {
  status: AutosaveStatus
  savedAt: Date | null
  error: string | null
  fieldsProblem: string | null
  hasDraft: boolean
  onRetry: () => void
}) {
  let icon = <PencilLine aria-hidden size={14} />
  let text = '이름을 입력하면 자동 저장됩니다'
  let tone = 'text-ink-muted'
  if (status === 'saving') {
    icon = <Loader2 aria-hidden className="animate-spin" size={14} />
    text = '저장 중…'
  } else if (status === 'error') {
    icon = <CloudOff aria-hidden size={14} />
    text = '저장하지 못했습니다'
    tone = 'text-danger-700'
  } else if (status === 'waiting') {
    text = hasDraft ? '변경사항 저장 대기 중' : '곧 임시저장합니다'
  } else if (fieldsProblem) {
    icon = <AlertCircle aria-hidden size={14} />
    text = '문항을 완성하면 지원서가 저장됩니다'
    tone = 'text-warning-700'
  } else if (status === 'saved' && hasDraft) {
    icon = <Check aria-hidden size={14} />
    text = savedAt ? `임시저장됨 · ${timeLabel(savedAt)}` : '임시저장됨'
    tone = 'text-success-700'
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p aria-live="polite" className={cn('flex min-w-0 items-center gap-1.5 text-xs font-semibold', tone)} role="status" title={error ?? undefined}>
        {icon}
        <span className="truncate">{text}</span>
      </p>
      {status === 'error' ? (
        <button className="shrink-0 text-xs font-bold text-brand-700 underline-offset-2 hover:underline" onClick={onRetry} type="button">
          다시 시도
        </button>
      ) : null}
    </div>
  )
}
