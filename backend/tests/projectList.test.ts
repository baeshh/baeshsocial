import { beforeAll, describe, expect, it } from 'vitest'
import { api, bearer, createUserWithToken, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

let owner: Actor
let stranger: Actor

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '프로젝트 주인' })
  stranger = await createUserWithToken({ name: '남' })
  const statuses = ['active', 'active', 'active', 'planning', 'completed']
  for (const [index, status] of statuses.entries()) {
    const response = await api().post('/api/projects').set(bearer(owner.token)).send({ title: `프로젝트 ${index}`, status })
    expect(response.status).toBe(201)
  }
  await api().post('/api/projects').set(bearer(stranger.token)).send({ title: '남의 프로젝트', status: 'active' })
})

describe('GET /api/projects statusCounts', () => {
  it('counts every project of the caller by status, independent of the page size', async () => {
    const response = await api().get('/api/projects?limit=2').set(bearer(owner.token))
    expect(response.status).toBe(200)
    expect(response.body.projects).toHaveLength(2)
    expect(response.body.statusCounts).toEqual({ PLANNING: 1, ACTIVE: 3, COMPLETED: 1, ARCHIVED: 0 })
  })

  it('is only sent with the first page', async () => {
    const first = await api().get('/api/projects?limit=2').set(bearer(owner.token))
    const next = await api().get(`/api/projects?limit=2&cursor=${first.body.nextCursor}`).set(bearer(owner.token))
    expect(next.status).toBe(200)
    expect(next.body.statusCounts).toBeUndefined()
  })
})
