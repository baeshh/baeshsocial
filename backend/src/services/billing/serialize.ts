import type { Contract, Invoice, Payment, Plan, Subscription } from '@prisma/client'
import { accessState, daysLeft } from './subscriptions.js'
import { planLimits } from './plans.js'

export function serializePlan(plan: Plan) {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    audience: plan.audience.toLowerCase(),
    orgTypes: plan.orgTypes.map((type) => type.toLowerCase()),
    priceKrw: plan.priceKrw,
    priceMaxKrw: plan.priceMaxKrw,
    billingPeriod: plan.billingPeriod.toLowerCase(),
    vatIncluded: plan.vatIncluded,
    limits: planLimits(plan),
    features: plan.features,
    isPublic: plan.isPublic,
    active: plan.active,
    sortOrder: plan.sortOrder,
  }
}

export function serializeSubscription(subscription: Subscription & { plan?: Plan }) {
  const state = accessState(subscription)
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    userId: subscription.userId,
    plan: subscription.plan ? { id: subscription.plan.id, key: subscription.plan.key, name: subscription.plan.name } : null,
    status: subscription.status.toLowerCase(),
    accessState: state,
    startsAt: subscription.startsAt,
    endsAt: subscription.endsAt,
    graceDays: subscription.graceDays,
    graceEndsAt: subscription.endsAt ? new Date(subscription.endsAt.getTime() + subscription.graceDays * 86_400_000) : null,
    daysLeft: daysLeft(subscription),
    limitOverrides: subscription.limitOverrides,
    effectiveLimits: subscription.plan ? planLimits(subscription.plan, subscription.limitOverrides) : null,
    autoRenew: subscription.autoRenew,
    canceledAt: subscription.canceledAt,
    notes: subscription.notes,
    createdAt: subscription.createdAt,
  }
}

export function serializeContract(contract: Contract) {
  return {
    id: contract.id,
    organizationId: contract.organizationId,
    subscriptionId: contract.subscriptionId,
    contractNo: contract.contractNo,
    title: contract.title,
    status: contract.status.toLowerCase(),
    amountKrw: contract.amountKrw,
    vatKrw: contract.vatKrw,
    startsAt: contract.startsAt,
    endsAt: contract.endsAt,
    signedAt: contract.signedAt,
    billingContactName: contract.billingContactName,
    billingContactEmail: contract.billingContactEmail,
    taxInfo: contract.taxInfo,
    hasDocument: Boolean(contract.documentKey),
    documentName: contract.documentName,
    memo: contract.memo,
    createdAt: contract.createdAt,
  }
}

export function serializeInvoice(invoice: Invoice & { payments?: Payment[] }) {
  const overdue = invoice.status === 'ISSUED' && invoice.dueAt !== null && invoice.dueAt < new Date()
  const paidKrw = (invoice.payments ?? [])
    .filter((payment) => payment.status === 'CONFIRMED')
    .reduce((sum, payment) => sum + payment.amountKrw, 0)
  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    organizationId: invoice.organizationId,
    userId: invoice.userId,
    subscriptionId: invoice.subscriptionId,
    contractId: invoice.contractId,
    status: overdue ? 'overdue' : invoice.status.toLowerCase(),
    supplyKrw: invoice.supplyKrw,
    vatKrw: invoice.vatKrw,
    totalKrw: invoice.totalKrw,
    paidKrw,
    balanceKrw: Math.max(0, invoice.totalKrw - paidKrw),
    items: invoice.items,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    voidedAt: invoice.voidedAt,
    taxInvoiceNo: invoice.taxInvoiceNo,
    memo: invoice.memo,
    payments: (invoice.payments ?? []).map((payment) => ({
      id: payment.id,
      method: payment.method.toLowerCase(),
      status: payment.status.toLowerCase(),
      amountKrw: payment.amountKrw,
      paidAt: payment.paidAt,
      reference: payment.reference,
      memo: payment.memo,
    })),
    createdAt: invoice.createdAt,
  }
}
