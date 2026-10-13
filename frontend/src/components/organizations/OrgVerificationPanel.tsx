import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { MY_ORGANIZATIONS_QUERY_KEY } from '../../hooks/useMyOrganizations'
import { DOCUMENT_TYPE_LABEL, VERIFICATION_STATUS_META } from '../../lib/organizations'
import { readFileAsDataUrl } from '../../lib/readMediaFile'
import { getVerifications, submitVerification } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Organization, OrganizationDocumentType } from '../../types/organization'

const MAX_DOCUMENT_BYTES = 7 * 1024 * 1024
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

const DEFAULT_DOCUMENT: Record<Organization['type'], OrganizationDocumentType> = {
  company: 'business_registration',
  institution: 'official_letter',
  university: 'official_letter',
  community: 'other',
}

export function OrgVerificationPanel({ organization }: { organization: Organization }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [documentType, setDocumentType] = useState<OrganizationDocumentType>(DEFAULT_DOCUMENT[organization.type])
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null)
  const [note, setNote] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)

  const history = useQuery({
    queryKey: ['organizations', organization.id, 'verifications'],
    queryFn: () => getVerifications(token!, organization.id),
    enabled: Boolean(token),
  })

  const mutation = useMutation({
    mutationFn: () =>
      submitVerification(token!, organization.id, {
        documentType,
        documentName: file!.name,
        documentUrl: file!.dataUrl,
        note: note || undefined,
      }),
    onSuccess: () => {
      showToast('인증 서류를 제출했습니다. 운영자 검토 후 알림으로 결과를 알려드립니다.')
      setFile(null)
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['organizations', organization.id] })
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setFileError('PDF 또는 이미지(PNG·JPG·WEBP) 파일만 제출할 수 있습니다.')
      return
    }
    if (selected.size > MAX_DOCUMENT_BYTES) {
      setFileError('파일은 7MB 이하만 제출할 수 있습니다.')
      return
    }
    try {
      setFile({ name: selected.name, dataUrl: await readFileAsDataUrl(selected) })
    } catch (error) {
      setFileError((error as Error).message)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setFileError('증빙 파일을 선택해 주세요.')
      return
    }
    mutation.mutate()
  }

  const verifications = history.data?.verifications ?? []
  const awaitingReview = verifications[0]?.status === 'pending'

  return (
    <div className="space-y-5">
      {organization.verificationStatus === 'approved' ? (
        <Card>
          <CardTitle>인증이 완료된 조직입니다</CardTitle>
          <p className="mt-2 text-sm text-ink-muted">조직 이름·유형·등록번호를 바꾸려면 운영자 재심사가 필요합니다.</p>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{awaitingReview ? '추가 서류 제출' : '인증 서류 제출'}</CardTitle>
            <CardDescription>
              기업은 사업자등록증, 대학·기관은 공문 또는 담당자 재직증명서를 제출해 주세요. 제출 서류는 BAESH 운영자만 열람합니다.
            </CardDescription>
          </CardHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <Select
              label="서류 종류"
              onChange={(event) => setDocumentType(event.target.value as OrganizationDocumentType)}
              value={documentType}
            >
              {(Object.keys(DOCUMENT_TYPE_LABEL) as OrganizationDocumentType[]).map((type) => (
                <option key={type} value={type}>
                  {DOCUMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
            <label className="block">
              <span className="text-sm font-semibold text-ink-strong">증빙 파일 (PDF·이미지, 7MB 이하)</span>
              <input
                accept={ACCEPTED_TYPES.join(',')}
                className="mt-2 block w-full rounded-2xl border border-dashed border-surface-border bg-surface-muted px-4 py-4 text-sm text-ink-body file:mr-4 file:rounded-full file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                onChange={handleFile}
                type="file"
              />
              {file ? <p className="mt-2 text-sm text-ink-body">선택됨: {file.name}</p> : null}
              {fileError ? <p className="mt-2 text-sm font-medium text-red-700">{fileError}</p> : null}
            </label>
            <Textarea
              label="운영자에게 남길 메모 (선택)"
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="예: 학과 사무실 공문입니다. 담당 교수 연락처 053-000-0000"
              value={note}
            />
            <div className="flex justify-end">
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? '제출 중' : '인증 신청'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>심사 이력</CardTitle>
        </CardHeader>
        {history.isLoading ? (
          <LoadingState />
        ) : verifications.length === 0 ? (
          <p className="text-sm text-ink-muted">아직 제출한 서류가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {verifications.map((verification) => {
              const status = VERIFICATION_STATUS_META[verification.status]
              return (
                <li className="py-3" key={verification.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-strong">{DOCUMENT_TYPE_LABEL[verification.documentType]}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="ml-auto text-xs text-ink-muted">
                      {new Date(verification.createdAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  {verification.documentName ? (
                    <p className="mt-1 text-xs text-ink-muted">{verification.documentName}</p>
                  ) : null}
                  {verification.reviewNote ? (
                    <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-body">
                      운영자 메모: {verification.reviewNote}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
