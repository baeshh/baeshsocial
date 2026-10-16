import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Monitor } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { Input } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs, type TabItem } from '../../components/common/Tabs'
import { AppLayout } from '../../components/layout/AppLayout'
import { describeUserAgent, formatDateTime, formatKrw, formatPlanPrice, INVOICE_STATUS_META } from '../../lib/commercial'
import { formatDate } from '../../lib/programs'
import { changePassword, getMyBilling, getPlans, getSessions, logoutOthers, revokeSession } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import { ErrorState } from '../../components/common/ErrorState'

function SecurityTab() {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const sessionsQuery = useQuery({ queryKey: ['auth', 'sessions'], queryFn: () => getSessions(token!), enabled: Boolean(token) })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] })

  const password = useMutation({
    mutationFn: () => changePassword(token!, { currentPassword, newPassword }),
    onSuccess: (data) => {
      showToast(data.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const revoke = useMutation({
    mutationFn: (sessionId: string) => revokeSession(token!, sessionId),
    onSuccess: () => {
      showToast('해당 기기에서 로그아웃했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const others = useMutation({
    mutationFn: () => logoutOthers(token!),
    onSuccess: (data) => {
      showToast(`다른 기기 ${data.revoked}곳에서 로그아웃했습니다.`, 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const mismatch = confirm.length > 0 && confirm !== newPassword
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!mismatch) password.mutate()
  }
  const sessions = sessionsQuery.data?.sessions ?? []

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>비밀번호 변경</CardTitle>
          <CardDescription>변경하면 지금 이 기기를 제외한 모든 기기에서 로그아웃됩니다. 8자 이상, 영문과 숫자를 함께 사용하세요.</CardDescription>
        </CardHeader>
        <form className="space-y-4" onSubmit={submit}>
          <Input autoComplete="current-password" label="현재 비밀번호" onChange={(e) => setCurrentPassword(e.target.value)} required type="password" value={currentPassword} />
          <Input autoComplete="new-password" label="새 비밀번호" minLength={8} onChange={(e) => setNewPassword(e.target.value)} required type="password" value={newPassword} />
          <Input
            autoComplete="new-password"
            error={mismatch ? '새 비밀번호와 일치하지 않습니다.' : undefined}
            label="새 비밀번호 확인"
            onChange={(e) => setConfirm(e.target.value)}
            required
            type="password"
            value={confirm}
          />
          <Button disabled={password.isPending || mismatch} type="submit">
            {password.isPending ? '변경 중…' : '비밀번호 변경'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>로그인된 기기 {sessions.length}</CardTitle>
            <Button className="min-h-9 px-4" disabled={others.isPending || sessions.length <= 1} onClick={() => others.mutate()} variant="secondary">
              다른 기기 모두 로그아웃
            </Button>
          </div>
          <CardDescription>모르는 기기가 있다면 로그아웃하고 비밀번호를 변경하세요. 관리자가 권한을 바꾸거나 계정을 정지하면 즉시 반영됩니다.</CardDescription>
        </CardHeader>
        {sessionsQuery.isLoading ? (
          <LoadingState />
        ) : (
          <ul className="divide-y divide-surface-border">
            {sessions.map((session) => (
              <li className="flex flex-wrap items-center gap-3 py-3" key={session.id}>
                <Monitor className="shrink-0 text-ink-muted" size={20} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink-strong">
                    {describeUserAgent(session.userAgent)}
                    {session.current ? <Badge tone="green">현재 기기</Badge> : null}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {session.ip ?? 'IP 미상'} · 최근 활동 {formatDateTime(session.lastSeenAt)} · 만료 {formatDate(session.expiresAt)}
                  </p>
                </div>
                {!session.current ? (
                  <Button className="min-h-9 px-4" disabled={revoke.isPending} onClick={() => revoke.mutate(session.id)} variant="ghost">
                    로그아웃
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function PlanTab() {
  const token = useAuthStore((state) => state.token)
  const billingQuery = useQuery({ queryKey: ['billing', 'me'], queryFn: () => getMyBilling(token!), enabled: Boolean(token) })
  const plansQuery = useQuery({ queryKey: ['billing', 'plans'], queryFn: getPlans })

  if (billingQuery.isLoading) return <LoadingState />
  if (billingQuery.isError || !billingQuery.data) return <ErrorState error={billingQuery.error} onRetry={() => void billingQuery.refetch()} />
  const billing = billingQuery.data
  const personalPlans = (plansQuery.data?.plans ?? []).filter((plan) => plan.audience === 'personal')
  const organizationPlans = (plansQuery.data?.plans ?? []).filter((plan) => plan.audience === 'organization')
  const { aiCallsPerDay, portfoliosPerMonth, portfolioPdf } = billing.usage

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>{billing.plan?.name ?? '개인 Free'}</CardTitle>
              {billing.subscription?.endsAt ? <Badge>~{formatDate(billing.subscription.endsAt)}</Badge> : null}
            </div>
            <CardDescription>{billing.plan?.description}</CardDescription>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">AI 호출 (최근 24시간)</dt>
              <dd className="font-semibold text-ink-strong">
                {aiCallsPerDay.used} / {aiCallsPerDay.limit}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">AI 포트폴리오 (최근 30일)</dt>
              <dd className="font-semibold text-ink-strong">
                {portfoliosPerMonth.used} / {portfoliosPerMonth.limit ?? '무제한'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">포트폴리오 PDF 내보내기</dt>
              <dd className="font-semibold text-ink-strong">{portfolioPdf ? '사용 가능' : 'Pro 전용'}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-ink-muted">기관 프로그램 안에서 쓰는 AI 기능은 기관 요금제 한도를 따릅니다.</p>
          {billing.upgrade.available ? (
            <div className="mt-4 rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">
              <p>{billing.upgrade.message}</p>
              <Button className="mt-3 min-h-9 px-4" to="/support?new=billing" variant="secondary">
                Pro 이용 문의
              </Button>
            </div>
          ) : null}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>요금제 안내</CardTitle>
            <CardDescription>가격은 VAT 별도 기준이며 기관 요금제는 계약으로 확정됩니다.</CardDescription>
          </CardHeader>
          <ul className="space-y-3 text-sm">
            {[...personalPlans, ...organizationPlans].map((plan) => (
              <li className="flex flex-wrap items-baseline justify-between gap-2" key={plan.id}>
                <span className="font-semibold text-ink-strong">{plan.name}</span>
                <span className="text-ink-body">{formatPlanPrice(plan)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      {billing.invoices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>결제 내역</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-surface-border text-sm">
            {billing.invoices.map((invoice) => (
              <li className="flex items-center justify-between gap-3 py-2.5" key={invoice.id}>
                <span>
                  {invoice.invoiceNo} · {formatKrw(invoice.totalKrw)}
                </span>
                <Badge tone={INVOICE_STATUS_META[invoice.status].tone}>{INVOICE_STATUS_META[invoice.status].label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabs: TabItem[] = [
    { id: 'security', label: '보안·로그인', content: <SecurityTab /> },
    { id: 'plan', label: '요금제', content: <PlanTab /> },
  ]
  const requested = searchParams.get('tab') ?? 'security'
  const activeTab = tabs.some((tab) => tab.id === requested) ? requested : 'security'
  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-strong">계정 설정</h1>
        <Tabs activeTab={activeTab} onChange={(id) => setSearchParams(id === 'security' ? {} : { tab: id }, { replace: true })} tabs={tabs} variant="underline" />
      </div>
    </AppLayout>
  )
}
