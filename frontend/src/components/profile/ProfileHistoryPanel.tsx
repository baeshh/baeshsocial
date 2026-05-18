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
import type { ProfilePayload, ProgramEnrollmentStatus } from '../../types/profile'

type HistoryKind = 'certificate' | 'career' | 'award' | 'program'
type EditableHistoryKind = 'certificate' | 'career' | 'award'

type HistoryItem = {
  id: string
  kind: HistoryKind
  title: string
  meta: string
  date: string | null
  verified?: boolean
  program?: boolean
  enrollmentStatus?: ProgramEnrollmentStatus
  editable?: boolean
}

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

function kindLabel(kind: HistoryKind) {
  if (kind === 'certificate') {
    return '자격/수료'
  }
  if (kind === 'career') {
    return '경력'
  }
  if (kind === 'program') {
    return '프로그램 참여'
  }
  return '수상/성과'
}

function enrollmentStatusLabel(status: ProgramEnrollmentStatus) {
  switch (status) {
    case 'APPLIED':
      return '신청됨'
    case 'ENROLLED':
      return '수강 중'
    case 'COMPLETED':
      return '수료 완료'
    case 'REJECTED':
      return '반려'
    case 'WITHDRAWN':
      return '철회'
    default:
      return status
  }
}

function buildHistoryItems(data: ProfilePayload): HistoryItem[] {
  const programCertificateOpportunityIds = new Set(
    data.profile.certificates
      .filter((cert) => cert.source === 'PROGRAM' && cert.opportunityId)
      .map((cert) => cert.opportunityId as string),
  )

  const items: HistoryItem[] = [
    ...data.profile.certificates.map((item) => ({
      id: item.id,
      kind: 'certificate' as const,
      title: item.title,
      meta: item.issuer,
      date: item.issuedAt,
      verified: item.verified,
      program: item.source === 'PROGRAM',
      editable: item.source !== 'PROGRAM',
    })),
    ...data.profile.careers.map((item) => ({
      id: item.id,
      kind: 'career' as const,
      title: `${item.position} · ${item.company}`,
      meta: item.description ?? '경력 이력',
      date: item.startDate,
      editable: true,
    })),
    ...data.profile.awards.map((item) => ({
      id: item.id,
      kind: 'award' as const,
      title: item.title,
      meta: item.issuer ?? '수상 기록',
      date: item.awardedAt,
      editable: true,
    })),
    ...data.programEnrollments
      .filter((enrollment) => {
        if (enrollment.status !== 'COMPLETED') {
          return true
        }
        return !(
          enrollment.certificate?.verified ||
          programCertificateOpportunityIds.has(enrollment.opportunityId)
        )
      })
      .map((enrollment) => ({
        id: enrollment.id,
        kind: 'program' as const,
        title: enrollment.opportunity.title,
        meta: `${enrollment.opportunity.organization} · ${enrollmentStatusLabel(enrollment.status)}`,
        date: enrollment.completedAt ?? enrollment.enrolledAt ?? enrollment.appliedAt,
        program: true,
        enrollmentStatus: enrollment.status,
        verified: enrollment.status === 'COMPLETED' && Boolean(enrollment.certificate?.verified),
        editable: false,
      })),
  ]

  return items.sort((a, b) => {
    const aTime = a.date ? new Date(a.date).getTime() : 0
    const bTime = b.date ? new Date(b.date).getTime() : 0
    return bTime - aTime
  })
}

type ProfileHistoryPanelProps = {
  data: ProfilePayload
  token: string
  onUpdated: () => void
  readOnly?: boolean
}

export function ProfileHistoryPanel({ data, token, onUpdated, readOnly = false }: ProfileHistoryPanelProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add')
  const [editTarget, setEditTarget] = useState<{ kind: EditableHistoryKind; id: string } | null>(null)
  const [addKind, setAddKind] = useState<EditableHistoryKind>('certificate')
  const [certificateForm, setCertificateForm] = useState({
    title: '',
    issuer: '',
    issuedAt: '',
    credentialUrl: '',
  })
  const [careerForm, setCareerForm] = useState({
    company: '',
    position: '',
    startDate: '',
    endDate: '',
    description: '',
  })
  const [awardForm, setAwardForm] = useState({
    title: '',
    issuer: '',
    awardedAt: '',
    description: '',
  })

  const historyItems = buildHistoryItems(data)
  const activeKind = modalMode === 'edit' && editTarget ? editTarget.kind : addKind

  const resetForms = () => {
    setCertificateForm({ title: '', issuer: '', issuedAt: '', credentialUrl: '' })
    setCareerForm({ company: '', position: '', startDate: '', endDate: '', description: '' })
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
          issuedAt: emptyToNull(certificateForm.issuedAt),
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
          endDate: emptyToNull(careerForm.endDate),
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
          자격·경력·수상·Jobs 프로그램 참여를 하나의 이력으로 관리합니다. 프로그램 수료 시 인증 이력이 자동 반영됩니다.
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
        <div className="space-y-3">
          {historyItems.map((item) => (
            <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm" key={`${item.kind}-${item.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge tone="blue">{kindLabel(item.kind)}</Badge>
                    {item.kind === 'program' && item.enrollmentStatus ? (
                      <Badge tone={item.enrollmentStatus === 'COMPLETED' ? 'green' : 'purple'}>
                        {enrollmentStatusLabel(item.enrollmentStatus)}
                      </Badge>
                    ) : null}
                    {item.program && item.kind === 'certificate' ? (
                      <Badge tone="green">프로그램 수료</Badge>
                    ) : null}
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
                  {!readOnly && item.editable ? (
                    <Button
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => openEditModal(item.kind as EditableHistoryKind, item.id)}
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
          ))}
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
                  {kindLabel(kind)}
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-semibold text-ink-strong">
              {kindLabel(activeKind)}
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
              <Input
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
              <Input
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
