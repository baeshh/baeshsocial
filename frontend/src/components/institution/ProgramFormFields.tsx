import { ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { ProgramFormValue } from '../../lib/programForm'
import {
  DELIVERY_MODE_LABEL,
  DISCLOSURE_META,
  PROGRAM_AUDIENCE_LABEL,
  PROGRAM_BENEFIT_LABEL,
  PROGRAM_CATEGORY_LABEL,
  PROGRAM_STATUS_META,
  PROGRAM_VISIBILITY_META,
  RECRUITMENT_MODE_META,
  takesApplications,
} from '../../lib/programs'
import { uploadMedia } from '../../services/mediaService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { MemberUser } from '../../types/organization'
import type {
  DeliveryMode,
  ProgramAudience,
  ProgramBenefit,
  ProgramCategory,
  ProgramPolicy,
  ProgramStatus,
  ProgramVisibility,
  RecordDisclosure,
  RecruitmentMode,
} from '../../types/program'
import { Input, Select, Textarea } from '../common/Input'

type SectionProps = { value: ProgramFormValue; onChange: Dispatch<SetStateAction<ProgramFormValue>> }

const setter =
  (onChange: SectionProps['onChange']) =>
  <K extends keyof ProgramFormValue>(key: K, next: ProgramFormValue[K]) =>
    onChange((prev) => ({ ...prev, [key]: next }))

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item])

export function ChoiceCard({
  checked,
  label,
  hint,
  onSelect,
  name,
  badge,
  disabled = false,
}: {
  checked: boolean
  label: string
  hint: string
  onSelect: () => void
  name: string
  badge?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={`flex flex-col rounded-2xl border px-4 py-3 transition ${
        disabled
          ? 'cursor-not-allowed border-surface-border opacity-50'
          : checked
            ? 'cursor-pointer border-brand-600 bg-brand-50'
            : 'cursor-pointer border-surface-border hover:border-brand-200'
      }`}
    >
      <span className="flex items-center gap-2">
        <input checked={checked} className="h-4 w-4 accent-brand-600" disabled={disabled} name={name} onChange={onSelect} type="radio" />
        <span className="text-sm font-semibold text-ink-strong">{label}</span>
        {badge}
      </span>
      <span className="mt-1 text-xs leading-5 text-ink-muted">{hint}</span>
    </label>
  )
}

function ChipGroup<T extends string>({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string
  hint?: string
  options: Record<T, string>
  selected: T[]
  onToggle: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-strong">{label}</legend>
      {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((key) => {
          const checked = selected.includes(key)
          return (
            <label
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body hover:border-brand-200'
              }`}
              key={key}
            >
              <input checked={checked} className="sr-only" onChange={() => onToggle(key)} type="checkbox" />
              {options[key]}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

function CoverImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const token = useAuthStore((state) => state.token)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const upload = async (file: File | undefined) => {
    if (!file || !token) return
    setUploading(true)
    try {
      const media = await uploadMedia(token, file, 'cover')
      onChange(media.url)
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <div>
      <p className="text-sm font-medium text-ink-strong">대표 이미지</p>
      <p className="mt-0.5 text-xs text-ink-muted">Jobs 카드와 모집 공고 상단에 표시됩니다. 가로로 긴 이미지(16:9)를 권장합니다.</p>
      <div className="mt-2 flex items-center gap-3">
        {value ? (
          <img alt="대표 이미지" className="h-20 w-36 rounded-xl border border-surface-border object-cover" src={value} />
        ) : (
          <div className="flex h-20 w-36 items-center justify-center rounded-xl border border-dashed border-surface-border text-ink-muted">
            <ImagePlus size={20} />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <button
            className="rounded-full border border-surface-border px-3 py-1.5 text-sm font-medium text-ink-strong hover:border-brand-200 disabled:opacity-50"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {uploading ? '올리는 중…' : value ? '이미지 바꾸기' : '이미지 올리기'}
          </button>
          {value ? (
            <button className="text-left text-xs font-medium text-red-600" onClick={() => onChange('')} type="button">
              이미지 삭제
            </button>
          ) : null}
        </div>
        <input accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} ref={inputRef} type="file" />
      </div>
    </div>
  )
}

export function ManagersField({
  value,
  onChange,
  candidates,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  candidates: MemberUser[]
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-strong">담당자</legend>
      <p className="mt-0.5 text-xs text-ink-muted">조직의 담당자(MANAGER) 이상만 지정할 수 있습니다. 지원자 심사와 참여자·프로젝트·증빙 관리를 맡습니다.</p>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">지정할 수 있는 담당자가 없습니다. 구성원 탭에서 역할을 먼저 부여해 주세요.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {candidates.map((candidate) => {
            const checked = value.includes(candidate.id)
            return (
              <label
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body hover:border-brand-200'
                }`}
                key={candidate.id}
              >
                <input checked={checked} className="sr-only" onChange={() => onChange(toggle(value, candidate.id))} type="checkbox" />
                {candidate.name}
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

/** Step 1 — 어떤 프로그램인가요? */
export function ProgramBasicsFields({
  value,
  onChange,
  showStatus = false,
  managers,
}: SectionProps & { showStatus?: boolean; managers?: ReactNode }) {
  const set = setter(onChange)
  return (
    <div className="space-y-4">
      <Input
        label="프로그램 이름"
        maxLength={120}
        minLength={2}
        onChange={(event) => set('title', event.target.value)}
        placeholder="예: 2026 AI 창업 인재양성 프로그램"
        required
        value={value.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="프로그램 유형" onChange={(event) => set('category', event.target.value as ProgramCategory | '')} value={value.category}>
          <option value="">선택해 주세요</option>
          {(Object.keys(PROGRAM_CATEGORY_LABEL) as ProgramCategory[]).map((key) => (
            <option key={key} value={key}>
              {PROGRAM_CATEGORY_LABEL[key]}
            </option>
          ))}
        </Select>
        <Input label="기수·회차 (선택)" maxLength={40} onChange={(event) => set('term', event.target.value)} placeholder="예: 3기, 2026 하반기, 2026-2학기" value={value.term} />
      </div>
      <Textarea
        className="min-h-28"
        label="프로그램 소개"
        maxLength={4000}
        onChange={(event) => set('description', event.target.value)}
        placeholder="무엇을 하는 프로그램인지, 참여하면 무엇을 얻는지 적어 주세요."
        value={value.description}
      />
      <CoverImageField onChange={(url) => set('coverImageUrl', url)} value={value.coverImageUrl} />
      <div className="grid gap-4 border-t border-surface-border pt-4 sm:grid-cols-2">
        <Input
          helperText="모집 기간과 별개로, 실제 프로그램이 진행되는 기간입니다."
          label="운영 시작일"
          onChange={(event) => set('startDate', event.target.value)}
          type="date"
          value={value.startDate}
        />
        <Input label="운영 종료일" onChange={(event) => set('endDate', event.target.value)} type="date" value={value.endDate} />
        <Select label="진행 방식" onChange={(event) => set('deliveryMode', event.target.value as DeliveryMode | '')} value={value.deliveryMode}>
          <option value="">선택 안 함</option>
          {(Object.keys(DELIVERY_MODE_LABEL) as DeliveryMode[]).map((key) => (
            <option key={key} value={key}>
              {DELIVERY_MODE_LABEL[key]}
            </option>
          ))}
        </Select>
        <Input label="장소·지역" maxLength={200} onChange={(event) => set('location', event.target.value)} placeholder="예: 대구 창업지원단 / Zoom" value={value.location} />
        {showStatus ? (
          <Select label="운영 상태" onChange={(event) => set('status', event.target.value as ProgramStatus)} value={value.status}>
            {Object.entries(PROGRAM_STATUS_META).map(([status, meta]) => (
              <option key={status} value={status}>
                {meta.label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <div className="space-y-3 border-t border-surface-border pt-4">
        <ChipGroup
          label="참여 혜택"
          onToggle={(benefit: ProgramBenefit) => set('benefits', toggle(value.benefits, benefit))}
          options={PROGRAM_BENEFIT_LABEL}
          selected={value.benefits}
        />
        <Input
          label="기타 혜택 (선택)"
          maxLength={1000}
          onChange={(event) => set('benefitsNote', event.target.value)}
          placeholder="예: 우수팀 시상금 500만 원, 투자사 데모데이 참가"
          value={value.benefitsNote}
        />
      </div>
      {managers ? <div className="border-t border-surface-border pt-4">{managers}</div> : null}
    </div>
  )
}

const GRADE_OPTIONS = [1, 2, 3, 4, 5, 6]
const STUDENT_AUDIENCES: ProgramAudience[] = ['high_school', 'undergraduate', 'graduate']

/** Step 2 — 참여자를 어떻게 모집하나요? */
export function ProgramRecruitmentFields({ value, onChange, lockMode = false }: SectionProps & { lockMode?: boolean }) {
  const set = setter(onChange)
  const recruiting = takesApplications(value.recruitmentMode)
  const eligibility = value.eligibility
  const hasConditions = Boolean(
    eligibility.schools || eligibility.grades.length || eligibility.majors || eligibility.regions || eligibility.requirements,
  )
  const [showConditions, setShowConditions] = useState(hasConditions)
  const showGrades = eligibility.grades.length > 0 || value.audiences.some((audience) => STUDENT_AUDIENCES.includes(audience))
  const setEligibility = (patch: Partial<typeof eligibility>) => onChange((prev) => ({ ...prev, eligibility: { ...prev.eligibility, ...patch } }))

  return (
    <div className="space-y-5">
      {lockMode ? null : (
        <div>
          <p className="text-sm font-medium text-ink-strong">참여자 확보 방식</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(RECRUITMENT_MODE_META) as RecruitmentMode[]).map((mode) => (
              <ChoiceCard
                checked={value.recruitmentMode === mode}
                hint={RECRUITMENT_MODE_META[mode].description}
                key={mode}
                label={RECRUITMENT_MODE_META[mode].label}
                name="program-recruitment"
                onSelect={() => set('recruitmentMode', mode)}
              />
            ))}
          </div>
        </div>
      )}

      <ChipGroup
        hint="해당하는 대상을 모두 고르세요."
        label="지원 대상"
        onToggle={(audience: ProgramAudience) => set('audiences', toggle(value.audiences, audience))}
        options={PROGRAM_AUDIENCE_LABEL}
        selected={value.audiences}
      />
      <Input
        label="대상 설명 (선택)"
        maxLength={500}
        onChange={(event) => set('targetAudience', event.target.value)}
        placeholder="예: 예비 창업자, 창업 3년 이내 대표 포함"
        value={value.targetAudience}
      />

      <div className="rounded-2xl border border-surface-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink-strong">지원 조건</p>
            <p className="text-xs text-ink-muted">필요한 조건만 입력하세요. 비워 둔 조건은 공고에 표시되지 않습니다.</p>
          </div>
          {showConditions ? null : (
            <button className="shrink-0 text-sm font-semibold text-brand-600" onClick={() => setShowConditions(true)} type="button">
              조건 추가
            </button>
          )}
        </div>
        {showConditions ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Input
              label="소속 (학교·회사·기관)"
              maxLength={300}
              onChange={(event) => setEligibility({ schools: event.target.value })}
              placeholder="예: 대구·경북 소재 대학 또는 기업"
              value={eligibility.schools}
            />
            <Input
              label="전공·직무 분야"
              maxLength={300}
              onChange={(event) => setEligibility({ majors: event.target.value })}
              placeholder="예: 무관 / 개발·디자인 직군"
              value={eligibility.majors}
            />
            <Input
              label="지역 (거주·근무)"
              maxLength={300}
              onChange={(event) => setEligibility({ regions: event.target.value })}
              placeholder="예: 대구·경북 거주 또는 근무"
              value={eligibility.regions}
            />
            {showGrades ? (
            <fieldset>
              <legend className="text-sm font-medium text-ink-strong">학년 (학생 대상)</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GRADE_OPTIONS.map((grade) => {
                  const checked = eligibility.grades.includes(grade)
                  return (
                    <label
                      className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition ${
                        checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body'
                      }`}
                      key={grade}
                    >
                      <input checked={checked} className="sr-only" onChange={() => setEligibility({ grades: toggle(eligibility.grades, grade) })} type="checkbox" />
                      {grade}학년
                    </label>
                  )
                })}
              </div>
            </fieldset>
            ) : null}
            <div className="sm:col-span-2">
              <Textarea
                className="min-h-16"
                label="자격 요건"
                maxLength={1000}
                onChange={(event) => setEligibility({ requirements: event.target.value })}
                placeholder="예: 관련 경력 2년 이상, 팀 단위(2~4인) 지원, 사업자 등록 3년 이내"
                value={eligibility.requirements}
              />
            </div>
          </div>
        ) : null}
      </div>

      <Input
        helperText={
          value.recruitmentMode === 'mixed'
            ? '기선발 인원을 포함한 전체 정원입니다. 남은 자리가 추가 모집 인원으로 표시됩니다.'
            : '실제 참여 인원과 별도로 관리됩니다. 정원이 차면 더 선발할 수 없습니다.'
        }
        label={value.recruitmentMode === 'mixed' ? '전체 정원' : '정원 (선발 인원)'}
        max={10000}
        min={1}
        onChange={(event) => set('capacity', event.target.value)}
        placeholder="예: 30"
        required={value.recruitmentMode === 'mixed'}
        type="number"
        value={value.capacity}
      />

      {recruiting ? (
        <div className="grid gap-4 rounded-2xl border border-surface-border p-4 sm:grid-cols-3">
          <Input
            helperText="비우면 게시하는 즉시 모집을 시작합니다."
            label="모집 시작 일시"
            onChange={(event) => set('applyStartAt', event.target.value)}
            type="datetime-local"
            value={value.applyStartAt}
          />
          <Input label="모집 마감 일시" onChange={(event) => set('applyEndAt', event.target.value)} required type="datetime-local" value={value.applyEndAt} />
          <Input
            helperText="이 시각이 지나면 '선발 완료'로 표시됩니다."
            label="합격자 발표 일시"
            onChange={(event) => set('announceAt', event.target.value)}
            type="datetime-local"
            value={value.announceAt}
          />
          <div className="sm:col-span-3">
            <Textarea
              className="min-h-20"
              label="선발 방식·절차"
              maxLength={2000}
              onChange={(event) => set('selectionProcess', event.target.value)}
              placeholder="예: 서류 심사 → 면접 → 최종 발표"
              value={value.selectionProcess}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-body">
          {value.recruitmentMode === 'invite'
            ? '프로그램을 만든 뒤 참여자 탭에서 이메일 또는 CSV로 초대를 보냅니다. 초대를 수락한 사람만 참여자로 등록됩니다.'
            : '프로그램을 만든 뒤 참여자 탭에서 선발된 명단을 이메일 또는 CSV로 등록합니다. 별도의 모집 공고나 지원서는 필요 없습니다.'}
        </p>
      )}
    </div>
  )
}

/** Step 4 — 누가 볼 수 있게 할까요? */
export function ProgramVisibilityFields({ value, onChange, blockPrivate = false }: SectionProps & { blockPrivate?: boolean }) {
  const set = setter(onChange)
  const recruiting = takesApplications(value.recruitmentMode)
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(PROGRAM_VISIBILITY_META) as ProgramVisibility[]).map((key) => (
          <ChoiceCard
            checked={value.visibility === key}
            disabled={blockPrivate && recruiting && key === 'private'}
            hint={
              blockPrivate && recruiting && key === 'private'
                ? '지원서를 받는 프로그램은 내부 전용으로 둘 수 없습니다.'
                : PROGRAM_VISIBILITY_META[key].description
            }
            key={key}
            label={PROGRAM_VISIBILITY_META[key].label}
            name="program-visibility"
            onSelect={() => set('visibility', key)}
          />
        ))}
      </div>
      {recruiting && value.visibility === 'private' ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          내부 전용 프로그램에는 아무도 지원할 수 없습니다. 지원서를 받으려면 전체 공개, 링크 공개 또는 조직 내부 공개를 선택해 주세요.
        </p>
      ) : null}
    </div>
  )
}

const POLICY_TOGGLES: Array<{ key: Exclude<keyof ProgramPolicy, 'recordDisclosure'>; label: string; hint: string; requires?: keyof ProgramPolicy }> = [
  { key: 'allowStudentProjects', label: '참여자가 프로젝트를 직접 만들거나 기존 프로젝트를 연결', hint: '끄면 담당자가 만든 프로젝트에 배정하는 방식만 사용합니다.' },
  {
    key: 'requireProjectApproval',
    label: '참여자 프로젝트 등록 시 담당자 승인 필요',
    hint: '등록 승인은 프로그램 소속을 인정할 뿐, 성과 인증과는 별개입니다.',
    requires: 'allowStudentProjects',
  },
  { key: 'allowStudentTeams', label: '팀장이 참여자를 직접 초대해 팀 구성', hint: '이 프로그램 참여자만 초대할 수 있습니다.' },
  { key: 'allowMultipleProjects', label: '참여자 1명이 여러 프로젝트에 참여 허용', hint: '끄면 참여자는 이 프로그램에서 한 팀에만 속합니다.' },
  { key: 'allowPublicProjects', label: '프로젝트 전체 공개 허용', hint: '끄면 기존 전체 공개 프로젝트는 팀 공개로 바뀝니다.' },
]

/** Advanced operating policy — only on the settings screen, never in the creation wizard. */
export function ProgramPolicyFields({ value, onChange }: { value: ProgramPolicy; onChange: (value: ProgramPolicy) => void }) {
  return (
    <div className="space-y-3">
      {POLICY_TOGGLES.map((item) => {
        const disabled = item.requires ? !value[item.requires] : false
        return (
          <label className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`} key={item.key}>
            <input
              checked={value[item.key]}
              className="mt-1 h-4 w-4 accent-brand-600"
              disabled={disabled}
              onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-medium text-ink-strong">{item.label}</span>
              <span className="block text-xs text-ink-muted">{item.hint}</span>
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
      <p className="text-xs text-ink-muted">참여자는 이 범위 안에서 자신의 인증 기록을 얼마나 공개할지 직접 선택합니다.</p>
    </div>
  )
}

export function FieldRemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button aria-label={label} className="rounded-full p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-600" onClick={onClick} type="button">
      <Trash2 size={16} />
    </button>
  )
}
