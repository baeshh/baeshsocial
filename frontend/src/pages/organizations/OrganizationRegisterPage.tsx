import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input, Textarea } from '../../components/common/Input'
import { AppLayout } from '../../components/layout/AppLayout'
import { MY_ORGANIZATIONS_QUERY_KEY } from '../../hooks/useMyOrganizations'
import { cn } from '../../lib/cn'
import { ORG_TYPE_META, REGISTRABLE_ORG_TYPES } from '../../lib/organizations'
import { createOrganization, type RegistrableOrganizationType } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { useOrgContextStore } from '../../stores/orgContextStore'
import { showToast } from '../../stores/toastStore'

function isRegistrableType(value: string | null): value is RegistrableOrganizationType {
  return REGISTRABLE_ORG_TYPES.includes(value as RegistrableOrganizationType)
}

export function OrganizationRegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialType = searchParams.get('type')
  const token = useAuthStore((state) => state.token)
  const setActiveOrg = useOrgContextStore((state) => state.setActiveOrg)
  const queryClient = useQueryClient()
  const [type, setType] = useState<RegistrableOrganizationType>(isRegistrableType(initialType) ? initialType : 'university')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      createOrganization(token!, { name, type, description, website, contactEmail, registrationNumber }),
    onSuccess: ({ organization }) => {
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
      setActiveOrg(organization.id)
      showToast('조직이 등록되었습니다. 인증 서류를 제출해 주세요.')
      navigate(`/org/${organization.id}?tab=verification`)
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">조직 등록</h1>
          <p className="mt-2 text-sm text-ink-muted">
            등록 후 증빙 서류를 제출하면 운영자가 확인합니다. 승인 전까지는 조직 관리 기능이 제한됩니다.
          </p>
        </div>

        <ol className="grid grid-cols-3 gap-2 text-center text-xs font-semibold">
          {['1. 조직 정보', '2. 증빙 제출', '3. 운영자 승인'].map((step, index) => (
            <li
              className={cn(
                'rounded-full border px-3 py-2',
                index === 0 ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-muted',
              )}
              key={step}
            >
              {step}
            </li>
          ))}
        </ol>

        <Card>
          <CardHeader>
            <CardTitle>조직 유형</CardTitle>
            <CardDescription>유형에 따라 대시보드와 이후 제공되는 관리 기능이 달라집니다.</CardDescription>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {REGISTRABLE_ORG_TYPES.map((option) => {
              const meta = ORG_TYPE_META[option]
              const Icon = meta.icon
              return (
                <button
                  aria-pressed={type === option}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition',
                    type === option
                      ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-surface-border hover:bg-surface-muted',
                  )}
                  key={option}
                  onClick={() => setType(option)}
                  type="button"
                >
                  <Icon className="text-brand-600" size={22} />
                  <p className="mt-3 font-bold text-ink-strong">{meta.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">{meta.audience}</p>
                </button>
              )
            })}
          </div>
        </Card>

        <Card>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <Input
              label={`${ORG_TYPE_META[type].label} 이름`}
              maxLength={120}
              minLength={2}
              onChange={(event) => setName(event.target.value)}
              placeholder={type === 'university' ? '예: 경일대학교 클라우드컴퓨팅전공' : type === 'company' ? '예: 주식회사 배쉬' : '예: 대구창조경제혁신센터'}
              required
              value={name}
            />
            <Textarea
              label="소개 (선택)"
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="조직이 BAESH에서 운영하려는 프로그램·프로젝트를 간단히 적어 주세요."
              value={description}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="웹사이트 (선택)"
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://"
                type="url"
                value={website}
              />
              <Input
                helperText="공식 도메인 이메일이면 심사가 빨라집니다."
                label="담당자 연락 이메일 (선택)"
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="contact@school.ac.kr"
                type="email"
                value={contactEmail}
              />
            </div>
            <Input
              label={`${ORG_TYPE_META[type].registrationLabel} (선택)`}
              maxLength={40}
              onChange={(event) => setRegistrationNumber(event.target.value)}
              placeholder="000-00-00000"
              value={registrationNumber}
            />

            {mutation.error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {mutation.error.message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button to="/organizations" variant="ghost">
                취소
              </Button>
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? '등록 중' : '등록하고 증빙 제출하기'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  )
}
