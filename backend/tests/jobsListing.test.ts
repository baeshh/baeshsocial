import { OpportunityType } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Page<T> = { page: number; pageSize: number; total: number; totalPages: number } & T

const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY)

let viewer: Actor

beforeAll(async () => {
  await resetDb()
  viewer = await createUserWithToken({ name: '구직자' })
})

describe('program listing on Jobs', () => {
  let orgId: string

  const program = async (title: string, data: Record<string, unknown>) => {
    const created = await createProgram(orgId, { title })
    return prisma.program.update({
      where: { id: created.id },
      data: { visibility: 'PUBLIC', publishedAt: new Date(), recruitmentMode: 'OPEN', ...data },
    })
  }

  const list = async (params: string) => {
    const response = await api().get(`/api/programs/discover?${params}`)
    expect(response.status).toBe(200)
    return response.body as Page<{ programs: { title: string; recruitment: { state: string } }[]; openCount: number }>
  }

  /** Every page in turn, to check that paging neither repeats nor skips programs. */
  const allPages = async (params: string) => {
    const titles: string[] = []
    const first = await list(`${params}&page=1`)
    titles.push(...first.programs.map((row) => row.title))
    for (let page = 2; page <= first.totalPages; page += 1) {
      titles.push(...(await list(`${params}&page=${page}`)).programs.map((row) => row.title))
    }
    return { titles, total: first.total, openCount: first.openCount }
  }

  beforeAll(async () => {
    const owner = await createUserWithToken()
    orgId = (await createOrg(owner.user.id, { name: '잡스대학교' })).id
    await program('모집중-마감3일', { applyEndAt: inDays(3), publishedAt: inDays(-5), category: 'EDUCATION' })
    await program('모집중-마감1일', { applyEndAt: inDays(1), publishedAt: inDays(-4), category: 'STARTUP' })
    await program('모집중-상시', { applyEndAt: null, publishedAt: inDays(-1), category: 'EDUCATION', audiences: ['UNDERGRADUATE'] })
    await program('예정-2일후', { applyStartAt: inDays(2), applyEndAt: inDays(9), publishedAt: inDays(-2) })
    await program('마감-조기', { applyEndAt: inDays(5), recruitmentClosedAt: inDays(-1), publishedAt: inDays(-3) })
    await program('마감-기간종료', { applyEndAt: inDays(-1), publishedAt: inDays(-6) })
    await program('기선발', { recruitmentMode: 'PRESELECTED', publishedAt: inDays(-7) })
    await program('비공개', { visibility: 'PRIVATE' })
    await program('미게시', { publishedAt: null })
  })

  it('orders open programs by closing date, then upcoming, then the rest, across pages', async () => {
    const { titles, total, openCount } = await allPages('pageSize=2')
    expect(total).toBe(7)
    expect(openCount).toBe(3)
    expect(titles).toEqual(['모집중-마감1일', '모집중-마감3일', '모집중-상시', '예정-2일후', '마감-조기', '마감-기간종료', '기선발'])
  })

  it('filters by recruitment state, category and audience in the database', async () => {
    expect((await allPages('pageSize=2&state=open')).titles).toEqual(['모집중-마감1일', '모집중-마감3일', '모집중-상시'])
    expect((await allPages('pageSize=2&openOnly=true')).titles).toEqual(['모집중-마감1일', '모집중-마감3일', '모집중-상시'])
    expect((await allPages('pageSize=5&state=upcoming')).titles).toEqual(['예정-2일후'])
    expect((await allPages('pageSize=5&category=education')).titles).toEqual(['모집중-마감3일', '모집중-상시'])
    expect((await allPages('pageSize=5&audience=undergraduate')).titles).toEqual(['모집중-상시'])
    expect((await allPages(`pageSize=5&q=${encodeURIComponent('기간종료')}`)).titles).toEqual(['마감-기간종료'])
  })

  it('sorts by publication date and clamps pages past the end', async () => {
    expect((await allPages('pageSize=3&sort=recent')).titles).toEqual([
      '모집중-상시',
      '예정-2일후',
      '마감-조기',
      '모집중-마감1일',
      '모집중-마감3일',
      '마감-기간종료',
      '기선발',
    ])
    const beyond = await list('pageSize=5&page=40')
    expect(beyond.page).toBe(2)
    expect(beyond.programs.map((row) => row.title)).toEqual(['마감-기간종료', '기선발'])
  })

  it('reports the same state the list was filtered by', async () => {
    const open = await list('pageSize=10&state=open')
    expect(new Set(open.programs.map((row) => row.recruitment.state))).toEqual(new Set(['open']))
    const all = await list('pageSize=10')
    expect(all.programs.find((row) => row.title === '마감-조기')?.recruitment.state).toBe('closed')
  })
})

describe('opportunity listing on Jobs', () => {
  const opportunity = (title: string, data: Partial<Parameters<typeof prisma.opportunity.create>[0]['data']> = {}) =>
    prisma.opportunity.create({ data: { title, type: OpportunityType.JOB, organization: '테스트회사', description: `${title} 설명`, ...data } })

  const list = async (params = '') => {
    const response = await api().get(`/api/opportunities?${params}`).set(bearer(viewer.token))
    expect(response.status).toBe(200)
    return response.body as Page<{ opportunities: { title: string; matchScore: number; saved: boolean }[] }>
  }

  beforeAll(async () => {
    await prisma.profile.upsert({
      where: { userId: viewer.user.id },
      create: { userId: viewer.user.id, skills: ['react', 'TypeScript'] },
      update: { skills: ['react', 'TypeScript'] },
    })
    await opportunity('완전 일치', { skills: ['React', 'TypeScript'], createdAt: inDays(-5), deadline: inDays(10) })
    await opportunity('절반 일치', { skills: ['React', 'Go'], createdAt: inDays(-4), type: OpportunityType.INTERNSHIP })
    await opportunity('스킬 없음', { createdAt: inDays(-3), type: OpportunityType.HACKATHON, deadline: inDays(2) })
    await opportunity('불일치', { skills: ['Rust'], createdAt: inDays(-2), deadline: inDays(-3) })
    await opportunity('100% 장학 공고', { skills: ['Rust'], createdAt: inDays(-1), isRemote: true })
  })

  it('ranks by the match score computed in the database and pages through it', async () => {
    const first = await list('pageSize=2')
    expect(first).toMatchObject({ total: 5, totalPages: 3, page: 1 })
    const titles = [...first.opportunities]
    for (const page of [2, 3]) titles.push(...(await list(`pageSize=2&page=${page}`)).opportunities)
    expect(titles.map((row) => [row.title, row.matchScore])).toEqual([
      ['완전 일치', 98],
      ['스킬 없음', 50],
      ['절반 일치', 50],
      ['100% 장학 공고', 35],
      ['불일치', 35],
    ])
  })

  it('filters by type list, open deadline, remote, saved and literal search text', async () => {
    expect((await list('types=internship,hackathon&sort=recent')).opportunities.map((row) => row.title)).toEqual(['스킬 없음', '절반 일치'])
    expect((await list('type=hackathon')).opportunities.map((row) => row.title)).toEqual(['스킬 없음'])
    expect((await list('openOnly=true&sort=deadline')).opportunities.map((row) => row.title)).toEqual([
      '스킬 없음',
      '완전 일치',
      '100% 장학 공고',
      '절반 일치',
    ])
    expect((await list('remote=true')).opportunities.map((row) => row.title)).toEqual(['100% 장학 공고'])
    expect((await list('q=100%25')).opportunities.map((row) => row.title)).toEqual(['100% 장학 공고'])
    expect((await list(`q=${encodeURIComponent('0% 장')}`)).total).toBe(1)
    expect((await list('q=%25')).total).toBe(1)

    const target = await prisma.opportunity.findFirstOrThrow({ where: { title: '불일치' } })
    expect((await api().post(`/api/opportunities/${target.id}/save`).set(bearer(viewer.token))).status).toBeLessThan(300)
    const saved = await list('saved=true')
    expect(saved.opportunities).toEqual([expect.objectContaining({ title: '불일치', saved: true })])
  })

  it('names the matched profile skills and how many skills the profile has', async () => {
    const page = (await api().get('/api/opportunities?pageSize=10').set(bearer(viewer.token))).body as {
      opportunities: { title: string; matchedSkills: string[] }[]
      profileSkillCount: number
    }
    expect(page.profileSkillCount).toBe(2)
    const matched = Object.fromEntries(page.opportunities.map((row) => [row.title, row.matchedSkills]))
    expect(matched).toMatchObject({ '완전 일치': ['React', 'TypeScript'], '절반 일치': ['React'], '스킬 없음': [], 불일치: [] })

    const target = await prisma.opportunity.findFirstOrThrow({ where: { title: '절반 일치' } })
    const detail = await api().get(`/api/opportunities/${target.id}`).set(bearer(viewer.token))
    expect(detail.body.opportunity.matchedSkills).toEqual(['React'])
  })

  it("never shows other users' saves or the poster's email", async () => {
    const poster = await createUserWithToken({ name: '공고 등록자' })
    const other = await createUserWithToken({ name: '다른 사람' })
    const posted = await opportunity('개인정보 확인', { createdBy: poster.user.id })
    await prisma.savedOpportunity.create({ data: { userId: other.user.id, opportunityId: posted.id } })

    const detail = (await api().get(`/api/opportunities/${posted.id}`).set(bearer(viewer.token))).body.opportunity
    expect(detail.saved).toBe(false)
    expect(detail.savedOpportunities).toEqual([])
    expect(detail.creator).toEqual({ id: poster.user.id, name: '공고 등록자', role: expect.any(String) })
    expect(JSON.stringify(detail)).not.toContain(poster.user.email)

    const listed = (await list(`q=${encodeURIComponent('개인정보 확인')}`)).opportunities[0] as unknown as Record<string, unknown>
    expect(listed.savedOpportunities).toEqual([])
    expect(JSON.stringify(listed)).not.toContain(poster.user.email)

    const own = (await api().get(`/api/opportunities/${posted.id}`).set(bearer(other.token))).body.opportunity
    expect(own.saved).toBe(true)
    expect(own.savedOpportunities).toHaveLength(1)
    await prisma.opportunity.delete({ where: { id: posted.id } })
  })

  it('rejects unknown types and oversized pages', async () => {
    expect((await api().get('/api/opportunities?types=job,unknown').set(bearer(viewer.token))).status).toBe(400)
    expect((await api().get('/api/opportunities?pageSize=500').set(bearer(viewer.token))).status).toBe(400)
  })
})
