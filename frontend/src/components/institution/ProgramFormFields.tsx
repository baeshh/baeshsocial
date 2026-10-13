import type { Dispatch, SetStateAction } from 'react'
import type { ProgramFormValue } from '../../lib/programForm'
import { DELIVERY_MODE_LABEL, DISCLOSURE_META, PROGRAM_STATUS_META, PROGRAM_VISIBILITY_META } from '../../lib/programs'
import type { MemberUser } from '../../types/organization'
import type { DeliveryMode, ProgramPolicy, ProgramStatus, ProgramVisibility, RecordDisclosure, RecruitmentMode } from '../../types/program'
import { Input, Select, Textarea } from '../common/Input'

const POLICY_TOGGLES: Array<{ key: Exclude<keyof ProgramPolicy, 'recordDisclosure'>; label: string; hint: string; requires?: keyof ProgramPolicy }> = [
  { key: 'allowStudentProjects', label: '학생이 프로젝트를 직접 만들거나 기존 프로젝트를 연결', hint: '끄면 담당자가 만든 프로젝트에 배정하는 방식만 사용합니다.' },
  {
    key: 'requireProjectApproval',
    label: '학생 프로젝트 등록 시 담당자 승인 필요',
    hint: '등록 승인은 프로그램 소속을 인정할 뿐, 성과 인증과는 별개입니다.',
    requires: 'allowStudentProjects',
  },
  { key: 'allowStudentTeams', label: '팀장이 참여 학생을 직접 초대해 팀 구성', hint: '이 프로그램 참여 학생만 초대할 수 있습니다.' },
  { key: 'allowMultipleProjects', label: '학생 1명이 여러 프로젝트에 참여 허용', hint: '끄면 학생은 이 프로그램에서 한 팀에만 속합니다.' },
  { key: 'allowPublicProjects', label: '프로젝트 전체 공개 허용', hint: '끄면 기존 전체 공개 프로젝트는 팀 공개로 바뀝니다.' },
]

function ProgramPolicyFields({ value, onChange }: { value: ProgramPolicy; onChange: (value: ProgramPolicy) => void }) {
  return (
    <fieldset className="rounded-2xl border border-surface-border p-4">
      <legend className="px-1 text-sm font-semibold text-ink-strong">운영 정책</legend>
      <div className="space-y-3">
        {POLICY_TOGGLES.map((toggle) => {
          const disabled = toggle.requires ? !value[toggle.requires] : false
          return (
            <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`} key={toggle.key}>
              <input
                checked={value[toggle.key]}
                className="mt-1 h-4 w-4 accent-brand-600"
                disabled={disabled}
                onChange={(event) => onChange({ ...value, [toggle.key]: event.target.checked })}
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-medium text-ink-strong">{toggle.label}</span>
                <span className="block text-xs text-ink-muted">{toggle.hint}</span>
              </span>
            </label>
          )
        })}
        <Select
          label="인증 기록 공개 상한"
          onChange={(event) => onChange({ ...value, recordDisclosure: event.target.value as RecordDisclosure })}
          value={value.recordDisclosure}
        >
          {(Object.keys(DISCLOSURE_META) as RecordDisclosure[]).map((key) => (
            <option key={key} value={key}>
              {DISCLOSURE_META[key].label} — {DISCLOSURE_META[key].description}
            </option>
          ))}
        </Select>
        <p className="text-xs text-ink-muted">학생은 이 범위 안에서 자신의 인증 기록을 얼마나 공개할지 직접 선택합니다.</p>
      </div>
    </fieldset>
  )
}

const RECRUITMENT_OPTIONS: Array<{ value: RecruitmentMode; label: string; hint: string }> = [
  { value: 'selected', label: '선발 완료', hint: '참여자를 이미 정했습니다. 담당자가 참여 학생 탭에서 직접 등록합니다.' },
  { value: 'recruiting', label: '모집 예정·모집 중', hint: '공개한 뒤 지원을 받고, 담당자가 지원자 탭에서 선발합니다.' },
]

function ChoiceCard({ checked, label, hint, onSelect, name }: { checked: boolean; label: string; hint: string; onSelect: () => void; name: string }) {
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-2xl border px-4 py-3 transition ${
        checked ? 'border-brand-600 bg-brand-50' : 'border-surface-border hover:border-brand-200'
      }`}
    >
      <span className="flex items-center gap-2">
        <input checked={checked} className="h-4 w-4 accent-brand-600" name={name} onChange={onSelect} type="radio" />
        <span className="text-sm font-semibold text-ink-strong">{label}</span>
      </span>
      <span className="mt-1 text-xs leading-5 text-ink-muted">{hint}</span>
    </label>
  )
}

function ProgramRecruitmentFields({ value, onChange }: { value: ProgramFormValue; onChange: Dispatch<SetStateAction<ProgramFormValue>> }) {
  const set = <K extends keyof ProgramFormValue>(key: K, next: ProgramFormValue[K]) => onChange((prev) => ({ ...prev, [key]: next }))
  const recruiting = value.recruitmentMode === 'recruiting'
  return (
    <fieldset className="space-y-4 rounded-2xl border border-surface-border p-4">
      <legend className="px-1 text-sm font-semibold text-ink-strong">공개 범위와 모집</legend>
      <div>
        <p className="text-sm font-medium text-ink-strong">공개 범위</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(PROGRAM_VISIBILITY_META) as ProgramVisibility[]).map((key) => (
            <ChoiceCard
              checked={value.visibility === key}
              hint={PROGRAM_VISIBILITY_META[key].description}
              key={key}
              label={PROGRAM_VISIBILITY_META[key].label}
              name="program-visibility"
              onSelect={() => set('visibility', key)}
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-ink-strong">선발 방식</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {RECRUITMENT_OPTIONS.map((option) => (
            <ChoiceCard
              checked={value.recruitmentMode === option.value}
              hint={option.hint}
              key={option.value}
              label={option.label}
              name="program-recruitment"
              onSelect={() => set('recruitmentMode', option.value)}
            />
          ))}
        </div>
        {recruiting && value.visibility === 'private' ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            비공개 프로그램에는 아무도 지원할 수 없습니다. 공개 범위를 조직 내부 공개 또는 전체 공개로 바꿔 주세요.
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="모집 대상"
          maxLength={500}
          onChange={(event) => set('targetAudience', event.target.value)}
          placeholder="예: 전공 무관 3~4학년 재학생"
          value={value.targetAudience}
        />
        <Input
          label="선발 인원"
          max={10000}
          min={1}
          onChange={(event) => set('capacity', event.target.value)}
          placeholder="예: 30"
          type="number"
          value={value.capacity}
        />
        <Select label="진행 방식" onChange={(event) => set('deliveryMode', event.target.value as DeliveryMode | '')} value={value.deliveryMode}>
          <option value="">선택 안 함</option>
          {(Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[]).map((key) => (
            <option key={key} value={key}>
              {DELIVERY_MODE_LABEL[key]}
            </option>
          ))}
        </Select>
        <Input
          label="장소"
          maxLength={200}
          onChange={(event) => set('location', event.target.value)}
          placeholder="예: 공학관 301호 / Zoom"
          value={value.location}
        />
      </div>
      {recruiting ? (
        <div className="grid gap-4 border-t border-surface-border pt-4 sm:grid-cols-3">
          <Input
            helperText="비우면 저장 즉시 모집을 시작합니다."
            label="모집 시작 일시"
            onChange={(event) => set('applyStartAt', event.target.value)}
            type="datetime-local"
            value={value.applyStartAt}
          />
          <Input label="모집 마감 일시" onChange={(event) => set('applyEndAt', event.target.value)} required type="datetime-local" value={value.applyEndAt} />
          <Input label="합격자 발표 일시" onChange={(event) => set('announceAt', event.target.value)} type="datetime-local" value={value.announceAt} />
          <div className="sm:col-span-3">
            <Textarea
              className="min-h-20"
              label="선발 절차"
              maxLength={2000}
              onChange={(event) => set('selectionProcess', event.target.value)}
              placeholder="예: 서류 심사 → 면접 → 최종 발표"
              value={value.selectionProcess}
            />
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}

type Props = {
  value: ProgramFormValue
  onChange: Dispatch<SetStateAction<ProgramFormValue>>
  managerCandidates?: MemberUser[]
  canEditManagers: boolean
}

export function ProgramFormFields({ value, onChange, managerCandidates = [], canEditManagers }: Props) {
  const set = <K extends keyof ProgramFormValue>(key: K, next: ProgramFormValue[K]) => onChange((prev) => ({ ...prev, [key]: next }))

  return (
    <div className="space-y-4">
      <Input
        label="프로그램 이름"
        maxLength={120}
        minLength={2}
        onChange={(event) => set('title', event.target.value)}
        placeholder="예: 2026 AI 캡스톤"
        required
        value={value.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="학기·기수" maxLength={40} onChange={(event) => set('term', event.target.value)} placeholder="2026-1" value={value.term} />
        <Select label="상태" onChange={(event) => set('status', event.target.value as ProgramStatus)} value={value.status}>
          {Object.entries(PROGRAM_STATUS_META).map(([status, meta]) => (
            <option key={status} value={status}>
              {meta.label}
            </option>
          ))}
        </Select>
        <Input label="운영 시작일" onChange={(event) => set('startDate', event.target.value)} type="date" value={value.startDate} />
        <Input label="운영 종료일" onChange={(event) => set('endDate', event.target.value)} type="date" value={value.endDate} />
      </div>
      <Textarea label="설명" maxLength={4000} onChange={(event) => set('description', event.target.value)} value={value.description} />
      <ProgramRecruitmentFields onChange={onChange} value={value} />
      <ProgramPolicyFields onChange={(policy) => set('policy', policy)} value={value.policy} />
      {canEditManagers ? (
        <fieldset>
          <legend className="text-sm font-semibold text-ink-strong">담당자 (교수·조교)</legend>
          <p className="mt-1 text-xs text-ink-muted">조직의 담당자(MANAGER) 이상만 지정할 수 있습니다. 담당자는 이 프로그램의 프로젝트·학생·증빙을 관리합니다.</p>
          {managerCandidates.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">지정할 수 있는 담당자가 없습니다. 구성원 탭에서 역할을 먼저 부여해 주세요.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {managerCandidates.map((candidate) => {
                const checked = value.managerUserIds.includes(candidate.id)
                return (
                  <label
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body hover:border-brand-200'
                    }`}
                    key={candidate.id}
                  >
                    <input
                      checked={checked}
                      className="sr-only"
                      onChange={() =>
                        set(
                          'managerUserIds',
                          checked ? value.managerUserIds.filter((id) => id !== candidate.id) : [...value.managerUserIds, candidate.id],
                        )
                      }
                      type="checkbox"
                    />
                    {candidate.name}
                  </label>
                )
              })}
            </div>
          )}
        </fieldset>
      ) : null}
    </div>
  )
}
