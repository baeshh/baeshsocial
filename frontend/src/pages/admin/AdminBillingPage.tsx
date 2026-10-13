import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload } from 'lucide-react'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { AdminNav, StatCard } from '../../components/admin/AdminNav'
import { UsageBar } from '../../components/billing/UsageBar'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { resolveApiUrl } from '../../lib/api'
import { ACCESS_STATE_META, CONTRACT_STATUS_LABEL, formatKrw, INVOICE_STATUS_META } from '../../lib/commercial'
import { formatDate, toDateInput } from '../../lib/programs'
import {
  adminBillingOrg,
  adminBillingOrgs,
  adminBillingPlans,
  adminBillingSummary,
  adminContractDocument,
  adminCreateContract,
  adminCreateInvoice,
  adminCreateSubscription,
  adminIssueInvoice,
  adminRecordPayment,
  adminRenewSubscription,
  adminUploadContractDocument,
  adminVoidInvoice,
} from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { AdminBillingOrgDetail, Invoice } from '../../types/commercial'

const field = 'h-10 w-full rounded-xl border border-surface-border bg-white px-3 text-sm outline-none focus:border-brand-500'
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink-muted">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function useBillingMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>, success: string, orgId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      showToast(success)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'billing'] })
      if (orgId) void queryClient.invalidateQueries({ queryKey: ['organizations', orgId, 'billing'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
}

function SubscriptionForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const token = useAuthStore((state) => state.token)!
  const plansQuery = useQuery({ queryKey: ['admin', 'billing', 'plans'], queryFn: () => adminBillingPlans(token) })
  const plans = (plansQuery.data?.plans ?? []).filter((plan) => plan.audience === 'organization' && plan.active)
  const [planId, setPlanId] = useState('')
  const [status, setStatus] = useState<'active' | 'trial'>('active')
  const [startsAt, setStartsAt] = useState(today())
  const [endsAt, setEndsAt] = useState(plusDays(182))
  const [graceDays, setGraceDays] = useState(30)
  const [notes, setNotes] = useState('')
  const create = useBillingMutation(
    () =>
      adminCreateSubscription(token, orgId, {
        planId: planId || plans[0]?.id,
        status,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        graceDays,
        notes: notes || null,
      }),
    '구독을 적용했습니다. 기존 기간은 새 시작일에 종료됩니다.',
    orgId,
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined, { onSuccess: onDone })
  }
  return (
    <form className="grid gap-3 rounded-2xl bg-surface-muted p-4 sm:grid-cols-3" onSubmit={submit}>
      <Labeled label="요금제">
        <select className={field} onChange={(e) => setPlanId(e.target.value)} value={planId || plans[0]?.id || ''}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="상태">
        <select className={field} onChange={(e) => setStatus(e.target.value as 'active' | 'trial')} value={status}>
          <option value="active">정식</option>
          <option value="trial">체험</option>
        </select>
      </Labeled>
      <Labeled label="유예 기간(일)">
        <input className={field} min={0} max={365} onChange={(e) => setGraceDays(Number(e.target.value))} type="number" value={graceDays} />
      </Labeled>
      <Labeled label="시작일">
        <input className={field} onChange={(e) => setStartsAt(e.target.value)} required type="date" value={startsAt} />
      </Labeled>
      <Labeled label="종료일">
        <input className={field} onChange={(e) => setEndsAt(e.target.value)} type="date" value={endsAt} />
      </Labeled>
      <Labeled label="메모">
        <input className={field} maxLength={1000} onChange={(e) => setNotes(e.target.value)} value={notes} />
      </Labeled>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button onClick={onDone} variant="ghost">
          취소
        </Button>
        <Button disabled={create.isPending || plans.length === 0} type="submit">
          구독 적용
        </Button>
      </div>
    </form>
  )
}

function ContractForm({ detail, onDone }: { detail: AdminBillingOrgDetail; onDone: () => void }) {
  const token = useAuthStore((state) => state.token)!
  const orgId = detail.organization.id
  const [title, setTitle] = useState(`${detail.organization.name} BAESH 이용 계약`)
  const [amountKrw, setAmountKrw] = useState(5_000_000)
  const [startsAt, setStartsAt] = useState(toDateInput(detail.current?.startsAt) || today())
  const [endsAt, setEndsAt] = useState(toDateInput(detail.current?.endsAt) || plusDays(182))
  const [status, setStatus] = useState('signed')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const create = useBillingMutation(
    () =>
      adminCreateContract(token, orgId, {
        title,
        subscriptionId: detail.current?.id ?? null,
        status,
        amountKrw,
        vatKrw: Math.round(amountKrw * 0.1),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(`${endsAt}T23:59:59`).toISOString(),
        billingContactName: contactName || null,
        billingContactEmail: contactEmail || null,
        taxInfo: businessNumber ? { businessNumber, companyName: detail.organization.name } : null,
      }),
    '계약을 등록했습니다.',
    orgId,
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined, { onSuccess: onDone })
  }
  return (
    <form className="grid gap-3 rounded-2xl bg-surface-muted p-4 sm:grid-cols-3" onSubmit={submit}>
      <div className="sm:col-span-2">
        <Labeled label="계약명">
          <input className={field} minLength={2} onChange={(e) => setTitle(e.target.value)} required value={title} />
        </Labeled>
      </div>
      <Labeled label="상태">
        <select className={field} onChange={(e) => setStatus(e.target.value)} value={status}>
          <option value="draft">초안</option>
          <option value="sent">발송</option>
          <option value="signed">서명 완료</option>
          <option value="active">이행 중</option>
        </select>
      </Labeled>
      <Labeled label="공급가액(원, VAT 10% 별도)">
        <input className={field} min={0} onChange={(e) => setAmountKrw(Number(e.target.value))} required type="number" value={amountKrw} />
      </Labeled>
      <Labeled label="시작일">
        <input className={field} onChange={(e) => setStartsAt(e.target.value)} required type="date" value={startsAt} />
      </Labeled>
      <Labeled label="종료일">
        <input className={field} onChange={(e) => setEndsAt(e.target.value)} required type="date" value={endsAt} />
      </Labeled>
      <Labeled label="정산 담당자">
        <input className={field} onChange={(e) => setContactName(e.target.value)} value={contactName} />
      </Labeled>
      <Labeled label="담당자 이메일 (세금계산서 수신)">
        <input className={field} onChange={(e) => setContactEmail(e.target.value)} type="email" value={contactEmail} />
      </Labeled>
      <Labeled label="사업자등록번호">
        <input className={field} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="000-00-00000" value={businessNumber} />
      </Labeled>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button onClick={onDone} variant="ghost">
          취소
        </Button>
        <Button disabled={create.isPending} type="submit">
          계약 등록
        </Button>
      </div>
    </form>
  )
}

function InvoiceForm({ detail, onDone }: { detail: AdminBillingOrgDetail; onDone: () => void }) {
  const token = useAuthStore((state) => state.token)!
  const orgId = detail.organization.id
  const contract = detail.contracts[0]
  const [description, setDescription] = useState(detail.current?.plan ? `${detail.current.plan.name} 이용료` : 'BAESH 이용료')
  const [unitKrw, setUnitKrw] = useState(contract?.amountKrw ?? 5_000_000)
  const [quantity, setQuantity] = useState(1)
  const [vatMode, setVatMode] = useState<'exclusive' | 'inclusive' | 'exempt'>('exclusive')
  const [dueAt, setDueAt] = useState(plusDays(30))
  const subtotal = unitKrw * quantity
  const preview = vatMode === 'exempt' ? subtotal : vatMode === 'inclusive' ? subtotal : subtotal + Math.round(subtotal * 0.1)
  const create = useBillingMutation(
    () =>
      adminCreateInvoice(token, {
        organizationId: orgId,
        subscriptionId: detail.current?.id ?? null,
        contractId: contract?.id ?? null,
        items: [{ description, quantity, unitKrw }],
        vatMode,
        dueAt: new Date(`${dueAt}T23:59:59`).toISOString(),
        periodStart: detail.current?.startsAt ?? null,
        periodEnd: detail.current?.endsAt ?? null,
      }),
    '청구서 초안을 만들었습니다. 확인 후 발행하세요.',
    orgId,
  )
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(undefined, { onSuccess: onDone })
  }
  return (
    <form className="grid gap-3 rounded-2xl bg-surface-muted p-4 sm:grid-cols-3" onSubmit={submit}>
      <div className="sm:col-span-3">
        <Labeled label="품목">
          <input className={field} onChange={(e) => setDescription(e.target.value)} required value={description} />
        </Labeled>
      </div>
      <Labeled label="단가(원)">
        <input className={field} min={0} onChange={(e) => setUnitKrw(Number(e.target.value))} required type="number" value={unitKrw} />
      </Labeled>
      <Labeled label="수량">
        <input className={field} min={1} onChange={(e) => setQuantity(Number(e.target.value))} required type="number" value={quantity} />
      </Labeled>
      <Labeled label="부가세">
        <select className={field} onChange={(e) => setVatMode(e.target.value as typeof vatMode)} value={vatMode}>
          <option value="exclusive">별도 (+10%)</option>
          <option value="inclusive">포함</option>
          <option value="exempt">면세</option>
        </select>
      </Labeled>
      <Labeled label="납부 기한">
        <input className={field} onChange={(e) => setDueAt(e.target.value)} required type="date" value={dueAt} />
      </Labeled>
      <p className="self-end text-sm text-ink-body sm:col-span-2">청구 합계 {formatKrw(preview)}</p>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button onClick={onDone} variant="ghost">
          취소
        </Button>
        <Button disabled={create.isPending} type="submit">
          초안 만들기
        </Button>
      </div>
    </form>
  )
}

function InvoiceRow({ invoice, orgId }: { invoice: Invoice; orgId: string }) {
  const token = useAuthStore((state) => state.token)!
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState(invoice.balanceKrw)
  const [paidAt, setPaidAt] = useState(today())
  const [reference, setReference] = useState('')
  const meta = INVOICE_STATUS_META[invoice.status]
  const issue = useBillingMutation(
    () => {
      const taxInvoiceNo = window.prompt('세금계산서 승인번호 (없으면 비워 두세요)') ?? null
      return adminIssueInvoice(token, invoice.id, { taxInvoiceNo: taxInvoiceNo || null })
    },
    '청구서를 발행했습니다. 조직 관리자에게 알림이 갔습니다.',
    orgId,
  )
  const pay = useBillingMutation(
    () => adminRecordPayment(token, invoice.id, { method: 'bank_transfer', amountKrw: amount, paidAt: new Date(paidAt).toISOString(), reference: reference || null }),
    '입금을 기록했습니다.',
    orgId,
  )
  const voidInvoice = useBillingMutation((reason: string) => adminVoidInvoice(token, invoice.id, reason), '청구서를 취소했습니다.', orgId)

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-strong">
            {invoice.invoiceNo} · {formatKrw(invoice.totalKrw)}
            <span className="ml-1 text-xs font-normal text-ink-muted">
              (공급가 {formatKrw(invoice.supplyKrw)} + VAT {formatKrw(invoice.vatKrw)})
            </span>
          </p>
          <p className="text-xs text-ink-muted">
            기한 {formatDate(invoice.dueAt)} · 입금 {formatKrw(invoice.paidKrw)} · 잔액 {formatKrw(invoice.balanceKrw)}
            {invoice.taxInvoiceNo ? ` · 세금계산서 ${invoice.taxInvoiceNo}` : ''}
          </p>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {invoice.status === 'draft' ? (
          <Button className="min-h-8 px-3" disabled={issue.isPending} onClick={() => issue.mutate(undefined)}>
            발행
          </Button>
        ) : null}
        {invoice.status === 'issued' || invoice.status === 'overdue' ? (
          <Button className="min-h-8 px-3" onClick={() => setPaying((value) => !value)} variant="secondary">
            입금 기록
          </Button>
        ) : null}
        {invoice.status !== 'paid' && invoice.status !== 'void' ? (
          <Button
            className="min-h-8 px-3"
            disabled={voidInvoice.isPending}
            onClick={() => {
              const reason = window.prompt('취소 사유를 입력하세요')
              if (reason && reason.trim().length >= 2) voidInvoice.mutate(reason.trim())
            }}
            variant="ghost"
          >
            취소
          </Button>
        ) : null}
      </div>
      {paying ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted p-3"
          onSubmit={(event) => {
            event.preventDefault()
            pay.mutate(undefined, { onSuccess: () => setPaying(false) })
          }}
        >
          <Labeled label="입금액">
            <input className={field} min={1} onChange={(e) => setAmount(Number(e.target.value))} type="number" value={amount} />
          </Labeled>
          <Labeled label="입금일">
            <input className={field} onChange={(e) => setPaidAt(e.target.value)} type="date" value={paidAt} />
          </Labeled>
          <Labeled label="입금자명·메모">
            <input className={field} onChange={(e) => setReference(e.target.value)} value={reference} />
          </Labeled>
          <Button className="min-h-10" disabled={pay.isPending} type="submit">
            저장
          </Button>
        </form>
      ) : null}
    </li>
  )
}

function OrgDetail({ orgId }: { orgId: string }) {
  const token = useAuthStore((state) => state.token)!
  const [form, setForm] = useState<'subscription' | 'contract' | 'invoice' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadFor, setUploadFor] = useState<string | null>(null)
  const query = useQuery({ queryKey: ['admin', 'billing', 'org', orgId], queryFn: () => adminBillingOrg(token, orgId) })
  const renew = useBillingMutation(
    ({ subscriptionId, endsAt }: { subscriptionId: string; endsAt: string }) =>
      adminRenewSubscription(token, subscriptionId, { endsAt: new Date(`${endsAt}T23:59:59`).toISOString() }),
    '구독을 갱신했습니다.',
    orgId,
  )
  const upload = useBillingMutation(({ contractId, file }: { contractId: string; file: File }) => adminUploadContractDocument(token, contractId, file), '계약서를 올렸습니다.', orgId)

  if (query.isLoading) return <LoadingState />
  if (query.isError || !query.data) return <p className="text-sm text-red-700">{(query.error as Error | null)?.message}</p>
  const detail = query.data
  const current = detail.current

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{detail.organization.name}</CardTitle>
            {current ? <Badge tone={ACCESS_STATE_META[current.accessState].tone}>{ACCESS_STATE_META[current.accessState].label}</Badge> : <Badge>구독 없음</Badge>}
          </div>
          <CardDescription>
            {current
              ? `${current.plan?.name} · ${formatDate(current.startsAt)} ~ ${current.endsAt ? formatDate(current.endsAt) : '기한 없음'} · 유예 ${current.graceDays}일`
              : '적용된 구독이 없습니다.'}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-9 px-4" onClick={() => setForm(form === 'subscription' ? null : 'subscription')} variant="secondary">
            새 구독 적용
          </Button>
          {current?.endsAt ? (
            <Button
              className="min-h-9 px-4"
              disabled={renew.isPending}
              onClick={() => {
                const suggested = new Date(new Date(current.endsAt!).getTime() + 182 * 86_400_000).toISOString().slice(0, 10)
                const endsAt = window.prompt('갱신 후 종료일 (YYYY-MM-DD)', suggested)
                if (endsAt && /^\d{4}-\d{2}-\d{2}$/.test(endsAt)) renew.mutate({ subscriptionId: current.id, endsAt })
              }}
              variant="secondary"
            >
              같은 요금제로 갱신
            </Button>
          ) : null}
          <Button className="min-h-9 px-4" onClick={() => setForm(form === 'contract' ? null : 'contract')} variant="secondary">
            계약 등록
          </Button>
          <Button className="min-h-9 px-4" onClick={() => setForm(form === 'invoice' ? null : 'invoice')} variant="secondary">
            청구서 작성
          </Button>
        </div>
        <div className="mt-4">
          {form === 'subscription' ? <SubscriptionForm onDone={() => setForm(null)} orgId={orgId} /> : null}
          {form === 'contract' ? <ContractForm detail={detail} onDone={() => setForm(null)} /> : null}
          {form === 'invoice' ? <InvoiceForm detail={detail} onDone={() => setForm(null)} /> : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {detail.usage.map((row) => (
            <UsageBar key={row.key} row={row} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>청구서</CardTitle>
          <CardDescription>발행하면 조직 관리자에게 알림이 가고, 납부 기한이 지나면 자동으로 연체·미납 처리됩니다.</CardDescription>
        </CardHeader>
        {detail.invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">청구서가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {detail.invoices.map((invoice) => (
              <InvoiceRow invoice={invoice} key={invoice.id} orgId={orgId} />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>계약</CardTitle>
          </CardHeader>
          <input
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file && uploadFor) upload.mutate({ contractId: uploadFor, file })
              event.target.value = ''
            }}
            ref={fileRef}
            type="file"
          />
          {detail.contracts.length === 0 ? (
            <p className="text-sm text-ink-muted">계약이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-surface-border text-sm">
              {detail.contracts.map((contract) => (
                <li className="flex flex-wrap items-center gap-2 py-3" key={contract.id}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-strong">{contract.title}</p>
                    <p className="text-xs text-ink-muted">
                      {contract.contractNo} · {formatDate(contract.startsAt)} ~ {formatDate(contract.endsAt)} · {formatKrw(contract.amountKrw)} + VAT · {CONTRACT_STATUS_LABEL[contract.status]}
                    </p>
                  </div>
                  {contract.hasDocument ? (
                    <Button
                      className="min-h-8 gap-1 px-3"
                      onClick={() =>
                        void adminContractDocument(token, contract.id).then(
                          ({ url }) => window.open(resolveApiUrl(url), '_blank', 'noopener'),
                          (error: Error) => showToast(error.message, 'error'),
                        )
                      }
                      variant="ghost"
                    >
                      <FileText size={14} /> 보기
                    </Button>
                  ) : null}
                  <Button
                    className="min-h-8 gap-1 px-3"
                    disabled={upload.isPending}
                    onClick={() => {
                      setUploadFor(contract.id)
                      fileRef.current?.click()
                    }}
                    variant="ghost"
                  >
                    <Upload size={14} /> PDF
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>구독 이력</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-surface-border text-sm">
            {detail.subscriptions.map((subscription) => (
              <li className="py-2.5" key={subscription.id}>
                <p className="font-semibold text-ink-strong">
                  {subscription.plan?.name} <span className="text-xs font-normal text-ink-muted">· {subscription.status}</span>
                </p>
                <p className="text-xs text-ink-muted">
                  {formatDate(subscription.startsAt)} ~ {subscription.endsAt ? formatDate(subscription.endsAt) : '기한 없음'}
                  {subscription.notes ? ` · ${subscription.notes}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

export function AdminBillingPage() {
  const token = useAuthStore((state) => state.token)!
  const [state, setState] = useState('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const summaryQuery = useQuery({ queryKey: ['admin', 'billing', 'summary'], queryFn: () => adminBillingSummary(token) })
  const orgsQuery = useQuery({ queryKey: ['admin', 'billing', 'orgs', state, q], queryFn: () => adminBillingOrgs(token, { state, q: q || undefined }) })
  const summary = summaryQuery.data

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminNav description="기관 구독·계약·청구서·입금을 관리합니다. 모든 변경은 감사 로그에 남습니다." title="과금·계약 관리" />

        {summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard hint={`올해 ${formatKrw(summary.revenue.paidThisYearKrw)}`} label="이번 달 입금" value={formatKrw(summary.revenue.paidThisMonthKrw)} />
            <StatCard hint={`${summary.receivables.outstandingInvoices}건`} label="미수금" value={formatKrw(summary.receivables.outstandingKrw)} />
            <StatCard label="연체 청구서" tone={summary.receivables.overdueInvoices ? 'red' : undefined} value={`${summary.receivables.overdueInvoices}건`} />
            <StatCard
              hint={`유예 ${summary.organizations.byState.grace} · 만료 ${summary.organizations.byState.expired} · 미납 ${summary.organizations.byState.past_due}`}
              label="이용 중 기관"
              value={`${summary.organizations.byState.active} / ${summary.organizations.total}`}
            />
            <StatCard label="개인 Pro" value={`${summary.personalProSubscribers}명`} />
          </div>
        ) : null}

        {summary && summary.expiring.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>30일 안에 만료되는 기관</CardTitle>
            </CardHeader>
            <ul className="flex flex-wrap gap-2 text-sm">
              {summary.expiring.map((item) => (
                <li key={item.id}>
                  <button className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-900" onClick={() => setSelected(item.id)} type="button">
                    {item.name} · D-{item.daysLeft}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <Card className="p-0">
            <div className="flex flex-wrap gap-2 border-b border-surface-border p-4">
              <input className={`${field} max-w-48`} onChange={(e) => setQ(e.target.value)} placeholder="기관 검색" value={q} />
              <select className={`${field} max-w-40`} onChange={(e) => setState(e.target.value)} value={state}>
                <option value="all">전체 상태</option>
                <option value="expiring">30일 내 만료</option>
                {Object.entries(ACCESS_STATE_META).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            {orgsQuery.isLoading ? (
              <LoadingState />
            ) : (
              <ul className="max-h-[70vh] divide-y divide-surface-border overflow-y-auto">
                {(orgsQuery.data?.organizations ?? []).map((org) => {
                  const meta = ACCESS_STATE_META[org.state]
                  return (
                    <li key={org.id}>
                      <button
                        className={`w-full px-4 py-3 text-left hover:bg-surface-muted ${selected === org.id ? 'bg-brand-50' : ''}`}
                        onClick={() => setSelected(org.id)}
                        type="button"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink-strong">{org.name}</span>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {org.plan?.name ?? '요금제 없음'} · 구성원 {org.members} · 프로그램 {org.programs}
                          {org.daysLeft !== null ? ` · D-${org.daysLeft}` : ''}
                          {org.outstandingKrw ? ` · 미수 ${formatKrw(org.outstandingKrw)}` : ''}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          {selected ? <OrgDetail key={selected} orgId={selected} /> : <Card className="flex items-center justify-center text-sm text-ink-muted">왼쪽에서 기관을 선택하세요.</Card>}
        </div>
      </div>
    </AppLayout>
  )
}
