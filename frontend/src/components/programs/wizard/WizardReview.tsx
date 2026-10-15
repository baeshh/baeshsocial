import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ProgramFormValue } from '../../../lib/programForm'
import { WIZARD_STEP_LABEL, type ReviewItem, type WizardStepId } from '../../../lib/programPreview'
import {
  DELIVERY_MODE_LABEL,
  PROGRAM_CATEGORY_LABEL,
  PROGRAM_STATUS_META,
  PROGRAM_VISIBILITY_META,
  RECRUITMENT_MODE_META,
  formatAudiences,
  formatDateTime,
  formatPeriod,
  fromDateTimeInput,
  takesApplications,
} from '../../../lib/programs'
import type { ProgramStatus } from '../../../types/program'

function Section({ step, onEdit, children }: { step: WizardStepId; onEdit: (step: WizardStepId) => void; children: ReactNode }) {
  return (
    <section aria-labelledby={`review-${step}`} className="rounded-2xl border border-surface-border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-strong" id={`review-${step}`}>
          {WIZARD_STEP_LABEL[step]}
        </h3>
        <button
          aria-label={`${WIZARD_STEP_LABEL[step]} 수정`}
          className="min-h-9 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          onClick={() => onEdit(step)}
          type="button"
        >
          수정
        </button>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-ink-strong">{children}</dd>
    </div>
  )
}

function ItemList({ items, tone, onEdit }: { items: ReviewItem[]; tone: 'problem' | 'suggestion'; onEdit: (step: WizardStepId) => void }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item) => (
        <li className="flex flex-wrap items-center gap-x-2 text-sm" key={`${item.step}-${item.message}`}>
          <span className={tone === 'problem' ? 'text-danger-700' : 'text-ink-body'}>{item.message}</span>
          <button className="text-xs font-bold text-brand-700 hover:underline" onClick={() => onEdit(item.step)} type="button">
            {WIZARD_STEP_LABEL[item.step]} 단계로 이동
          </button>
        </li>
      ))}
    </ul>
  )
}

export function WizardReview({
  form,
  problems,
  suggestions,
  publishStatus,
  onEdit,
}: {
  form: ProgramFormValue
  problems: ReviewItem[]
  suggestions: ReviewItem[]
  publishStatus: ProgramStatus
  onEdit: (step: WizardStepId) => void
}) {
  const recruiting = takesApplications(form.recruitmentMode)
  const visibility = PROGRAM_VISIBILITY_META[form.visibility]
  const required = form.applicationFields.filter((field) => field.required).length
  const audience = formatAudiences({ audiences: form.audiences, targetAudience: form.targetAudience || null })

  return (
    <div className="space-y-5">
      {problems.length > 0 ? (
        <div className="rounded-2xl border border-danger-100 bg-danger-50 px-4 py-3" role="alert">
          <p className="flex items-center gap-2 text-sm font-bold text-danger-700">
            <AlertTriangle aria-hidden size={16} />
            게시하기 전에 {problems.length}가지를 해결해 주세요
          </p>
          <ItemList items={problems} onEdit={onEdit} tone="problem" />
        </div>
      ) : (
        <div className="rounded-2xl border border-success-100 bg-success-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-success-700">
            <CheckCircle2 aria-hidden size={16} />
            게시할 준비가 되었습니다
          </p>
          <p className="mt-1 text-sm text-ink-body">
            게시 후 운영 상태는 ‘{PROGRAM_STATUS_META[publishStatus].label}’입니다.
            {publishStatus === 'draft' ? ' 운영 시작일이 되면 설정에서 진행 중으로 바꿀 수 있습니다.' : ''}
            {recruiting
              ? visibility.listed
                ? ' 모집 공고가 Jobs에 바로 노출됩니다.'
                : ' 링크를 받은 사람만 공고를 보고 지원할 수 있습니다.'
              : ' 참여자 탭에서 명단을 등록하거나 초대를 보내세요.'}
          </p>
        </div>
      )}
      {suggestions.length > 0 ? (
        <div className="rounded-2xl border border-surface-border bg-surface-muted/60 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-strong">
            <Lightbulb aria-hidden className="text-warning-700" size={16} />
            확인해 보면 좋은 항목 (선택)
          </p>
          <ItemList items={suggestions} onEdit={onEdit} tone="suggestion" />
        </div>
      ) : null}

      <Section onEdit={onEdit} step="basics">
        <Row label="프로그램 이름">{form.title.trim() || '—'}</Row>
        <Row label="유형·기수">{[form.category ? PROGRAM_CATEGORY_LABEL[form.category] : null, form.term.trim() || null].filter(Boolean).join(' · ') || '—'}</Row>
        <Row label="운영 기간">{formatPeriod(form.startDate || null, form.endDate || null)}</Row>
        <Row label="진행 방식">{[form.deliveryMode ? DELIVERY_MODE_LABEL[form.deliveryMode] : null, form.location.trim() || null].filter(Boolean).join(' · ') || '—'}</Row>
      </Section>
      <Section onEdit={onEdit} step="recruitment">
        <Row label="참여자 확보 방식">{RECRUITMENT_MODE_META[form.recruitmentMode].label}</Row>
        <Row label="공개 범위">{visibility.label}</Row>
        <Row label="지원 대상">{audience ?? '제한 없음'}</Row>
        <Row label={form.recruitmentMode === 'mixed' ? '전체 정원' : '정원'}>{form.capacity ? `${form.capacity}명` : '미정'}</Row>
        {recruiting ? (
          <>
            <Row label="모집 기간">
              {form.applyStartAt ? formatDateTime(fromDateTimeInput(form.applyStartAt)) : '게시 즉시'} ~ {formatDateTime(fromDateTimeInput(form.applyEndAt))}
            </Row>
            <Row label="합격자 발표">{form.announceAt ? formatDateTime(fromDateTimeInput(form.announceAt)) : '—'}</Row>
          </>
        ) : null}
      </Section>
      {recruiting ? (
        <Section onEdit={onEdit} step="form">
          <Row label="문항">{form.applicationFields.length}개 (필수 {required}개)</Row>
          <Row label="질문 목록">{form.applicationFields.map((field) => field.label.trim()).filter(Boolean).join(', ') || '—'}</Row>
        </Section>
      ) : null}
    </div>
  )
}
