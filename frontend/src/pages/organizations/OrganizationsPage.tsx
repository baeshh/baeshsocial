import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Input } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { MY_ORGANIZATIONS_QUERY_KEY, useMyOrganizations } from '../../hooks/useMyOrganizations'
import { cn } from '../../lib/cn'
import {
  ORG_ROLE_LABEL,
  ORG_TYPE_META,
  REGISTRABLE_ORG_TYPES,
  VERIFICATION_STATUS_META,
} from '../../lib/organizations'
import {
  cancelJoinRequest,
  getOrganizationDirectory,
  joinOrganization,
  type RegistrableOrganizationType,
} from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'

export function OrganizationsPage() {
  const location = useLocation()
  const denied = Boolean((location.state as { denied?: boolean } | null)?.denied)
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const { activeMemberships, pendingMemberships, isLoading } = useMyOrganizations()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<RegistrableOrganizationType | ''>('')
  const [joinTarget, setJoinTarget] = useState<string | null>(null)
  const [joinTitle, setJoinTitle] = useState('')

  const directory = useQuery({
    queryKey: ['organizations', 'directory', submittedQuery, typeFilter],
    queryFn: () =>
      getOrganizationDirectory(token!, { q: submittedQuery || undefined, type: typeFilter || undefined }),
    enabled: Boolean(token),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['organizations', 'directory'] })
  }

  const joinMutation = useMutation({
    mutationFn: (orgId: string) => joinOrganization(token!, orgId, { title: joinTitle || undefined }),
    onSuccess: () => {
      showToast('가입 신청을 보냈습니다. 조직 담당자의 승인을 기다려 주세요.')
      setJoinTarget(null)
      setJoinTitle('')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: (orgId: string) => cancelJoinRequest(token!, orgId),
    onSuccess: () => {
      showToast('가입 신청을 취소했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">조직</h1>
          <p className="mt-2 text-sm text-ink-muted">
            개인 계정 하나로 대학·기관·기업 조직에 소속되고, 상단의 작업 공간 전환으로 조직별 대시보드를 오갈 수 있습니다.
          </p>
        </div>

        {denied ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            접근 권한이 없는 조직입니다. 소속이 승인된 조직만 열 수 있습니다.
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>내 조직</CardTitle>
            <CardDescription>소속된 조직과 가입 신청 현황입니다.</CardDescription>
          </CardHeader>
          {isLoading ? (
            <LoadingState />
          ) : activeMemberships.length === 0 && pendingMemberships.length === 0 ? (
            <p className="text-sm text-ink-muted">아직 소속된 조직이 없습니다. 아래에서 조직을 등록하거나 가입을 신청해 보세요.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {activeMemberships.map((membership) => {
                const meta = ORG_TYPE_META[membership.organization.type]
                const status = VERIFICATION_STATUS_META[membership.organization.verificationStatus]
                const Icon = meta.icon
                return (
                  <li className="flex flex-wrap items-center gap-3 py-3" key={membership.id}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-strong">{membership.organization.name}</p>
                      <p className="text-xs text-ink-muted">
                        {meta.label} · {ORG_ROLE_LABEL[membership.role]}
                      </p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Button className="min-h-9 px-4" to={`/org/${membership.organization.id}`} variant="secondary">
                      대시보드
                    </Button>
                  </li>
                )
              })}
              {pendingMemberships.map((membership) => (
                <li className="flex flex-wrap items-center gap-3 py-3" key={membership.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-strong">{membership.organization.name}</p>
                    <p className="text-xs text-ink-muted">{ORG_TYPE_META[membership.organization.type].label} · 가입 승인 대기</p>
                  </div>
                  <Button
                    className="min-h-9 px-4"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(membership.organization.id)}
                    variant="ghost"
                  >
                    신청 취소
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>새 조직 등록</CardTitle>
            <CardDescription>
              조직을 등록하면 소유자가 되며, 사업자등록증·재직증명서 등 증빙을 제출해 운영자 승인을 받으면 관리 기능이 활성화됩니다.
            </CardDescription>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {REGISTRABLE_ORG_TYPES.map((type) => {
              const meta = ORG_TYPE_META[type]
              const Icon = meta.icon
              return (
                <Link
                  className="group rounded-2xl border border-surface-border p-4 transition hover:border-brand-200 hover:bg-brand-50"
                  key={type}
                  to={`/organizations/new?type=${type}`}
                >
                  <Icon className="text-brand-600" size={22} />
                  <p className="mt-3 font-bold text-ink-strong">{meta.label} 등록</p>
                  <p className="mt-1 text-xs text-ink-muted">{meta.audience}</p>
                </Link>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>조직 찾기 · 가입 신청</CardTitle>
            <CardDescription>인증이 완료된 조직만 표시됩니다. 가입 신청은 해당 조직 담당자가 승인합니다.</CardDescription>
          </CardHeader>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              setSubmittedQuery(query.trim())
            }}
          >
            <div className="flex-1">
              <Input label="조직 이름" onChange={(event) => setQuery(event.target.value)} placeholder="예: 경일대학교" value={query} />
            </div>
            <div className="flex gap-2">
              {(['', ...REGISTRABLE_ORG_TYPES] as const).map((type) => (
                <button
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold transition',
                    typeFilter === type
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-surface-border bg-white text-ink-body hover:bg-surface-muted',
                  )}
                  key={type || 'all'}
                  onClick={() => setTypeFilter(type)}
                  type="button"
                >
                  {type ? ORG_TYPE_META[type].label : '전체'}
                </button>
              ))}
            </div>
            <Button className="gap-2" type="submit">
              <Search size={16} />
              검색
            </Button>
          </form>

          <div className="mt-5">
            {directory.isLoading ? (
              <LoadingState />
            ) : (directory.data?.organizations.length ?? 0) === 0 ? (
              <EmptyState description="검색 조건에 맞는 인증 조직이 없습니다." title="조직이 없습니다" />
            ) : (
              <ul className="divide-y divide-surface-border">
                {directory.data!.organizations.map((organization) => {
                  const meta = ORG_TYPE_META[organization.type]
                  const membership = organization.myMembership
                  return (
                    <li className="py-3" key={organization.id}>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink-strong">{organization.name}</p>
                          <p className="text-xs text-ink-muted">
                            {meta.label} · 구성원 {organization.memberCount ?? 0}명
                          </p>
                        </div>
                        {membership?.status === 'active' ? (
                          <Button className="min-h-9 px-4" to={`/org/${organization.id}`} variant="secondary">
                            소속됨 · 열기
                          </Button>
                        ) : membership?.status === 'pending' ? (
                          <Badge>승인 대기</Badge>
                        ) : (
                          <Button
                            className="min-h-9 px-4"
                            onClick={() => setJoinTarget(joinTarget === organization.id ? null : organization.id)}
                            variant="secondary"
                          >
                            가입 신청
                          </Button>
                        )}
                      </div>
                      {joinTarget === organization.id ? (
                        <form
                          className="mt-3 flex flex-col gap-3 rounded-2xl bg-surface-muted p-4 sm:flex-row sm:items-end"
                          onSubmit={(event) => {
                            event.preventDefault()
                            joinMutation.mutate(organization.id)
                          }}
                        >
                          <div className="flex-1">
                            <Input
                              label="소속 / 직함 (선택)"
                              maxLength={120}
                              onChange={(event) => setJoinTitle(event.target.value)}
                              placeholder="예: 컴퓨터공학과 학생, 채용팀 매니저"
                              value={joinTitle}
                            />
                          </div>
                          <Button disabled={joinMutation.isPending} type="submit">
                            {joinMutation.isPending ? '신청 중' : '신청 보내기'}
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
