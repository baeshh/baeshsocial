import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, Clock3, Lock, X } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs, type TabItem } from '../../components/common/Tabs'
import { AppLayout } from '../../components/layout/AppLayout'
import { OrgAuditPanel } from '../../components/audit/OrgAuditPanel'
import { OrgBillingBanner } from '../../components/billing/OrgBillingBanner'
import { OrgBillingPanel } from '../../components/billing/OrgBillingPanel'
import { InstitutionOverview } from '../../components/institution/InstitutionOverview'
import { OrgInvitesPanel } from '../../components/onboarding/OrgInvitesPanel'
import { OrgOnboardingPanel } from '../../components/onboarding/OrgOnboardingPanel'
import { OrgKpiPanel } from '../../components/institution/KpiPanels'
import { OrgProgramsPanel } from '../../components/institution/OrgProgramsPanel'
import { OrgReportsPanel } from '../../components/institution/OrgReportsPanel'
import { OrgMembersPanel } from '../../components/organizations/OrgMembersPanel'
import { OrgSettingsPanel } from '../../components/organizations/OrgSettingsPanel'
import { OrgVerificationPanel } from '../../components/organizations/OrgVerificationPanel'
import { cn } from '../../lib/cn'
import { hasOrgRole, ORG_ROLE_LABEL, ORG_TYPE_META, VERIFICATION_STATUS_META } from '../../lib/organizations'
import { getOrganizationDashboard } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import type { OrganizationDashboard, OrganizationRole, OrganizationType } from '../../types/organization'

const TYPE_MODULES: Partial<Record<OrganizationType, Array<{ title: string; description: string }>>> = {
  university: [
    { title: '학생 성과 리포트', description: '학생별 프로젝트 기여도와 검증 이력을 학과 리포트로 정리합니다.' },
  ],
  institution: [
    { title: '수료·이수 인증', description: '프로그램 수료자에게 검증된 이수 기록을 발급합니다.' },
  ],
  community: [{ title: '커뮤니티 활동', description: '커뮤니티 구성원 활동을 관리합니다.' }],
}

function capabilitiesFor(role: OrganizationRole, approved: boolean) {
  return [
    { label: '조직 대시보드·구성원 열람', allowed: true },
    { label: '가입 신청 승인·거절', allowed: approved && hasOrgRole(role, 'manager'), needsApproval: !approved },
    { label: '구성원 역할 변경·내보내기', allowed: approved && hasOrgRole(role, 'admin'), needsApproval: !approved },
    { label: '조직 정보 수정·인증 서류 제출', allowed: hasOrgRole(role, 'admin') },
  ]
}

function StatusBanner({ dashboard, onOpenVerification }: { dashboard: OrganizationDashboard; onOpenVerification: () => void }) {
  const { organization, myRole, latestVerification } = dashboard
  if (organization.verificationStatus === 'approved') return null
  const isAdmin = hasOrgRole(myRole, 'admin')

  if (organization.verificationStatus === 'rejected') {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex-1 text-sm text-red-800">
          <p className="font-semibold">조직 인증이 반려되었습니다.</p>
          {latestVerification?.reviewNote ? <p className="mt-1">사유: {latestVerification.reviewNote}</p> : null}
        </div>
        {isAdmin ? <Button onClick={onOpenVerification}>서류 다시 제출</Button> : null}
      </div>
    )
  }

  const submitted = Boolean(latestVerification) || !isAdmin
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3 text-sm text-amber-900">
        <Clock3 className="mt-0.5 shrink-0" size={18} />
        <div>
          <p className="font-semibold">{submitted ? '운영자가 인증 서류를 검토하고 있습니다.' : '인증 서류를 제출해야 관리 기능이 열립니다.'}</p>
          <p className="mt-1">승인 전에는 구성원 가입 승인, 역할 관리 등 조직 관리 기능이 비활성화됩니다.</p>
        </div>
      </div>
      {isAdmin && !latestVerification ? <Button onClick={onOpenVerification}>인증 서류 제출</Button> : null}
    </div>
  )
}

export function OrganizationDashboardPage() {
  const { orgId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const token = useAuthStore((state) => state.token)

  const programFilter = searchParams.get('program')
  const dashboardQuery = useQuery({
    queryKey: ['organizations', orgId, 'dashboard', programFilter],
    queryFn: () => getOrganizationDashboard(token!, orgId, programFilter),
    enabled: Boolean(token && orgId),
    placeholderData: keepPreviousData,
  })

  if (dashboardQuery.isLoading) {
    return (
      <AppLayout>
        <LoadingState label="조직 대시보드를 불러오는 중입니다" />
      </AppLayout>
    )
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <AppLayout>
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {(dashboardQuery.error as Error | null)?.message ?? '조직 정보를 불러오지 못했습니다.'}
        </p>
      </AppLayout>
    )
  }

  const dashboard = dashboardQuery.data
  const { organization, myRole, stats } = dashboard
  const meta = ORG_TYPE_META[organization.type]
  const status = VERIFICATION_STATUS_META[organization.verificationStatus]
  const approved = organization.verificationStatus === 'approved'
  const isAdmin = hasOrgRole(myRole, 'admin')
  const isStaff = hasOrgRole(myRole, 'manager')
  const canManagePrograms = approved && hasOrgRole(myRole, 'manager')
  const Icon = meta.icon
  const upcomingModules = TYPE_MODULES[organization.type] ?? []
  const requestedTab = searchParams.get('tab') ?? 'overview'
  const changeTab = (tabId: string) => setSearchParams(tabId === 'overview' ? {} : { tab: tabId }, { replace: true })

  const tabs: TabItem[] = [
    ...(canManagePrograms
      ? [{ id: 'onboarding', label: '도입 가이드', content: <OrgOnboardingPanel onOpenTab={changeTab} orgId={organization.id} /> }]
      : []),
    {
      id: 'overview',
      label: '개요',
      content: (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">구성원</p>
              <p className="mt-2 text-3xl font-bold text-ink-strong">{stats.memberCount}</p>
            </Card>
            <Card className="rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">관리자 · 담당자</p>
              <p className="mt-2 text-3xl font-bold text-ink-strong">
                {stats.roleCounts.owner + stats.roleCounts.admin} · {stats.roleCounts.manager}
              </p>
            </Card>
            <Card className="rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">가입 대기</p>
              <p className="mt-2 text-3xl font-bold text-ink-strong">
                {stats.pendingRequests === null ? <Lock className="mt-1 text-ink-muted" size={26} /> : stats.pendingRequests}
              </p>
            </Card>
            <Card className="rounded-2xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">내 역할</p>
              <p className="mt-2 text-3xl font-bold text-ink-strong">{ORG_ROLE_LABEL[myRole]}</p>
            </Card>
          </div>

          <InstitutionOverview
            institution={dashboard.institution}
            onOpenPrograms={() => changeTab('programs')}
            onProgramFilterChange={(programId) => setSearchParams(programId ? { program: programId } : {}, { replace: true })}
            orgId={organization.id}
            programFilter={programFilter}
          />

          {organization.type === 'company' ? (
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-bold text-ink-strong">검증 기반 인재 검색</p>
                <p className="mt-1 text-sm text-ink-muted">
                  인재 검색에 동의한 사용자의 공개 프로젝트와 기관 검증 기록을 기준으로 후보를 추천하고, 추천 근거를 함께 보여줍니다.
                </p>
              </div>
              {approved ? <Button to={`/talent-db?org=${organization.id}`}>인재 검색 열기</Button> : <Badge>조직 인증 후</Badge>}
            </Card>
          ) : null}

          {upcomingModules.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{meta.label} 관리 기능</CardTitle>
              <CardDescription>
                {meta.audience}를 위한 기능입니다.{' '}
                {approved ? '다음 개발 단계에서 순차적으로 열립니다.' : '조직 인증이 끝난 뒤 순차적으로 열립니다.'}
              </CardDescription>
            </CardHeader>
            <div className="grid gap-3 md:grid-cols-3">
              {upcomingModules.map((module) => (
                <div className="rounded-2xl border border-surface-border p-4" key={module.title}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-ink-strong">{module.title}</p>
                    <Badge>다음 단계</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{module.description}</p>
                </div>
              ))}
            </div>
          </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>내 권한 · {ORG_ROLE_LABEL[myRole]}</CardTitle>
              <CardDescription>권한은 서버에서 소속과 조직 인증 상태를 기준으로 매 요청마다 확인됩니다.</CardDescription>
            </CardHeader>
            <ul className="space-y-2">
              {capabilitiesFor(myRole, approved).map((capability) => (
                <li className="flex items-center gap-3 text-sm" key={capability.label}>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full',
                      capability.allowed ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-muted text-ink-muted',
                    )}
                  >
                    {capability.allowed ? <Check size={14} /> : <X size={14} />}
                  </span>
                  <span className={capability.allowed ? 'text-ink-strong' : 'text-ink-muted'}>{capability.label}</span>
                  {!capability.allowed && capability.needsApproval ? (
                    <span className="text-xs text-amber-700">조직 인증 후</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ),
    },
    { id: 'programs', label: '프로그램', content: <OrgProgramsPanel myRole={myRole} organization={organization} /> },
    ...(canManagePrograms
      ? [
          { id: 'kpis', label: '성과 분석', content: <OrgKpiPanel orgId={organization.id} /> },
          { id: 'reports', label: '결과보고서', content: <OrgReportsPanel orgId={organization.id} /> },
        ]
      : []),
    { id: 'members', label: '구성원', content: <OrgMembersPanel myRole={myRole} organization={organization} /> },
    ...(approved && isStaff ? [{ id: 'invites', label: '초대', content: <OrgInvitesPanel orgId={organization.id} /> }] : []),
    ...(isStaff ? [{ id: 'billing', label: '요금제·사용량', content: <OrgBillingPanel orgId={organization.id} /> }] : []),
    ...(approved && isAdmin ? [{ id: 'audit', label: '감사 로그', content: <OrgAuditPanel orgId={organization.id} /> }] : []),
    ...(isAdmin
      ? [
          { id: 'verification', label: '인증', content: <OrgVerificationPanel organization={organization} /> },
          { id: 'settings', label: '설정', content: <OrgSettingsPanel organization={organization} /> },
        ]
      : []),
  ]

  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview'

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink-strong">{organization.name}</h1>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {meta.label} · {meta.audience} · 내 역할 {ORG_ROLE_LABEL[myRole]}
            </p>
            {organization.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-body">{organization.description}</p>
            ) : null}
          </div>
        </div>

        <StatusBanner dashboard={dashboard} onOpenVerification={() => changeTab('verification')} />
        {approved && isStaff ? <OrgBillingBanner onOpenBilling={() => changeTab('billing')} orgId={organization.id} /> : null}

        <Tabs activeTab={activeTab} onChange={changeTab} tabs={tabs} variant="underline" />
      </div>
    </AppLayout>
  )
}
