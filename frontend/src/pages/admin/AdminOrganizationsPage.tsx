import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { cn } from '../../lib/cn'
import { DOCUMENT_TYPE_LABEL, ORG_ROLE_LABEL, ORG_TYPE_META, VERIFICATION_STATUS_META } from '../../lib/organizations'
import { getAdminOrganization, getAdminOrganizations, reviewOrganization } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { OrganizationVerificationStatus } from '../../types/organization'

const STATUS_TABS: OrganizationVerificationStatus[] = ['pending', 'approved', 'rejected']

function OrganizationReview({ orgId }: { orgId: string }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')

  const detail = useQuery({
    queryKey: ['admin', 'organizations', orgId],
    queryFn: () => getAdminOrganization(token!, orgId),
    enabled: Boolean(token),
  })

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') => reviewOrganization(token!, orgId, decision, note || undefined),
    onSuccess: (_data, decision) => {
      showToast(decision === 'approved' ? '조직을 승인했습니다.' : '조직 인증을 반려했습니다.', decision === 'approved' ? 'success' : 'info')
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (detail.isLoading) return <LoadingState />
  if (!detail.data) return null

  const organization = detail.data.organization
  const meta = ORG_TYPE_META[organization.type]
  const hasPendingDocument = organization.verifications.some((verification) => verification.status === 'pending')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{organization.name}</CardTitle>
          <Badge tone={VERIFICATION_STATUS_META[organization.verificationStatus].tone}>
            {VERIFICATION_STATUS_META[organization.verificationStatus].label}
          </Badge>
        </div>
        <CardDescription>
          {meta.label} · 등록자 {organization.createdBy?.name ?? '-'} ({organization.createdBy?.email ?? '-'})
        </CardDescription>
      </CardHeader>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-ink-muted">{meta.registrationLabel}</dt>
          <dd className="mt-1 text-ink-strong">{organization.registrationNumber ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-muted">연락 이메일</dt>
          <dd className="mt-1 break-all text-ink-strong">{organization.contactEmail ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-muted">웹사이트</dt>
          <dd className="mt-1 break-all text-ink-strong">
            {organization.website ? (
              <a className="text-brand-600 underline" href={organization.website} rel="noreferrer noopener" target="_blank">
                {organization.website}
              </a>
            ) : (
              '-'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-muted">관리자</dt>
          <dd className="mt-1 text-ink-strong">
            {organization.admins.map((admin) => `${admin.user?.name} (${ORG_ROLE_LABEL[admin.role]})`).join(', ') || '-'}
          </dd>
        </div>
      </dl>
      {organization.description ? <p className="mt-4 text-sm leading-6 text-ink-body">{organization.description}</p> : null}

      <h3 className="mt-6 text-sm font-bold text-ink-strong">제출 서류</h3>
      {organization.verifications.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">제출된 서류가 없습니다.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {organization.verifications.map((verification) => (
            <li className="rounded-2xl border border-surface-border p-4" key={verification.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink-strong">{DOCUMENT_TYPE_LABEL[verification.documentType]}</p>
                <Badge tone={VERIFICATION_STATUS_META[verification.status].tone}>
                  {VERIFICATION_STATUS_META[verification.status].label}
                </Badge>
                <span className="ml-auto text-xs text-ink-muted">{new Date(verification.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              {verification.note ? <p className="mt-2 text-sm text-ink-body">메모: {verification.note}</p> : null}
              {verification.documentUrl?.startsWith('data:image/') ? (
                <img
                  alt={verification.documentName ?? '증빙 이미지'}
                  className="mt-3 max-h-80 rounded-xl border border-surface-border object-contain"
                  src={verification.documentUrl}
                />
              ) : null}
              {verification.documentUrl ? (
                <a
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
                  download={verification.documentName ?? 'document'}
                  href={verification.documentUrl}
                  rel="noreferrer noopener"
                  target={verification.documentUrl.startsWith('https://') ? '_blank' : undefined}
                >
                  <Download size={16} />
                  {verification.documentName ?? '서류 내려받기'}
                </a>
              ) : null}
              {verification.reviewNote ? (
                <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-body">심사 메모: {verification.reviewNote}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 space-y-3 border-t border-surface-border pt-5">
        <Textarea
          label="심사 메모 (반려 시 조직에 사유로 전달됩니다)"
          maxLength={1000}
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={review.isPending} onClick={() => review.mutate('rejected')} variant="danger">
            {organization.verificationStatus === 'approved' ? '승인 취소' : '반려'}
          </Button>
          <Button
            disabled={review.isPending || !hasPendingDocument || organization.verificationStatus === 'approved'}
            onClick={() => review.mutate('approved')}
          >
            승인
          </Button>
        </div>
        {!hasPendingDocument && organization.verificationStatus !== 'approved' ? (
          <p className="text-right text-xs text-ink-muted">심사 대기 중인 서류가 있어야 승인할 수 있습니다.</p>
        ) : null}
      </div>
    </Card>
  )
}

export function AdminOrganizationsPage() {
  const token = useAuthStore((state) => state.token)
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<OrganizationVerificationStatus>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('focus'))

  const list = useQuery({
    queryKey: ['admin', 'organizations', 'list', status],
    queryFn: () => getAdminOrganizations(token!, status),
    enabled: Boolean(token),
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">조직 인증 심사</h1>
          <p className="mt-2 text-sm text-ink-muted">플랫폼 운영자만 접근할 수 있습니다. 승인된 조직에만 관리 기능이 활성화됩니다.</p>
        </div>

        <div className="inline-flex gap-2 rounded-2xl bg-surface-muted p-1">
          {STATUS_TABS.map((tab) => (
            <button
              className={cn(
                'min-h-10 rounded-xl px-4 text-sm font-semibold transition',
                status === tab ? 'bg-white text-ink-strong shadow-sm' : 'text-ink-muted hover:text-ink-strong',
              )}
              key={tab}
              onClick={() => {
                setStatus(tab)
                setSelectedId(null)
              }}
              type="button"
            >
              {VERIFICATION_STATUS_META[tab].label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div>
            {list.isLoading ? (
              <LoadingState />
            ) : (list.data?.organizations.length ?? 0) === 0 ? (
              <EmptyState description="해당 상태의 조직이 없습니다." title="목록이 비어 있습니다" />
            ) : (
              <ul className="space-y-2">
                {list.data!.organizations.map((organization) => (
                  <li key={organization.id}>
                    <button
                      className={cn(
                        'w-full rounded-2xl border bg-white p-4 text-left transition',
                        selectedId === organization.id
                          ? 'border-brand-600 ring-2 ring-brand-100'
                          : 'border-surface-border hover:border-brand-200',
                      )}
                      onClick={() => setSelectedId(organization.id)}
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{organization.name}</p>
                        <Badge>{ORG_TYPE_META[organization.type].label}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {organization.createdBy?.name ?? '-'} · 구성원 {organization.memberCount}명 ·{' '}
                        {organization.latestVerification
                          ? `${DOCUMENT_TYPE_LABEL[organization.latestVerification.documentType]} 제출`
                          : '서류 미제출'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            {selectedId ? (
              <OrganizationReview key={selectedId} orgId={selectedId} />
            ) : (
              <EmptyState description="왼쪽 목록에서 심사할 조직을 선택하세요." title="조직을 선택하세요" />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
