import { beforeAll, describe, expect, it } from 'vitest'
import { api, bearer, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type HistoryItem = { id: string; verification: { kind: string; label: string } | null }

let owner: Actor
let viewer: Actor

const historyUrl = (query: string) => `/api/profiles/${owner.user.id}/history?limit=5${query}`

async function walkCursor(type = '') {
  const ids: string[] = []
  let cursor: string | null = null
  do {
    const response = await api()
      .get(historyUrl(`${type}${cursor ? `&cursor=${cursor}` : ''}`))
      .set(bearer(viewer.token))
    expect(response.status).toBe(200)
    ids.push(...(response.body.items as HistoryItem[]).map((item) => item.id))
    cursor = response.body.nextCursor
  } while (cursor)
  return ids
}

async function walkPages(type = '') {
  const first = await api().get(historyUrl(`${type}&page=1`)).set(bearer(viewer.token))
  expect(first.status).toBe(200)
  const ids = (first.body.items as HistoryItem[]).map((item) => item.id)
  for (let page = 2; page <= first.body.totalPages; page += 1) {
    const response = await api().get(historyUrl(`${type}&page=${page}`)).set(bearer(viewer.token))
    expect(response.status).toBe(200)
    expect(response.body.page).toBe(page)
    ids.push(...(response.body.items as HistoryItem[]).map((item) => item.id))
  }
  return { ids, total: first.body.total as number, totalPages: first.body.totalPages as number }
}

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '이력 많은 사용자' })
  viewer = await createUserWithToken({ name: '방문자' })
  const profile = await prisma.profile.create({ data: { userId: owner.user.id } })
  await prisma.certificate.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      profileId: profile.id,
      title: `자격 ${index + 1}`,
      issuer: '발급기관',
      // Undated entries sort last and produce a null-keyed cursor.
      issuedAt: index < 5 ? new Date(Date.UTC(2024, index, 1)) : null,
      verified: index % 2 === 0,
    })),
  })
  await prisma.award.createMany({
    data: Array.from({ length: 6 }, (_, index) => ({
      profileId: profile.id,
      title: `수상 ${index + 1}`,
      awardedAt: index < 4 ? new Date(Date.UTC(2023, index, 15)) : null,
    })),
  })
})

describe('profile history pagination', () => {
  it('walks past undated entries with the cursor without failing', async () => {
    const ids = await walkCursor()
    expect(ids).toHaveLength(14)
    expect(new Set(ids).size).toBe(14)
  })

  it('numbered pages return the same items in the same order as the cursor', async () => {
    for (const type of ['', '&type=verified', '&type=certificate', '&type=award']) {
      const cursorIds = await walkCursor(type)
      const pages = await walkPages(type)
      expect(pages.ids).toEqual(cursorIds)
      expect(pages.total).toBe(cursorIds.length)
      expect(pages.totalPages).toBe(Math.max(1, Math.ceil(cursorIds.length / 5)))
    }
  })

  it('labels operator-confirmed certificates as 인증', async () => {
    const response = await api().get(historyUrl('&type=verified&page=1')).set(bearer(viewer.token))
    const labels = (response.body.items as HistoryItem[]).map((item) => item.verification?.label)
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.every((label) => label === '인증')).toBe(true)
  })

  it('rejects out-of-range page numbers', async () => {
    const response = await api().get(historyUrl('&page=51')).set(bearer(viewer.token))
    expect(response.status).toBe(400)
  })
})
