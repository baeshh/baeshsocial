import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { CheckCircle2, Pencil, Plus } from 'lucide-react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Input, Textarea } from '../common/Input'
import { Modal } from '../common/Modal'
import { Link } from 'react-router-dom'
import {
  addAward,
  addCareer,
  addCertificate,
  updateAward,
  updateCareer,
  updateCertificate,
} from '../../services/profileService'
import {
  buildProfileHistoryItems,
  filterHistoryByCategory,
  groupProfileHistoryByCategory,
  HISTORY_CATEGORY_META,
  type HistoryCategory,
  type ProfileHistoryItem,
} from '../../lib/profileHistory'
import type { ProfilePayload } from '../../types/profile'

type EditableHistoryKind = 'certificate' | 'career' | 'award'

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toFormDate(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

function formatDate(value: string | null) {
  if (!value) {
    return '날짜 없음'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function addKindLabel(kind: EditableHistoryKind) {
  return HISTORY_CATEGORY_META[kind === 'award' ? 'award' : kind === 'career' ? 'career' : 'certificate']
    .label
}

function enrollmentStatusLabel(status: ProfileHistoryItem['enrollmentStatus']) {
  if (status === 'ENROLLED') return '선정 · 수강 중'
  if (status === 'COMPLETED') return '수료 완료'
  return status ?? ''
}

type ProfileHistoryPanelProps = {
  data: ProfilePayload
  token: string
  onUpdated: () => void
  readOnly?: boolean
}

function HistoryItemCard({
  item,
  readOnly,
  onEdit,
}: {
  item: ProfileHistoryItem
  readOnly: boolean
  onEdit: (kind: EditableHistoryKind, id: string) => void
}) {
  const meta = HISTORY_CATEGORY_META[item.category]

  return (
    <div
      className="rounded-xl border border-surface-border bg-white p-4 shadow-sm"
      key={`${item.sourceKind}-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge tone={meta.badgeTone}>{item.categoryLabel}</Badge>
            {item.sourceKind === 'program' && item.enrollmentStatus ? (
              <Badge tone={item.enrollmentStatus === 'COMPLETED' ? 'green' : 'purple'}>
                {enrollmentStatusLabel(item.enrollmentStatus)}
              </Badge>
            ) : null}
            {item.program && item.sourceKind === 'certificate' ? (
              <Badge tone="green">프로그램 수료</Badge>
            ) : null}
            {item.ongoing ? <Badge tone="green">현재 진행 중</Badge> : null}
          </div>
          <p className="font-bold text-ink-strong">{item.title}</p>
          <p className="mt-1 text-sm text-ink-muted">{item.meta}</p>
          <p className="mt-2 text-xs font-semibold text-brand-600">{formatDate(item.date)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {item.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              <CheckCircle2 size={14} />
              Verified
            </span>
          ) : null}
          {!readOnly && item.editable && item.editKind && item.editId ? (
            <Button
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => onEdit(item.editKind!, item.editId!)}
              type="button"
              variant="ghost"
            >
              <Pencil className="mr-1" size={14} />
              수정
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function ProfileHistoryPanel({ data, token, onUpdated, readOnly = false }: ProfileHistoryPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<HistoryCategory | 'all'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [editTarget, setEditTarget] = useState<{ kind: EditableHistoryKind; id: string } | null>(null)
  const [addKind, setAddKind] = useState<EditableHistoryKind>('certificate')
  const [certificateForm, setCertificateForm] = useState({
    title: '',
    issuer: '',
    issuedAt: '',
    credentialUrl: '',
    isInProgress: false,
  })
  const [careerForm, setCareerForm] = useState({
    company: '',
    position: '',
    startDate: '',
    endDate: '',
    description: '',
    isCurrent: false,
  })
  const [awardForm, setAwardForm] = useState({
    title: '',
    issuer: '',
    awardedAt: '',
    description: '',
  })

  const historyItems = buildProfileHistoryItems(data)
  const categoryGroups = groupProfileHistoryByCategory(historyItems)
  const visibleItems = filterHistoryByCategory(historyItems, categoryFilter)
  const activeKind = modalMode === 'edit' && editTarget ? editTarget.kind : addKind

  const filterChips: { id: HistoryCategory | 'all'; label: string; count: number }[] = [
    { id: 'all', label: '전체', count: historyItems.length },
    ...categoryGroups.map((group) => ({
      id: group.category,
      label: group.label,
      count: group.items.length,
    })),
  ]

  const resetForms = () => {
    setCertificateForm({ title: '', issuer: '', issuedAt: '', credentialUrl: '', isInProgress: false })
    setCareerForm({
      company: '',
      position: '',
      startDate: '',
      endDate: '',
      description: '',
      isCurrent: false,
    })
    setAwardForm({ title: '', issuer: '', awardedAt: '', description: '' })
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditTarget(null)
    setModalMode('add')
    setAddKind('certificate')
    resetForms()
    saveMutation.reset()
  }

  const openAddModal = () => {
    resetForms()
    setModalMode('add')
    setEditTarget(null)
    setAddKind('certificate')
    setModalOpen(true)
  }

  const openEditModal = (kind: EditableHistoryKind, id: string) => {
    if (kind === 'certificate') {
      const certificate = data.profile.certificates.find((item) => item.id === id)
      if (!certificate || certificate.source === 'PROGRAM') {
        return
      }
      setCertificateForm({
        title: certificate.title,
        issuer: certificate.issuer,
        issuedAt: toFormDate(certificate.issuedAt),
        credentialUrl: certificate.credentialUrl ?? '',
        isInProgress: !certificate.issuedAt,
      })
    } else if (kind === 'career') {
      const career = data.profile.careers.find((item) => item.id === id)
      if (!career) {
        return
      }
      setCareerForm({
        company: career.company,
        position: career.position,
        startDate: toFormDate(career.startDate),
        endDate: toFormDate(career.endDate),
        description: career.description ?? '',
        isCurrent: !career.endDate,
      })
    } else {
      const award = data.profile.awards.find((item) => item.id === id)
      if (!award) {
        return
      }
      setAwardForm({
        title: award.title,
        issuer: award.issuer ?? '',
        awardedAt: toFormDate(award.awardedAt),
        description: award.description ?? '',
      })
    }

    setModalMode('edit')
    setEditTarget({ kind, id })
    setModalOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const kind = modalMode === 'edit' && editTarget ? editTarget.kind : addKind

      if (kind === 'certificate') {
        const payload = {
          title: certificateForm.title,
          issuer: certificateForm.issuer,
          issuedAt: certificateForm.isInProgress ? null : emptyToNull(certificateForm.issuedAt),
          credentialUrl: emptyToNull(certificateForm.credentialUrl),
        }
        if (modalMode === 'edit' && editTarget) {
          await updateCertificate(token, editTarget.id, payload)
          return
        }
        await addCertificate(token, payload)
        return
      }

      if (kind === 'career') {
        const payload = {
          company: careerForm.company,
          position: careerForm.position,
          startDate: emptyToNull(careerForm.startDate),
          endDate: careerForm.isCurrent ? null : emptyToNull(careerForm.endDate),
          description: emptyToNull(careerForm.description),
        }
        if (modalMode === 'edit' && editTarget) {
          await updateCareer(token, editTarget.id, payload)
          return
        }
        await addCareer(token, payload)
        return
      }

      const payload = {
        title: awardForm.title,
        issuer: emptyToNull(awardForm.issuer),
        awardedAt: emptyToNull(awardForm.awardedAt),
        description: emptyToNull(awardForm.description),
      }
      if (modalMode === 'edit' && editTarget) {
        await updateAward(token, editTarget.id, payload)
        return
      }
      await addAward(token, payload)
    },
    onSuccess: () => {
      closeModal()
      onUpdated()
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          수상·프로그램·사업·프로젝트·경력이 유형별로 자동 분류됩니다. Jobs 선정·수료와 검증된 프로젝트도
          함께 반영됩니다.
        </p>
        {readOnly ? null : (
          <Button className="rounded-full" onClick={openAddModal} type="button" variant="secondary">
            <Plus className="mr-1" size={16} />
            이력 추가
          </Button>
        )}
      </div>

      {historyItems.length === 0 ? (
        <div className="rounded-xl bg-surface-muted px-4 py-10 text-center text-sm text-ink-muted">
          <p>
            {readOnly
              ? '등록된 이력이 없습니다.'
              : '등록된 이력이 없습니다. 이력 추가 또는 Jobs 프로그램 수강으로 기록을 남겨보세요.'}
          </p>
          {readOnly ? null : (
            <Link className="mt-4 inline-block font-semibold text-brand-600 hover:underline" to="/opportunities">
              Jobs에서 프로그램 찾기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterChips.map((chip) => (
              <button
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  categoryFilter === chip.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-surface-border bg-white text-ink-body'
                }`}
                key={chip.id}
                onClick={() => setCategoryFilter(chip.id)}
                type="button"
              >
                {chip.label}
                <span className="ml-1 text-ink-muted">({chip.count})</span>
              </button>
            ))}
          </div>

          {categoryFilter === 'all' ? (
            <div className="space-y-6">
              {categoryGroups.map((group) => (
                <section key={group.category}>
                  <div className="mb-3 border-b border-surface-border pb-2">
                    <h3 className="text-sm font-bold text-ink-strong">{group.label}</h3>
                    <p className="mt-0.5 text-xs text-ink-muted">{group.description}</p>
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <HistoryItemCard
                        item={item}
                        key={`${item.sourceKind}-${item.id}`}
                        onEdit={openEditModal}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-muted">
                {HISTORY_CATEGORY_META[categoryFilter].description}
              </p>
              {visibleItems.map((item) => (
                <HistoryItemCard
                  item={item}
                  key={`${item.sourceKind}-${item.id}`}
                  onEdit={openEditModal}
                  readOnly={readOnly}
                />
              ))}
            </div>
          )}
          {!readOnly ? (
            <Link className="inline-block text-sm font-semibold text-brand-600 hover:underline" to="/opportunities">
              Jobs에서 프로그램 찾기 →
            </Link>
          ) : null}
        </div>
      )}

      <Modal
        description={
          modalMode === 'edit'
            ? '이력 내용을 수정한 뒤 저장하세요.'
            : '추가할 이력 유형을 선택하고 내용을 입력하세요.'
        }
        onClose={closeModal}
        open={modalOpen}
        title={modalMode === 'edit' ? '이력 수정' : '이력 추가'}
        wide
      >
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            saveMutation.mutate()
          }}
        >
          {modalMode === 'add' ? (
            <div className="flex flex-wrap gap-2">
              {(['certificate', 'career', 'award'] as EditableHistoryKind[]).map((kind) => (
                <button
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    addKind === kind
                      ? 'bg-brand-600 text-white'
                      : 'bg-surface-muted text-ink-muted hover:text-ink-strong'
                  }`}
                  key={kind}
                  onClick={() => setAddKind(kind)}
                  type="button"
                >
                  {addKindLabel(kind)}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold text-ink-strong">
              {addKindLabel(activeKind)}
            </p>
          )}

          {activeKind === 'certificate' ? (
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
                helperText={certificateForm.isInProgress ? '진행 중이면 발급일을 비워 둡니다.' : undefined}
                label="발급일"
                onChange={(event) => setCertificateForm((prev) => ({ ...prev, issuedAt: event.target.value }))}
                type="date"
                value={certificateForm.issuedAt}
              />
              <Input
                label="인증 링크"
                onChange={(event) =>
                  setCertificateForm((prev) => ({ ...prev, credentialUrl: event.target.value }))
                }
                type="url"
                value={certificateForm.credentialUrl}
              />
            </div>
          ) : null}

          {activeKind === 'career' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="회사"
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
                <span className="text-sm font-medium text-ink-body">현재 진행 중 (재직 중)</span>
              </label>
              <Input
                disabled={careerForm.isCurrent}
                helperText={careerForm.isCurrent ? '진행 중이면 종료일을 비워 둡니다.' : undefined}
                label="종료일"
                onChange={(event) => setCareerForm((prev) => ({ ...prev, endDate: event.target.value }))}
                type="date"
                value={careerForm.endDate}
              />
              <Textarea
                className="md:col-span-2"
                label="설명"
                onChange={(event) => setCareerForm((prev) => ({ ...prev, description: event.target.value }))}
                value={careerForm.description}
              />
            </div>
          ) : null}

          {activeKind === 'award' ? (
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
            <Button onClick={closeModal} type="button" variant="secondary">
              취소
            </Button>
            <Button disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? '저장 중…' : modalMode === 'edit' ? '수정 저장' : '이력 저장'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
