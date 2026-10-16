import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Input, Textarea } from '../common/Input'
import { MY_ORGANIZATIONS_QUERY_KEY } from '../../hooks/useMyOrganizations'
import { ORG_TYPE_META } from '../../lib/organizations'
import { updateOrganization } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Organization } from '../../types/organization'

export function OrgSettingsPanel({ organization }: { organization: Organization }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const identityLocked = organization.verificationStatus === 'approved'
  const [name, setName] = useState(organization.name)
  const [description, setDescription] = useState(organization.description ?? '')
  const [website, setWebsite] = useState(organization.website ?? '')
  const [contactEmail, setContactEmail] = useState(organization.contactEmail ?? '')
  const [registrationNumber, setRegistrationNumber] = useState(organization.registrationNumber ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateOrganization(token!, organization.id, {
        ...(identityLocked ? {} : { name, registrationNumber }),
        description,
        website,
        contactEmail,
      }),
    onSuccess: () => {
      showToast('조직 정보를 저장했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['organizations', organization.id] })
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>조직 정보</CardTitle>
        <CardDescription>
          {identityLocked
            ? '인증된 조직의 이름·등록번호는 잠겨 있습니다. 변경이 필요하면 운영자에게 재심사를 요청해 주세요.'
            : '인증 심사 전에는 모든 정보를 수정할 수 있습니다.'}
        </CardDescription>
      </CardHeader>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <Input
          disabled={identityLocked}
          label="조직 이름"
          maxLength={120}
          minLength={2}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <Textarea
          label="소개"
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="웹사이트" onChange={(event) => setWebsite(event.target.value)} type="url" value={website} />
          <Input
            label="담당자 연락 이메일"
            onChange={(event) => setContactEmail(event.target.value)}
            type="email"
            value={contactEmail}
          />
        </div>
        <Input
          disabled={identityLocked}
          label={ORG_TYPE_META[organization.type].registrationLabel}
          maxLength={40}
          onChange={(event) => setRegistrationNumber(event.target.value)}
          value={registrationNumber}
        />
        <div className="flex justify-end">
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? '저장 중' : '저장'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
