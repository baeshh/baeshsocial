import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { isChoiceField as isChoice, newDraftField, type DraftField } from '../../lib/programForm'
import { APPLICATION_FIELD_TYPE_LABEL } from '../../lib/programs'
import type { ApplicationFieldType } from '../../types/program'
import { Input, Select } from '../common/Input'
import { FieldRemoveButton } from './ProgramFormFields'

const MAX_FIELDS = 30
const MAX_OPTIONS = 20

const QUICK_ADD: Array<{ type: ApplicationFieldType; label: string }> = [
  { type: 'long_text', label: '서술형 질문' },
  { type: 'short_text', label: '단답형 질문' },
  { type: 'single_choice', label: '객관식 질문' },
  { type: 'url', label: '포트폴리오 링크' },
  { type: 'file', label: '첨부파일' },
  { type: 'consent', label: '동의 항목' },
]

export function ApplicationFormBuilder({
  fields,
  onChange,
  disabled = false,
}: {
  fields: DraftField[]
  onChange: (fields: DraftField[]) => void
  disabled?: boolean
}) {
  const update = (key: string, patch: Partial<DraftField>) =>
    onChange(fields.map((field) => (field.key === key ? { ...field, ...patch } : field)))
  const move = (index: number, delta: number) => {
    const next = [...fields]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }
  const changeType = (field: DraftField, type: ApplicationFieldType) =>
    update(field.key, {
      type,
      options: isChoice(type) ? (field.options.length >= 2 ? field.options : ['', '']) : [],
      required: type === 'consent' ? true : field.required,
    })

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-muted">
        지원자의 이름·소속·전공/직무·경력 등 BAESH 프로필은 자동으로 함께 제출됩니다. 프로필에 없는 내용만 질문하세요.
      </p>
      {fields.length === 0 ? (
        <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">문항이 없습니다. 지원자는 프로필만으로 지원합니다.</p>
      ) : null}
      <ol className="space-y-3">
        {fields.map((field, index) => (
          <li className="rounded-2xl border border-surface-border p-4" key={field.key}>
            <div className="flex items-start gap-2">
              <span className="mt-9 w-6 shrink-0 text-sm font-semibold text-ink-muted">{index + 1}</span>
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_11rem]">
                <Input
                  disabled={disabled}
                  label="질문"
                  maxLength={200}
                  onChange={(event) => update(field.key, { label: event.target.value })}
                  placeholder={field.type === 'consent' ? '예: 개인정보 수집·이용에 동의합니다' : '예: 지원 동기를 적어 주세요'}
                  value={field.label}
                />
                <Select disabled={disabled} label="유형" onChange={(event) => changeType(field, event.target.value as ApplicationFieldType)} value={field.type}>
                  {(Object.keys(APPLICATION_FIELD_TYPE_LABEL) as ApplicationFieldType[]).map((type) => (
                    <option key={type} value={type}>
                      {APPLICATION_FIELD_TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
                <div className="sm:col-span-2">
                  <Input
                    disabled={disabled}
                    label={field.type === 'consent' ? '동의 내용' : '설명 (선택)'}
                    maxLength={1000}
                    onChange={(event) => update(field.key, { description: event.target.value })}
                    placeholder={field.type === 'file' ? '예: 사업계획서(PDF, 20MB 이하, 최대 3개)' : '지원자에게 보여 줄 안내'}
                    value={field.description}
                  />
                </div>
                {isChoice(field.type) ? (
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm font-semibold text-ink-strong">보기</p>
                    {field.options.map((option, optionIndex) => (
                      <div className="flex items-center gap-2" key={optionIndex}>
                        <input
                          aria-label={`보기 ${optionIndex + 1}`}
                          className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-brand-500"
                          disabled={disabled}
                          maxLength={100}
                          onChange={(event) =>
                            update(field.key, { options: field.options.map((value, i) => (i === optionIndex ? event.target.value : value)) })
                          }
                          placeholder={`보기 ${optionIndex + 1}`}
                          value={option}
                        />
                        {field.options.length > 2 ? (
                          <FieldRemoveButton
                            label={`보기 ${optionIndex + 1} 삭제`}
                            onClick={() => update(field.key, { options: field.options.filter((_, i) => i !== optionIndex) })}
                          />
                        ) : null}
                      </div>
                    ))}
                    {field.options.length < MAX_OPTIONS && !disabled ? (
                      <button className="text-sm font-semibold text-brand-600" onClick={() => update(field.key, { options: [...field.options, ''] })} type="button">
                        + 보기 추가
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-ink-body sm:col-span-2">
                  <input
                    checked={field.required}
                    className="h-4 w-4 accent-brand-600"
                    disabled={disabled || field.type === 'consent'}
                    onChange={(event) => update(field.key, { required: event.target.checked })}
                    type="checkbox"
                  />
                  필수 항목
                </label>
              </div>
              {disabled ? null : (
                <div className="flex shrink-0 flex-col items-center gap-1 pt-7">
                  <button
                    aria-label="위로"
                    className="rounded-full p-1.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    type="button"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label="아래로"
                    className="rounded-full p-1.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, 1)}
                    type="button"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <FieldRemoveButton label={`${index + 1}번 문항 삭제`} onClick={() => onChange(fields.filter((item) => item.key !== field.key))} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {fields.length < MAX_FIELDS && !disabled ? (
        <div className="flex flex-wrap gap-2">
          {QUICK_ADD.map((item) => (
            <button
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-surface-border px-3 py-1.5 text-sm font-medium text-ink-body hover:border-brand-300 hover:text-brand-700"
              key={item.type}
              onClick={() => onChange([...fields, { ...newDraftField(item.type), required: item.type === 'consent' }])}
              type="button"
            >
              <Plus size={14} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
