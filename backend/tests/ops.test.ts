import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { captureError } from '../src/services/ops/errors.js'
import { flushRequestMetrics } from '../src/services/ops/metrics.js'
import { api, bearer, createOrg, createUserWithToken, prisma, resetDb } from './helpers.js'

const OPS_TOKEN = process.env.OPS_INGEST_TOKEN!

beforeEach(resetDb)

describe('health', () => {
  it('reports liveness with version and DB readiness', async () => {
    const live = await api().get('/api/health')
    expect(live.status).toBe(200)
    expect(live.body.version).toBeTruthy()
    expect(live.headers['x-request-id']).toBeTruthy()
    const ready = await api().get('/api/health/ready')
    expect(ready.status).toBe(200)
    expect(ready.body.db.ok).toBe(true)
  })

  it('sets security headers', async () => {
    const response = await api().get('/api/health')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-powered-by']).toBeUndefined()
  })
})

describe('ops run ingestion (backup/deploy scripts)', () => {
  it('requires the shared ops token', async () => {
    const body = { kind: 'db_backup', status: 'success', sizeBytes: 1234 }
    expect((await api().post('/api/ops/runs').send(body)).status).toBe(401)
    expect((await api().post('/api/ops/runs').set('X-Ops-Token', 'wrong').send(body)).status).toBe(401)
    const ok = await api().post('/api/ops/runs').set('X-Ops-Token', OPS_TOKEN).send(body)
    expect(ok.status).toBe(201)
    const run = await prisma.opsRun.findUniqueOrThrow({ where: { id: ok.body.id } })
    expect(Number(run.sizeBytes)).toBe(1234)
  })

  it('shows backup freshness to platform admins', async () => {
    const admin = await createUserWithToken({ role: UserRole.ADMIN })
    await api().post('/api/ops/runs').set('X-Ops-Token', OPS_TOKEN).send({ kind: 'db_backup', status: 'success' })
    await api().post('/api/ops/runs').set('X-Ops-Token', OPS_TOKEN).send({ kind: 'restore_drill', status: 'success', details: { rtoSeconds: 42 } })
    const runs = await api().get('/api/admin/ops/runs').set(bearer(admin.token))
    expect(runs.status).toBe(200)
    expect(runs.body.freshness).toMatchObject({ backupFresh: true, restoreDrillFresh: true })
  })
})

describe('error and request monitoring', () => {
  it('groups identical errors by fingerprint and redacts secrets', async () => {
    const make = (id: number) => {
      const error = new Error(`DB timeout for user ${id} token=abc123secret`)
      error.stack = `Error: DB timeout\n    at handler (/app/src/modules/x.ts:10:5)`
      return error
    }
    await captureError(make(1))
    await captureError(make(2))
    const events = await prisma.errorEvent.findMany()
    expect(events).toHaveLength(1)
    expect(events[0].count).toBe(2)
    expect(events[0].message).not.toContain('abc123secret')
  })

  it('aggregates per-route metrics with ids normalized', async () => {
    const owner = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    await api().get(`/api/organizations/${org.id}/programs`).set(bearer(owner.token))
    await api().get(`/api/organizations/${org.id}/programs`).set(bearer(owner.token))
    await flushRequestMetrics()
    const rows = await prisma.requestMetric.findMany({ where: { route: { contains: 'programs' } } })
    expect(rows.length).toBe(1)
    expect(rows[0].route).not.toContain(org.id)
    expect(rows[0].count).toBe(2)
  })
})
