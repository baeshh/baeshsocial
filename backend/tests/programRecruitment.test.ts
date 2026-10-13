import { OrganizationMemberStatus, OrganizationRole, ProgramStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Discovered = { id: string; title: string; recruitment: { state: string }; myStatus: { application: { status: string } | null } }

const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY)

let admin: Actor
let professor: Actor
let member: Actor
let outsider: Actor
let second: Actor
let ownerB: Actor
let orgId: string
let recruitingId: string

const discover = async (viewer: Actor) => {
  const response = await api().get('/api/programs/discover?pageSize=30').set(bearer(viewer.token))
  expect(response.status).toBe(200)
  return response.body.programs as Discovered[]
}

const recruitingProgram = async (organizationId: string, title: string, data: Record<string, unknown> = {}) => {
  const program = await createProgram(organizationId, { managerIds: [professor.user.id], title })
  return prisma.program.update({
    where: { id: program.id },
    data: { visibility: 'PUBLIC', recruitmentMode: 'RECRUITING', applyStartAt: inDays(-1), applyEndAt: inDays(7), ...data },
  })
}

beforeAll(async () => {
  await resetDb()
  admin = await createUserWithToken({ name: '기관 관리자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  member = await createUserWithToken({ name: '재학생' })
  outsider = await createUserWithToken({ name: '외부 지원자' })
  second = await createUserWithToken({ name: '두 번째 지원자' })
  ownerB = await createUserWithToken({ name: '미인증 기관' })

  const org = await createOrg(admin.user.id, { name: 'A대학교' })
  orgId = org.id
  await addMember(org.id, professor.user.id, OrganizationRole.MANAGER)
  await addMember(org.id, member.user.id)
  recruitingId = (await recruitingProgram(org.id, '공개 모집 캠프')).id

  await createProgram(org.id, { title: '비공개 캡스톤' })
  const internal = await createProgram(org.id, { title: '재학생 전용 특강' })
  await prisma.program.update({ where: { id: internal.id }, data: { visibility: 'ORGANIZATION' } })
  const archived = await createProgram(org.id, { title: '보관된 공개 프로그램' })
  await prisma.program.update({ where: { id: archived.id }, data: { visibility: 'PUBLIC', status: ProgramStatus.ARCHIVED } })

  const unapproved = await createOrg(ownerB.user.id, { name: '미인증 기관', approved: false })
  const hidden = await createProgram(unapproved.id, { title: '미인증 기관 공개 프로그램' })
  await prisma.program.update({ where: { id: hidden.id }, data: { visibility: 'PUBLIC' } })
})

describe('program visibility', () => {
  it('lists public programs to everyone and organization-only programs to members', async () => {
    const outsiderTitles = (await discover(outsider)).map((program) => program.title)
    expect(outsiderTitles).toContain('공개 모집 캠프')
    expect(outsiderTitles).not.toContain('재학생 전용 특강')

    const memberTitles = (await discover(member)).map((program) => program.title)
    expect(memberTitles).toEqual(expect.arrayContaining(['공개 모집 캠프', '재학생 전용 특강']))

    for (const titles of [outsiderTitles, memberTitles]) {
      expect(titles).not.toContain('비공개 캡스톤')
      expect(titles).not.toContain('보관된 공개 프로그램')
      expect(titles).not.toContain('미인증 기관 공개 프로그램')
    }
  })

  it('hides private and organization-only programs from outsiders on the detail endpoint too', async () => {
    const internal = await prisma.program.findFirstOrThrow({ where: { title: '재학생 전용 특강' } })
    expect((await api().get(`/api/programs/discover/${internal.id}`).set(bearer(outsider.token))).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${internal.id}`).set(bearer(member.token))).status).toBe(200)
  })

  it('shows organization-visible programs in the organization list for regular members', async () => {
    const response = await api().get(`/api/organizations/${orgId}/programs`).set(bearer(member.token))
    expect(response.status).toBe(200)
    const titles = (response.body.programs as { title: string }[]).map((program) => program.title)
    expect(titles).toEqual(expect.arrayContaining(['공개 모집 캠프', '재학생 전용 특강']))
    expect(titles).not.toContain('비공개 캡스톤')
  })

  it('refuses recruiting settings that nobody could apply to', async () => {
    const fresh = (await createOrg(admin.user.id, { name: 'C대학교' })).id
    const privateRecruit = await api()
      .post(`/api/organizations/${fresh}/programs`)
      .set(bearer(admin.token))
      .send({ title: '모집하는 비공개', visibility: 'private', recruitmentMode: 'recruiting', applyEndAt: inDays(5).toISOString() })
    expect(privateRecruit.status).toBe(400)

    const noDeadline = await api()
      .post(`/api/organizations/${fresh}/programs`)
      .set(bearer(admin.token))
      .send({ title: '마감 없는 모집', visibility: 'public', recruitmentMode: 'recruiting' })
    expect(noDeadline.status).toBe(400)

    const created = await api()
      .post(`/api/organizations/${fresh}/programs`)
      .set(bearer(admin.token))
      .send({
        title: '정상 모집',
        visibility: 'public',
        recruitmentMode: 'recruiting',
        targetAudience: '전공 무관 대학생',
        capacity: 20,
        applyEndAt: inDays(5).toISOString(),
        deliveryMode: 'hybrid',
      })
    expect(created.status).toBe(201)
    expect(created.body.program.visibility).toBe('public')
    expect(created.body.program.recruitment).toMatchObject({ mode: 'recruiting', state: 'open', capacity: 20, deliveryMode: 'hybrid' })

    const closeVisibility = await api()
      .patch(`/api/programs/${created.body.program.id}`)
      .set(bearer(admin.token))
      .send({ visibility: 'private' })
    expect(closeVisibility.status).toBe(400)
  })
})

describe('program applications', () => {
  it('only accepts applications while recruitment is open', async () => {
    const selected = await createProgram(orgId, { title: '선발 완료 프로그램' })
    await prisma.program.update({ where: { id: selected.id }, data: { visibility: 'PUBLIC' } })
    const upcoming = await recruitingProgram(orgId, '모집 예정', { applyStartAt: inDays(3), applyEndAt: inDays(10) })
    const closed = await recruitingProgram(orgId, '모집 마감', { applyStartAt: inDays(-10), applyEndAt: inDays(-1) })

    for (const id of [selected.id, upcoming.id, closed.id]) {
      const response = await api().post(`/api/programs/${id}/applications`).set(bearer(outsider.token)).send({})
      expect(response.status).toBe(409)
    }
    const states = Object.fromEntries((await discover(outsider)).map((program) => [program.title, program.recruitment.state]))
    expect(states).toMatchObject({ '선발 완료 프로그램': 'selected', '모집 예정': 'upcoming', '모집 마감': 'closed', '공개 모집 캠프': 'open' })
  })

  it('lets outsiders apply once and staff review the queue', async () => {
    const applied = await api()
      .post(`/api/programs/${recruitingId}/applications`)
      .set(bearer(outsider.token))
      .send({ message: '창업 경험을 쌓고 싶습니다.' })
    expect(applied.status).toBe(201)
    expect((await api().post(`/api/programs/${recruitingId}/applications`).set(bearer(outsider.token)).send({})).status).toBe(409)

    const listed = (await discover(outsider)).find((program) => program.id === recruitingId)
    expect(listed?.myStatus.application?.status).toBe('pending')

    expect((await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(member.token))).status).toBe(404)
    const queue = await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(professor.token))
    expect(queue.status).toBe(200)
    expect(queue.body.applications).toHaveLength(1)
    expect(queue.body.applications[0].message).toBe('창업 경험을 쌓고 싶습니다.')

    const notice = await prisma.notification.findFirst({ where: { userId: professor.user.id, title: '새 프로그램 지원자가 있습니다' } })
    expect(notice).not.toBeNull()
  })

  it('turns an accepted application into a participant and organization member', async () => {
    const queue = await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(professor.token))
    const applicationId = queue.body.applications[0].id as string
    expect((await api().patch(`/api/programs/${recruitingId}/applications/${applicationId}`).set(bearer(member.token)).send({ decision: 'accept' })).status).toBe(404)

    const accepted = await api()
      .patch(`/api/programs/${recruitingId}/applications/${applicationId}`)
      .set(bearer(professor.token))
      .send({ decision: 'accept' })
    expect(accepted.status).toBe(200)
    expect(accepted.body.application.status).toBe('accepted')

    const participant = await prisma.programParticipant.findUnique({ where: { programId_userId: { programId: recruitingId, userId: outsider.user.id } } })
    expect(participant).not.toBeNull()
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: outsider.user.id } } })
    expect(membership).toMatchObject({ status: OrganizationMemberStatus.ACTIVE, role: OrganizationRole.MEMBER })
    expect((await api().get(`/api/programs/${recruitingId}`).set(bearer(outsider.token))).status).toBe(200)

    const again = await api()
      .patch(`/api/programs/${recruitingId}/applications/${applicationId}`)
      .set(bearer(professor.token))
      .send({ decision: 'reject' })
    expect(again.status).toBe(409)
  })

  it('stops accepting once the capacity is filled', async () => {
    await prisma.program.update({ where: { id: recruitingId }, data: { capacity: 1 } })
    expect((await api().post(`/api/programs/${recruitingId}/applications`).set(bearer(second.token)).send({})).status).toBe(201)
    const application = await prisma.programApplication.findFirstOrThrow({ where: { programId: recruitingId, userId: second.user.id } })
    const response = await api()
      .patch(`/api/programs/${recruitingId}/applications/${application.id}`)
      .set(bearer(professor.token))
      .send({ decision: 'accept' })
    expect(response.status).toBe(409)
    expect(await prisma.programParticipant.count({ where: { programId: recruitingId } })).toBe(1)
  })

  it('allows reapplying after withdrawal but not after rejection, and shows the rejection note', async () => {
    expect((await api().delete(`/api/programs/${recruitingId}/applications/me`).set(bearer(second.token))).status).toBe(204)
    expect((await api().post(`/api/programs/${recruitingId}/applications`).set(bearer(second.token)).send({})).status).toBe(201)

    const application = await prisma.programApplication.findFirstOrThrow({ where: { programId: recruitingId, userId: second.user.id } })
    const rejected = await api()
      .patch(`/api/programs/${recruitingId}/applications/${application.id}`)
      .set(bearer(professor.token))
      .send({ decision: 'reject', note: '정원이 마감되었습니다.' })
    expect(rejected.status).toBe(200)
    expect((await api().post(`/api/programs/${recruitingId}/applications`).set(bearer(second.token)).send({})).status).toBe(409)

    const mine = await api().get('/api/programs/applications/me').set(bearer(second.token))
    expect(mine.status).toBe(200)
    expect(mine.body.applications[0]).toMatchObject({ status: 'rejected', reviewNote: '정원이 마감되었습니다.' })
    expect(await prisma.organizationMember.count({ where: { organizationId: orgId, userId: second.user.id } })).toBe(0)
  })
})
