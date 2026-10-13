import { UserRole } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { api, bearer, createUserWithToken, prisma, resetDb } from './helpers.js'

type Notification = { title: string; fromPlatform: boolean; actorId: string | null; actor: { name: string } | null }

beforeAll(async () => {
  await resetDb()
})

describe('platform notifications', () => {
  it('shows notices sent from the admin console as BAESH without exposing the operator', async () => {
    const operator = await createUserWithToken({ role: UserRole.ADMIN, name: '운영자 개인' })
    const user = await createUserWithToken({ name: '문의한 사용자' })

    const created = await api()
      .post('/api/support/tickets')
      .set(bearer(user.token))
      .send({ category: 'account', subject: '로그인 문의', body: '로그인이 되지 않습니다.' })
    expect(created.status).toBe(201)

    const reply = await api()
      .post(`/api/admin/support/tickets/${created.body.ticket.id}/messages`)
      .set(bearer(operator.token))
      .send({ body: '확인 후 조치했습니다.' })
    expect(reply.status).toBe(201)

    const response = await api().get('/api/notifications').set(bearer(user.token))
    expect(response.status).toBe(200)
    const notice = (response.body.notifications as Notification[]).find((item) => item.title === '지원 문의에 답변이 등록되었습니다')
    expect(notice).toBeDefined()
    expect(notice?.fromPlatform).toBe(true)
    expect(notice?.actor).toBeNull()
    expect(notice?.actorId).toBeNull()
    expect(JSON.stringify(response.body)).not.toContain('운영자 개인')
  })

  it('keeps the actor on notifications between users', async () => {
    const actor = await createUserWithToken({ name: '팔로우한 사람' })
    const target = await createUserWithToken({ name: '팔로우 받은 사람' })
    expect((await api().post(`/api/users/${target.user.id}/follow`).set(bearer(actor.token))).status).toBeLessThan(300)

    const response = await api().get('/api/notifications').set(bearer(target.token))
    const follow = (response.body.notifications as Notification[]).find((item) => item.title === '새 팔로워')
    expect(follow?.fromPlatform).toBe(false)
    expect(follow?.actor?.name).toBe('팔로우한 사람')
  })

  it('stores the flag on the row so new admin notices stay attributed to BAESH', async () => {
    const rows = await prisma.notification.findMany({ where: { title: '지원 문의에 답변이 등록되었습니다' } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.fromPlatform)).toBe(true)
  })
})
