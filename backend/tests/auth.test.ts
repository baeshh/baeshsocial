import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, bearer, createUser, createUserWithToken, login, prisma, resetDb } from './helpers.js'

beforeEach(resetDb)

describe('registration', () => {
  it('always creates a USER account even if a role is sent', async () => {
    const response = await api()
      .post('/api/auth/register')
      .send({ name: '공격자', email: 'attacker@test.baesh.dev', password: 'abcd1234x', role: 'ADMIN' })
    expect(response.status).toBe(201)
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'attacker@test.baesh.dev' } })
    expect(user.role).toBe(UserRole.USER)
  })

  it('rejects weak passwords', async () => {
    const response = await api().post('/api/auth/register').send({ name: '약한암호', email: 'weak@test.baesh.dev', password: 'aaaaaaaa' })
    expect(response.status).toBe(400)
  })

  it('rate limits registrations per IP', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const response = await api()
        .post('/api/auth/register')
        .send({ name: `가입${i}`, email: `spam${i}@test.baesh.dev`, password: 'abcd1234x' })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 5).every((status) => status === 201)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
  })
})

describe('sessions', () => {
  it('logout invalidates the token server-side', async () => {
    const { token } = await createUserWithToken()
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(200)
    expect((await api().post('/api/auth/logout').set(bearer(token))).status).toBe(200)
    const after = await api().get('/api/auth/me').set(bearer(token))
    expect(after.status).toBe(401)
    expect(after.body.code).toBe('session_revoked')
  })

  it('password change signs out other sessions but keeps the current one', async () => {
    const user = await createUser()
    const first = await login(user.email)
    const second = await login(user.email)
    const change = await api()
      .post('/api/auth/password')
      .set(bearer(first))
      .send({ currentPassword: 'password123', newPassword: 'newpass1234' })
    expect(change.status).toBe(200)
    expect((await api().get('/api/auth/me').set(bearer(first))).status).toBe(200)
    expect((await api().get('/api/auth/me').set(bearer(second))).status).toBe(401)
    expect((await api().post('/api/auth/login').send({ email: user.email, password: 'password123' })).status).toBe(401)
    expect((await api().post('/api/auth/login').send({ email: user.email, password: 'newpass1234' })).status).toBe(200)
  })

  it('rejects tokens without a server session (legacy or forged)', async () => {
    const user = await createUser()
    const legacy = jwt.sign({ id: user.id, email: user.email, role: 'ADMIN' }, process.env.JWT_SECRET!, { expiresIn: '1h' })
    expect((await api().get('/api/auth/me').set(bearer(legacy))).status).toBe(401)
    const forged = jwt.sign({ sid: 'nonexistent' }, process.env.JWT_SECRET!, { subject: user.id, expiresIn: '1h', algorithm: 'HS256' })
    expect((await api().get('/api/auth/me').set(bearer(forged))).status).toBe(401)
  })

  it('locks out repeated failed logins for one account', async () => {
    const user = await createUser()
    let last = 0
    for (let i = 0; i < 11; i += 1) {
      last = (await api().post('/api/auth/login').send({ email: user.email, password: 'wrong-pass1' })).status
    }
    expect(last).toBe(429)
    const failures = await prisma.auditLog.count({ where: { action: 'auth.login', outcome: 'failure' } })
    expect(failures).toBeGreaterThanOrEqual(10)
  })
})

describe('platform admin controls', () => {
  it('suspension takes effect on existing tokens and blocks login', async () => {
    const admin = await createUserWithToken({ role: UserRole.ADMIN })
    const target = await createUserWithToken()
    const suspend = await api().post(`/api/admin/users/${target.user.id}/suspend`).set(bearer(admin.token)).send({ reason: '약관 위반 조사' })
    expect(suspend.status).toBe(200)
    expect([401, 403]).toContain((await api().get('/api/auth/me').set(bearer(target.token))).status)
    const relogin = await api().post('/api/auth/login').send({ email: target.user.email, password: 'password123' })
    expect(relogin.status).toBe(403)
    expect(await prisma.auditLog.count({ where: { action: 'admin.user_suspend', targetId: target.user.id } })).toBe(1)
  })

  it('role changes apply immediately to already-issued tokens', async () => {
    const admin = await createUserWithToken({ role: UserRole.ADMIN })
    const other = await createUserWithToken({ role: UserRole.ADMIN })
    expect((await api().get('/api/admin/users').set(bearer(other.token))).status).toBe(200)
    const demote = await api().patch(`/api/admin/users/${other.user.id}/role`).set(bearer(admin.token)).send({ role: 'user' })
    expect(demote.status).toBe(200)
    expect([401, 403]).toContain((await api().get('/api/admin/users').set(bearer(other.token))).status)
  })

  it('non-admins cannot reach admin APIs', async () => {
    const { token } = await createUserWithToken()
    for (const path of ['/api/admin/users', '/api/admin/audit-logs', '/api/admin/billing/summary', '/api/admin/ops/overview']) {
      expect((await api().get(path).set(bearer(token))).status).toBe(403)
    }
  })
})
