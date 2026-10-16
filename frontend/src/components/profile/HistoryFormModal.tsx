import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '../common/Button'
import { Input, Textarea } from '../common/Input'
import { Modal } from '../common/Modal'
import { saveHistoryItem, type EditableHistoryKind } from '../../services/profileService'
import { HISTORY_KIND_META } from '../../lib/profileFormat'

export type HistoryFormTarget = {
  kind: EditableHistoryKind
  id: string
  fields: Record<string, string | null>
} | null

type HistoryFormModalProps = {
  open: boolean
  token: string
  /** null: add mode. */
  target: HistoryFormTarget
  onClose: () => void
  onSaved: () => void
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const ADD_KINDS: EditableHistoryKind[] = ['career', 'award', 'certificate']

export function HistoryFormModal(props: HistoryFormModalProps) {
  if (!props.open) {
    return null
  }
  return <HistoryForm key={props.target?.id ?? 'new'} {...props} />
}

function HistoryForm({ open, token, target, onClose, onSaved }: HistoryFormModalProps) {
  const f = target?.fields ?? {}
  const [kind, setKind] = useState<EditableHistoryKind>(target?.kind ?? 'career')
  const [certificateForm, setCertificateForm] = useState({
    title: f.title ?? '',
    issuer: f.issuer ?? '',
    issuedAt: target?.kind === 'certificate' ? (f.issuedAt ?? '') : '',
    credentialUrl: f.credentialUrl ?? '',
    isInProgress: target?.kind === 'certificate' ? !f.issuedAt : false,
  })
  const [careerForm, setCareerForm] = useState({
    company: f.company ?? '',
    position: f.position ?? '',
    startDate: f.startDate ?? '',
    endDate: f.endDate ?? '',
    description: target?.kind === 'career' ? (f.description ?? '') : '',
    isCurrent: target?.kind === 'career' ? !f.endDate : false,
  })
  const [awardForm, setAwardForm] = useState({
    title: target?.kind === 'award' ? (f.title ?? '') : '',
    issuer: target?.kind === 'award' ? (f.issuer ?? '') : '',
    awardedAt: f.awardedAt ?? '',
    description: target?.kind === 'award' ? (f.description ?? '') : '',
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (kind === 'certificate') {
        return saveHistoryItem(
          token,
          kind,
          {
            title: certificateForm.title,
            issuer: certificateForm.issuer,
            issuedAt: certificateForm.isInProgress ? null : emptyToNull(certificateForm.issuedAt),
            credentialUrl: emptyToNull(certificateForm.credentialUrl),
          },
          target?.id,
        )
      }
      if (kind === 'career') {
        return saveHistoryItem(
          token,
          kind,
          {
            company: careerForm.company,
            position: careerForm.position,
            startDate: emptyToNull(careerForm.startDate),
            endDate: careerForm.isCurrent ? null : emptyToNull(careerForm.endDate),
            description: emptyToNull(careerForm.description),
          },
          target?.id,
        )
      }
      return saveHistoryItem(
        token,
        kind,
        {
          title: awardForm.title,
          issuer: emptyToNull(awardForm.issuer),
          awardedAt: emptyToNull(awardForm.awardedAt),
          description: emptyToNull(awardForm.description),
        },
        target?.id,
      )
    },
    onSuccess: () => {
      onSaved()
      onClose()
    },
  })

  return (
    <Modal
      description={target ? '이력 내용을 수정한 뒤 저장하세요.' : '직접 등록한 이력은 검증 성과와 구분되어 표시됩니다.'}
      onClose={onClose}
      open={open}
      title={target ? '이력 수정' : '이력 추가'}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          saveMutation.mutate()
        }}
      >
        {target ? (
          <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold text-ink-strong">
            {HISTORY_KIND_META[kind].label}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ADD_KINDS.map((option) => (
              <button
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  kind === option ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted hover:text-ink-strong'
                }`}
                key={option}
                onClick={() => setKind(option)}
                type="button"
              >
                {HISTORY_KIND_META[option].label}
              </button>
            ))}
          </div>
        )}

        {kind === 'certificate' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="자격/프로그램명"
              onChange={(event) => setCertificateForm((prev) => ({ ...prev, title: event.target.value }))}
              required
              value={certificateForm.title}
            />
            <Input
              label="발급기관"
              onChange={(event) => setCertificateForm((prev) => ({ ...prev, issuer: event.target.value }))}
              required
              value={certificateForm.issuer}
            />
            <label className="flex cursor-pointer items-center gap-2 md:col-span-2">
              <input
                checked={certificateForm.isInProgress}
                className="h-4 w-4 rounded border-surface-border text-brand-600"
                onChange={(event) =>
                  setCertificateForm((prev) => ({
                    ...prev,
                    isInProgress: event.target.checked,
                    issuedAt: event.target.checked ? '' : prev.issuedAt,
                  }))
                }
                type="checkbox"
              />
              <span className="text-sm font-medium text-ink-body">현재 진행 중 (취득 예정)</span>
            </label>
            <Input
              disabled={certificateForm.isInProgress}
              label="발급일"
              onChange={(event) => setCertificateForm((prev) => ({ ...prev, issuedAt: event.target.value }))}
              type="date"
              value={certificateForm.issuedAt}
            />
            <Input
              label="인증 링크"
              onChange={(event) => setCertificateForm((prev) => ({ ...prev, credentialUrl: event.target.value }))}
              type="url"
              value={certificateForm.credentialUrl}
            />
          </div>
        ) : null}

        {kind === 'career' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="회사·기관"
              onChange={(event) => setCareerForm((prev) => ({ ...prev, company: event.target.value }))}
              required
              value={careerForm.company}
            />
            <Input
              label="직무"
              onChange={(event) => setCareerForm((prev) => ({ ...prev, position: event.target.value }))}
              required
              value={careerForm.position}
            />
            <Input
              label="시작일"
              onChange={(event) => setCareerForm((prev) => ({ ...prev, startDate: event.target.value }))}
              type="date"
              value={careerForm.startDate}
            />
            <Input
              disabled={careerForm.isCurrent}
              label="종료일"
              onChange={(event) => setCareerForm((prev) => ({ ...prev, endDate: event.target.value }))}
              type="date"
              value={careerForm.endDate}
            />
            <label className="flex cursor-pointer items-center gap-2 md:col-span-2">
              <input
                checked={careerForm.isCurrent}
                className="h-4 w-4 rounded border-surface-border text-brand-600"
                onChange={(event) =>
                  setCareerForm((prev) => ({
                    ...prev,
                    isCurrent: event.target.checked,
                    endDate: event.target.checked ? '' : prev.endDate,
                  }))
                }
                type="checkbox"
              />
              <span className="text-sm font-medium text-ink-body">현재 재직·활동 중</span>
            </label>
            <Textarea
              className="md:col-span-2"
              label="주요 업무·성과"
              onChange={(event) => setCareerForm((prev) => ({ ...prev, description: event.target.value }))}
              value={careerForm.description}
            />
          </div>
        ) : null}

        {kind === 'award' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="수상명"
              onChange={(event) => setAwardForm((prev) => ({ ...prev, title: event.target.value }))}
              required
              value={awardForm.title}
            />
            <Input
              label="주최/발급기관"
              onChange={(event) => setAwardForm((prev) => ({ ...prev, issuer: event.target.value }))}
              value={awardForm.issuer}
            />
            <Input
              label="수상일"
              onChange={(event) => setAwardForm((prev) => ({ ...prev, awardedAt: event.target.value }))}
              type="date"
              value={awardForm.awardedAt}
            />
            <Textarea
              className="md:col-span-2"
              label="설명"
              onChange={(event) => setAwardForm((prev) => ({ ...prev, description: event.target.value }))}
              value={awardForm.description}
            />
          </div>
        ) : null}

        {saveMutation.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {saveMutation.error.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? '저장 중…' : target ? '수정 저장' : '이력 저장'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
