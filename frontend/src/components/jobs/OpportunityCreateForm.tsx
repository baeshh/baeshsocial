import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createOpportunity, type OpportunityPayload } from '../../services/opportunityService'
import { showToast } from '../../stores/toastStore'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Input, Select, Textarea } from '../common/Input'

type OpportunityFormType = OpportunityPayload['type']

const typeOptions: { label: string; value: OpportunityFormType }[] = [
  { label: '채용', value: 'job' },
  { label: '인턴십', value: 'internship' },
  { label: '해커톤', value: 'hackathon' },
  { label: '교육', value: 'education' },
  { label: '공모전', value: 'competition' },
  { label: '창업 프로그램', value: 'startup_program' },
]

const EMPTY_FORM = {
  title: '',
  type: 'job' as OpportunityFormType,
  organization: '',
  description: '',
  skills: '',
  location: '',
  isRemote: false,
  deadline: '',
  applyUrl: '',
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Posts an opportunity on Jobs. Only institution and admin accounts may; the API checks the role again. */
export function OpportunityCreateForm({ token }: { token: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY_FORM)
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null)
  const createMutation = useMutation({
    mutationFn: () =>
      createOpportunity(token, {
        title: form.title,
        type: form.type,
        organization: form.organization,
        description: form.description,
        skills: splitTags(form.skills),
        location: emptyToNull(form.location),
        isRemote: form.isRemote,
        deadline: emptyToNull(form.deadline),
        applyUrl: emptyToNull(form.applyUrl),
      }),
    onSuccess: ({ opportunity }) => {
      setForm(EMPTY_FORM)
      setCreated({ id: opportunity.id, title: opportunity.title })
      showToast('공고를 등록했습니다.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>일반 공고 등록</CardTitle>
        <CardDescription>
          채용·인턴십·대외활동 공고를 Jobs에 올립니다. 교육·해커톤·공모전·창업 프로그램 유형은 BAESH 안에서 참여 신청을 받을 수 있고, 지원 링크를 넣으면 외부 사이트로 안내합니다.
        </CardDescription>
      </CardHeader>
      {created ? (
        <p className="mb-4 rounded-xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700" role="status">
          「{created.title}」을(를) 등록했습니다.{' '}
          <Link className="font-semibold underline" to={`/opportunities/${created.id}`}>
            등록한 공고 보기
          </Link>
        </p>
      ) : null}
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          setCreated(null)
          createMutation.mutate()
        }}
      >
        <Input label="제목" onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required value={form.title} />
        <Input label="기관/회사" onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))} required value={form.organization} />
        <Select label="타입" onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as OpportunityFormType }))} value={form.type}>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input label="기술스택" onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))} placeholder="React, TypeScript" value={form.skills} />
        <Input label="위치" onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} value={form.location} />
        <Input label="마감일" onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))} type="date" value={form.deadline} />
        <Input label="지원 링크" onChange={(event) => setForm((prev) => ({ ...prev, applyUrl: event.target.value }))} type="url" value={form.applyUrl} />
        <Select label="원격 여부" onChange={(event) => setForm((prev) => ({ ...prev, isRemote: event.target.value === 'true' }))} value={String(form.isRemote)}>
          <option value="false">오프라인/혼합</option>
          <option value="true">원격</option>
        </Select>
        <Textarea className="md:col-span-2" label="설명" onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} required value={form.description} />
        {createMutation.error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2" role="alert">
            {createMutation.error.message}
          </p>
        ) : null}
        <div className="md:col-span-2">
          <Button loading={createMutation.isPending} type="submit">
            공고 등록
          </Button>
        </div>
      </form>
    </Card>
  )
}
