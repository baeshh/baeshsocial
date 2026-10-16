import { InvoiceStatus, SubscriptionStatus, UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { assertPersonalFeature } from '../src/services/billing/entitlements.js'
import { ensureDefaultPlans } from '../src/services/billing/plans.js'
import { currentOrgSubscription } from '../src/services/billing/subscriptions.js'
import { runInvoiceLifecycle, runSubscriptionLifecycle } from '../src/services/jobs/scheduler.js'
import { api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

const DAY = 86_400_000

async function setup() {
  const owner = await createUserWithToken({ name: '대학 관리자' })
  const admin = await createUserWithToken({ role: UserRole.ADMIN, name: '운영자' })
  const org = await createOrg(owner.user.id, { name: '요금제대학교' })
  return { owner, admin, org }
}

async function planId(key: string) {
  await ensureDefaultPlans()
  return (await prisma.plan.findUniqueOrThrow({ where: { key } })).id
}

beforeEach(resetDb)

describe('plan limits', () => {
  it('blocks creating an active program beyond the trial limit with 402 plan_limit', async () => {
    const { owner, org } = await setup()
    await createProgram(org.id, { title: 'P1' })
    await createProgram(org.id, { title: 'P2' })
    const response = await api()
      .post(`/api/organizations/${org.id}/programs`)
      .set(bearer(owner.token))
      .send({ title: 'P3', status: 'active', managerUserIds: [] })
    expect(response.status).toBe(402)
    expect(response.body.details).toMatchObject({ code: 'plan_limit', metric: 'activePrograms', limit: 2 })

    const draft = await api()
      .post(`/api/organizations/${org.id}/programs`)
      .set(bearer(owner.token))
      .send({ title: 'P3 준비', status: 'draft', managerUserIds: [] })
    expect(draft.status).toBe(201)
  })

  it('a university subscription replaces the trial and raises the limits', async () => {
    const { owner, admin, org } = await setup()
    await createProgram(org.id, { title: 'P1' })
    await createProgram(org.id, { title: 'P2' })
    const now = new Date()
    const subscribe = await api()
      .post(`/api/admin/billing/organizations/${org.id}/subscriptions`)
      .set(bearer(admin.token))
      .send({ planId: await planId('university'), startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 180 * DAY).toISOString() })
    expect(subscribe.status).toBe(201)
    const current = await currentOrgSubscription(org.id)
    expect(current?.plan.key).toBe('university')
    const trial = await prisma.subscription.findFirstOrThrow({ where: { organizationId: org.id, status: SubscriptionStatus.TRIAL } })
    expect(trial.endsAt!.getTime()).toBeLessThanOrEqual(now.getTime() + 1000)

    const response = await api()
      .post(`/api/organizations/${org.id}/programs`)
      .set(bearer(owner.token))
      .send({ title: 'P3', status: 'active', managerUserIds: [] })
    expect(response.status).toBe(201)
    expect(await prisma.auditLog.count({ where: { action: 'billing.subscription_create', organizationId: org.id } })).toBe(1)
  })

  it('a date-only start earlier than the trial start still supersedes the trial', async () => {
    const { admin, org } = await setup()
    const today = new Date().toISOString().slice(0, 10)
    await prisma.subscription.updateMany({ where: { organizationId: org.id }, data: { startsAt: new Date(`${today}T05:00:00.000Z`) } })
    const subscribe = await api()
      .post(`/api/admin/billing/organizations/${org.id}/subscriptions`)
      .set(bearer(admin.token))
      .send({ planId: await planId('university'), startsAt: today, endsAt: new Date(Date.now() + 180 * DAY).toISOString().slice(0, 10) })
    expect(subscribe.status).toBe(201)
    expect((await currentOrgSubscription(org.id))?.plan.key).toBe('university')
    const trial = await prisma.subscription.findFirstOrThrow({ where: { organizationId: org.id, plan: { key: 'org_trial' } } })
    expect(trial.status).toBe(SubscriptionStatus.CANCELED)
  })

  it('after expiry the organization is read-only: reads work, creation returns 402', async () => {
    const { owner, org } = await setup()
    await createProgram(org.id, { title: '기존 프로그램' })
    await prisma.subscription.updateMany({
      where: { organizationId: org.id },
      data: { endsAt: new Date(Date.now() - 20 * DAY), graceDays: 14 },
    })
    const lifecycle = await runSubscriptionLifecycle()
    expect(lifecycle.expired).toBe(1)

    const list = await api().get(`/api/organizations/${org.id}/programs`).set(bearer(owner.token))
    expect(list.status).toBe(200)
    expect(list.body.programs).toHaveLength(1)

    const create = await api()
      .post(`/api/organizations/${org.id}/programs`)
      .set(bearer(owner.token))
      .send({ title: '신규', status: 'draft', managerUserIds: [] })
    expect(create.status).toBe(402)
    expect(create.body.details).toMatchObject({ code: 'subscription_inactive', state: 'expired' })

    const billing = await api().get(`/api/organizations/${org.id}/billing`).set(bearer(owner.token))
    expect(billing.body.state).toBe('expired')
    expect(await prisma.program.count({ where: { organizationId: org.id } })).toBe(1)
  })

  it('sends each expiry notice once', async () => {
    const { org } = await setup()
    await prisma.subscription.updateMany({ where: { organizationId: org.id }, data: { endsAt: new Date(Date.now() + 6.5 * DAY) } })
    const first = await runSubscriptionLifecycle()
    const second = await runSubscriptionLifecycle()
    expect(first.notices).toBe(1)
    expect(second.notices).toBe(0)
    expect(await prisma.notification.count({ where: { title: { contains: '7일 전' } } })).toBe(1)
  })
})

describe('invoices and payments', () => {
  it('computes VAT, goes overdue (subscription past due), and recovers on payment', async () => {
    const { admin, org } = await setup()
    const subscription = await currentOrgSubscription(org.id)
    await prisma.subscription.update({ where: { id: subscription!.id }, data: { status: SubscriptionStatus.ACTIVE } })

    const created = await api()
      .post('/api/admin/billing/invoices')
      .set(bearer(admin.token))
      .send({
        organizationId: org.id,
        subscriptionId: subscription!.id,
        items: [{ description: '2026-2학기 대학 요금제', quantity: 1, unitKrw: 5_000_000 }],
        vatMode: 'exclusive',
      })
    expect(created.status).toBe(201)
    expect(created.body.invoice).toMatchObject({ supplyKrw: 5_000_000, vatKrw: 500_000, totalKrw: 5_500_000, status: 'draft' })
    expect(created.body.invoice.invoiceNo).toMatch(/^INV-\d{6}-\d{4}$/)
    const invoiceId = created.body.invoice.id

    const issued = await api()
      .post(`/api/admin/billing/invoices/${invoiceId}/issue`)
      .set(bearer(admin.token))
      .send({ dueAt: new Date(Date.now() - DAY).toISOString() })
    expect(issued.status).toBe(200)

    expect((await runInvoiceLifecycle()).overdue).toBe(1)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe(InvoiceStatus.OVERDUE)
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription!.id } })).status).toBe(SubscriptionStatus.PAST_DUE)

    const partial = await api()
      .post(`/api/admin/billing/invoices/${invoiceId}/payments`)
      .set(bearer(admin.token))
      .send({ method: 'bank_transfer', amountKrw: 2_000_000, paidAt: new Date().toISOString() })
    expect(partial.status).toBe(201)
    expect(partial.body.invoice.balanceKrw).toBe(3_500_000)

    const rest = await api()
      .post(`/api/admin/billing/invoices/${invoiceId}/payments`)
      .set(bearer(admin.token))
      .send({ method: 'bank_transfer', amountKrw: 3_500_000, paidAt: new Date().toISOString(), reference: '입금자 요금제대학교' })
    expect(rest.body.invoice.status).toBe('paid')
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: subscription!.id } })).status).toBe(SubscriptionStatus.ACTIVE)
    expect(await prisma.auditLog.count({ where: { action: 'billing.payment_record' } })).toBe(2)
  })

  it('handles VAT-inclusive amounts without rounding drift', async () => {
    const { admin, org } = await setup()
    const response = await api()
      .post('/api/admin/billing/invoices')
      .set(bearer(admin.token))
      .send({ organizationId: org.id, items: [{ description: '부가세 포함', quantity: 1, unitKrw: 29_000 }], vatMode: 'inclusive' })
    expect(response.body.invoice.totalKrw).toBe(29_000)
    expect(response.body.invoice.supplyKrw + response.body.invoice.vatKrw).toBe(29_000)
  })

  it('org managers see usage but not contracts or invoices', async () => {
    const { owner, org } = await setup()
    const manager = await createUserWithToken()
    await prisma.organizationMember.create({ data: { organizationId: org.id, userId: manager.user.id, role: 'MANAGER', status: 'ACTIVE' } })
    const asManager = await api().get(`/api/organizations/${org.id}/billing`).set(bearer(manager.token))
    expect(asManager.status).toBe(200)
    expect(asManager.body.usage.length).toBeGreaterThan(0)
    expect(asManager.body.canSeeContracts).toBe(false)
    expect(asManager.body.invoices).toEqual([])
    const asOwner = await api().get(`/api/organizations/${org.id}/billing`).set(bearer(owner.token))
    expect(asOwner.body.canSeeContracts).toBe(true)
  })
})

describe('personal plans', () => {
  it('Free users cannot export portfolio PDFs until Pro is granted', async () => {
    const { admin } = await setup()
    const student = await createUserWithToken()
    await expect(assertPersonalFeature(student.user.id, 'portfolioPdf')).rejects.toMatchObject({ status: 402 })
    const grant = await api()
      .post(`/api/admin/billing/users/${student.user.id}/personal-plan`)
      .set(bearer(admin.token))
      .send({ planId: await planId('personal_pro'), endsAt: new Date(Date.now() + 30 * DAY).toISOString() })
    expect(grant.status).toBe(201)
    await expect(assertPersonalFeature(student.user.id, 'portfolioPdf')).resolves.toBeUndefined()
    const me = await api().get('/api/billing/me').set(bearer(student.token))
    expect(me.body.plan.key).toBe('personal_pro')
  })
})
