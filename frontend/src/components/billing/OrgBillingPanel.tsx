import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, FileText } from 'lucide-react'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { UsageBar } from './UsageBar'
import { resolveApiUrl } from '../../lib/api'
import { ACCESS_STATE_META, formatKrw, formatPlanPrice, INVOICE_STATUS_META } from '../../lib/commercial'
import { formatDate } from '../../lib/programs'
import { getOrgBilling, getOrgContractDocument } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'

export function OrgBillingPanel({ orgId }: { orgId: string }) {
  const token = useAuthStore((state) => state.token)
  const query = useQuery({ queryKey: ['organizations', orgId, 'billing'], queryFn: () => getOrgBilling(token!, orgId), enabled: Boolean(token) })
  const download = useMutation({
    mutationFn: (contractId: string) => getOrgContractDocument(token!, orgId, contractId),
    onSuccess: ({ url }) => window.open(resolveApiUrl(url), '_blank', 'noopener'),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (query.isLoading) return <LoadingState />
  if (query.isError || !query.data) return <p className="text-sm text-red-700">{(query.error as Error | null)?.message ?? '요금제 정보를 불러오지 못했습니다.'}</p>

  const billing = query.data
  const state = ACCESS_STATE_META[billing.state]
  const subscription = billing.subscription

  return (
    <div className="space-y-5">
      {billing.warnings.length > 0 ? (
        <div className="space-y-2">
          {billing.warnings.map((warning) => (
            <p
              className={
                warning.level === 'critical'
                  ? 'flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800'
                  : 'flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900'
              }
              key={warning.key}
            >
              <AlertTriangle className="shrink-0" size={16} />
              {warning.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{billing.plan?.name ?? '요금제 없음'}</CardTitle>
              <Badge tone={state.tone}>{state.label}</Badge>
              {subscription?.status === 'trial' ? <Badge tone="purple">체험</Badge> : null}
            </div>
            <CardDescription>{state.description}</CardDescription>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">이용 기간</dt>
              <dd className="text-right font-semibold text-ink-strong">
                {subscription ? `${formatDate(subscription.startsAt)} ~ ${subscription.endsAt ? formatDate(subscription.endsAt) : '기한 없음'}` : '—'}
              </dd>
            </div>
            {billing.daysLeft !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">남은 기간</dt>
                <dd className="font-semibold text-ink-strong">{billing.daysLeft > 0 ? `${billing.daysLeft}일` : '종료'}</dd>
              </div>
            ) : null}
            {subscription?.graceEndsAt ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">유예 종료</dt>
                <dd className="font-semibold text-ink-strong">{formatDate(subscription.graceEndsAt)}</dd>
              </div>
            ) : null}
            {billing.plan ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">기준 가격</dt>
                <dd className="text-right text-ink-strong">{formatPlanPrice(billing.plan)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 space-y-1.5 rounded-2xl bg-surface-muted p-4 text-xs leading-5 text-ink-body">
            <p>{billing.policy.grace}</p>
            <p>{billing.policy.expired}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-9 px-4" to={`/support?new=billing&org=${orgId}`} variant="secondary">
              계약·갱신 문의
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>사용량</CardTitle>
            <CardDescription>PostgreSQL의 실제 데이터로 계산합니다. 한도에 도달하면 새 항목을 만들 수 없습니다(기존 자료는 그대로 유지).</CardDescription>
          </CardHeader>
          <div className="space-y-4">
            {billing.usage.map((row) => (
              <UsageBar key={row.key} row={row} />
            ))}
          </div>
        </Card>
      </div>

      {billing.canSeeContracts ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>계약</CardTitle>
            </CardHeader>
            {billing.contracts.length === 0 ? (
              <p className="text-sm text-ink-muted">등록된 계약이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-surface-border text-sm">
                {billing.contracts.map((contract) => (
                  <li className="flex flex-wrap items-center gap-3 py-3" key={contract.id}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-strong">{contract.title}</p>
                      <p className="text-xs text-ink-muted">
                        {contract.contractNo} · {formatDate(contract.startsAt)} ~ {formatDate(contract.endsAt)} · {formatKrw(contract.amountKrw + contract.vatKrw)}
                      </p>
                    </div>
                    {contract.hasDocument ? (
                      <Button className="min-h-9 gap-1.5 px-3" disabled={download.isPending} onClick={() => download.mutate(contract.id)} variant="ghost">
                        <FileText size={15} /> 계약서
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>청구서</CardTitle>
              <CardDescription>세금계산서 번호는 발행 후 표시됩니다. 입금 확인은 운영팀이 처리합니다.</CardDescription>
            </CardHeader>
            {billing.invoices.length === 0 ? (
              <p className="text-sm text-ink-muted">발행된 청구서가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-surface-border text-sm">
                {billing.invoices.map((invoice) => {
                  const meta = INVOICE_STATUS_META[invoice.status]
                  return (
                    <li className="flex flex-wrap items-center gap-3 py-3" key={invoice.id}>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink-strong">
                          {invoice.invoiceNo} · {formatKrw(invoice.totalKrw)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          납부기한 {formatDate(invoice.dueAt)}
                          {invoice.balanceKrw > 0 && invoice.status !== 'void' ? ` · 미납 ${formatKrw(invoice.balanceKrw)}` : ''}
                          {invoice.taxInvoiceNo ? ` · 세금계산서 ${invoice.taxInvoiceNo}` : ''}
                        </p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">계약서와 청구서는 조직 관리자만 볼 수 있습니다.</p>
      )}
    </div>
  )
}
