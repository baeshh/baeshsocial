import { Eye, Monitor, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../lib/cn'
import { PROGRAM_VISIBILITY_META } from '../../../lib/programs'
import { ProgramStatusCard } from '../../../pages/programs/ProgramPublicPage'
import type { DiscoverableProgram } from '../../../types/program'
import { ProgramApplicationForm } from '../ProgramApplicationForm'
import { ProgramCard } from '../ProgramCard'
import { ProgramPublicView, type ProgramViewLayout } from '../ProgramPublicView'

const noop = () => undefined

function initialDevice(): Exclude<ProgramViewLayout, 'auto'> {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : 'mobile'
}

/** The applicant-facing page rendered from the unsaved form, framed as a phone or a desktop window. */
export function WizardPreview({ program }: { program: DiscoverableProgram }) {
  const [device, setDevice] = useState(initialDevice)
  const visibility = PROGRAM_VISIBILITY_META[program.visibility]
  const recruiting = program.recruitment.mode === 'open' || program.recruitment.mode === 'mixed'
  const fieldsKey = (program.applicationFields ?? []).map((field) => `${field.id}:${field.type}`).join('|')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-ink-body">
          <Eye aria-hidden className="mt-0.5 shrink-0 text-brand-600" size={16} />
          <span>
            게시하면 학생에게 이 화면이 보입니다. 아직 게시 전이라 담당자만 볼 수 있습니다.
            <span className="block text-xs text-ink-muted">공개 범위: {visibility.label} — {visibility.description}</span>
          </span>
        </p>
        <div aria-label="미리보기 화면 크기" className="hidden shrink-0 rounded-xl border border-surface-border bg-white p-1 sm:flex" role="group">
          {(
            [
              { id: 'mobile', label: '모바일', icon: Smartphone },
              { id: 'desktop', label: 'PC', icon: Monitor },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              aria-pressed={device === id}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition',
                device === id ? 'bg-brand-600 text-white' : 'text-ink-body hover:bg-surface-muted',
              )}
              key={id}
              onClick={() => setDevice(id)}
              type="button"
            >
              <Icon aria-hidden size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <section aria-label="모집 공고 미리보기">
        <div
          className={cn(
            'mx-auto overflow-hidden border border-surface-border bg-surface-canvas shadow-card',
            device === 'mobile' ? 'max-w-[400px] rounded-[28px] sm:border-[6px] sm:border-ink-strong/80' : 'rounded-2xl',
          )}
          data-device={device}
        >
          {device === 'desktop' ? (
            <div aria-hidden className="flex items-center gap-1.5 border-b border-surface-border bg-white px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger-100" />
              <span className="h-2.5 w-2.5 rounded-full bg-warning-100" />
              <span className="h-2.5 w-2.5 rounded-full bg-success-100" />
              <span className="ml-3 truncate rounded-md bg-surface-muted px-3 py-0.5 text-xs text-ink-muted">baesh · 프로그램 모집</span>
            </div>
          ) : null}
          <div className={cn('max-h-[72vh] overflow-y-auto', device === 'mobile' ? 'p-4' : 'p-6')}>
            <ProgramPublicView
              apply={
                recruiting && (program.applicationFields?.length ?? 0) > 0 ? (
                  <ProgramApplicationForm key={fieldsKey} onChanged={noop} preview program={program} shareToken={null} token="" />
                ) : null
              }
              aside={<ProgramStatusCard onChanged={noop} program={program} signedIn />}
              heading="h2"
              layout={device}
              program={program}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="wizard-card-preview" className="space-y-2">
        <h3 className="text-sm font-bold text-ink-strong" id="wizard-card-preview">
          {visibility.listed ? 'Jobs 목록에 표시되는 카드' : '링크로 공유할 때 보이는 카드'}
        </h3>
        <div className="max-w-sm">
          <ProgramCard preview program={program} />
        </div>
      </section>
    </div>
  )
}
