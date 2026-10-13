import type { ProgramFormValue } from '../../lib/programForm'
import { DISCLOSURE_META, PROGRAM_STATUS_META } from '../../lib/programs'
import type { MemberUser } from '../../types/organization'
import type { ProgramPolicy, ProgramStatus, RecordDisclosure } from '../../types/program'
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

type Props = {
  value: ProgramFormValue
  onChange: (value: ProgramFormValue) => void
  managerCandidates?: MemberUser[]
  canEditManagers: boolean
}

export function ProgramFormFields({ value, onChange, managerCandidates = [], canEditManagers }: Props) {
  const set = <K extends keyof ProgramFormValue>(key: K, next: ProgramFormValue[K]) => onChange({ ...value, [key]: next })

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
        <Input label="시작일" onChange={(event) => set('startDate', event.target.value)} type="date" value={value.startDate} />
        <Input label="종료일" onChange={(event) => set('endDate', event.target.value)} type="date" value={value.endDate} />
      </div>
      <Textarea label="설명" maxLength={4000} onChange={(event) => set('description', event.target.value)} value={value.description} />
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
