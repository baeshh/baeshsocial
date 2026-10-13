import type { ProgramFormValue } from '../../lib/programForm'
import { PROGRAM_STATUS_META } from '../../lib/programs'
import type { MemberUser } from '../../types/organization'
import type { ProgramStatus } from '../../types/program'
import { Input, Select, Textarea } from '../common/Input'

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
