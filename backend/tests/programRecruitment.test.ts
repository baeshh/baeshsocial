import { OrganizationRole, ProgramStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Discovered = { id: string; title: string; recruitment: { state: string }; myStatus: { application: { status: string } | null } }

const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY)
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

let admin: Actor
let professor: Actor
let member: Actor
let outsider: Actor
let second: Actor
let ownerB: Actor
let orgId: string
let recruitingId: string
let fields: { motivation: string; portfolio: string; consent: string }

const discover = async (viewer?: Actor) => {
  const request = api().get('/api/programs/discover?pageSize=30')
  const response = viewer ? await request.set(bearer(viewer.token)) : await request
  expect(response.status).toBe(200)
  return response.body.programs as Discovered[]
}

const publicProgram = async (organizationId: string, title: string, data: Record<string, unknown> = {}) => {
  const program = await createProgram(organizationId, { managerIds: [professor.user.id], title })
  return prisma.program.update({ where: { id: program.id }, data: { visibility: 'PUBLIC', publishedAt: new Date(), ...data } })
}

const recruitingProgram = (organizationId: string, title: string, data: Record<string, unknown> = {}) =>
  publicProgram(organizationId, title, { recruitmentMode: 'OPEN', applyStartAt: inDays(-1), applyEndAt: inDays(7), ...data })

const save = (actor: Actor, programId: string, body: Record<string, unknown>) =>
  api().put(`/api/programs/${programId}/applications/me`).set(bearer(actor.token)).send(body)

const completeAnswers = () => ({ [fields.motivation]: '창업 경험을 쌓고 싶습니다.', [fields.consent]: true })

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
  const [motivation, portfolio, consent] = await Promise.all([
    prisma.programApplicationField.create({ data: { programId: recruitingId, position: 0, type: 'LONG_TEXT', label: '지원 동기', required: true } }),
    prisma.programApplicationField.create({ data: { programId: recruitingId, position: 1, type: 'FILE', label: '포트폴리오' } }),
    prisma.programApplicationField.create({ data: { programId: recruitingId, position: 2, type: 'CONSENT', label: '개인정보 동의', required: true } }),
  ])
  fields = { motivation: motivation.id, portfolio: portfolio.id, consent: consent.id }

  await createProgram(org.id, { title: '비공개 캡스톤' })
  const internal = await createProgram(org.id, { title: '재학생 전용 특강' })
  await prisma.program.update({ where: { id: internal.id }, data: { visibility: 'ORGANIZATION', publishedAt: new Date() } })
  await publicProgram(org.id, '보관된 공개 프로그램', { status: ProgramStatus.ARCHIVED })
  await publicProgram(org.id, '게시 전 공개 프로그램', { publishedAt: null })
  await publicProgram(org.id, '링크 공개 교육', { visibility: 'UNLISTED', shareToken: 'share-token-0123456789' })

  const unapproved = await createOrg(ownerB.user.id, { name: '미인증 기관', approved: false })
  const hidden = await createProgram(unapproved.id, { title: '미인증 기관 공개 프로그램' })
  await prisma.program.update({ where: { id: hidden.id }, data: { visibility: 'PUBLIC', publishedAt: new Date() } })
})

describe('program visibility', () => {
  it('lists published public programs to everyone, including signed-out visitors, and organization-only ones to members', async () => {
    const anonymousTitles = (await discover()).map((program) => program.title)
    const outsiderTitles = (await discover(outsider)).map((program) => program.title)
    const memberTitles = (await discover(member)).map((program) => program.title)
    expect(anonymousTitles).toContain('공개 모집 캠프')
    expect(outsiderTitles).not.toContain('재학생 전용 특강')
    expect(memberTitles).toEqual(expect.arrayContaining(['공개 모집 캠프', '재학생 전용 특강']))

    for (const titles of [anonymousTitles, outsiderTitles, memberTitles]) {
      for (const hidden of ['비공개 캡스톤', '보관된 공개 프로그램', '게시 전 공개 프로그램', '링크 공개 교육', '미인증 기관 공개 프로그램']) {
        expect(titles).not.toContain(hidden)
      }
    }
  })

  it('serves unlisted programs only with the share token and drafts only to staff', async () => {
    const unlisted = await prisma.program.findFirstOrThrow({ where: { title: '링크 공개 교육' } })
    expect((await api().get(`/api/programs/discover/${unlisted.id}`).set(bearer(outsider.token))).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${unlisted.id}?t=wrong`)).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${unlisted.id}?t=share-token-0123456789`)).status).toBe(200)

    const internal = await prisma.program.findFirstOrThrow({ where: { title: '재학생 전용 특강' } })
    expect((await api().get(`/api/programs/discover/${internal.id}`).set(bearer(outsider.token))).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${internal.id}`).set(bearer(member.token))).status).toBe(200)

    const draft = await prisma.program.findFirstOrThrow({ where: { title: '게시 전 공개 프로그램' } })
    expect((await api().get(`/api/programs/discover/${draft.id}`).set(bearer(outsider.token))).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${draft.id}`).set(bearer(professor.token))).status).toBe(200)
  })

  it('shows published organization-visible programs in the organization list for regular members', async () => {
    const response = await api().get(`/api/organizations/${orgId}/programs`).set(bearer(member.token))
    expect(response.status).toBe(200)
    const titles = (response.body.programs as { title: string }[]).map((program) => program.title)
    expect(titles).toEqual(expect.arrayContaining(['공개 모집 캠프', '재학생 전용 특강']))
    expect(titles).not.toContain('비공개 캡스톤')
    expect(titles).not.toContain('게시 전 공개 프로그램')
    expect(titles).not.toContain('링크 공개 교육')
  })

  it('validates recruitment settings, allowing incomplete drafts but not incomplete publications', async () => {
    const fresh = (await createOrg(admin.user.id, { name: 'C대학교' })).id
    const create = (body: Record<string, unknown>) => api().post(`/api/organizations/${fresh}/programs`).set(bearer(admin.token)).send(body)

    expect((await create({ title: '모집하는 비공개', visibility: 'private', recruitmentMode: 'open' })).status).toBe(400)
    expect((await create({ title: '마감 없는 게시', visibility: 'public', recruitmentMode: 'open', publish: true })).status).toBe(400)
    expect(
      (await create({ title: '정원 없는 혼합', visibility: 'public', recruitmentMode: 'mixed', applyEndAt: inDays(5).toISOString(), publish: true })).status,
    ).toBe(400)

    const draft = await create({ title: '작성 중인 모집', visibility: 'public', recruitmentMode: 'open', status: 'draft' })
    expect(draft.status).toBe(201)
    expect(draft.body.program.recruitment.state).toBe('draft')
    expect(await prisma.programApplicationField.count({ where: { programId: draft.body.program.id } })).toBe(2)

    const created = await create({
      title: '정상 모집',
      visibility: 'unlisted',
      recruitmentMode: 'open',
      category: 'startup',
      audiences: ['undergraduate', 'alumni'],
      eligibility: { grades: [3, 4], majors: '', regions: '대구·경북' },
      benefits: ['certificate', 'funding'],
      capacity: 20,
      applyEndAt: inDays(5).toISOString(),
      deliveryMode: 'hybrid',
      publish: true,
      applicationFields: [{ type: 'short_text', label: '학교', required: true }],
    })
    expect(created.status).toBe(201)
    expect(created.body.program.shareToken).toEqual(expect.any(String))
    expect(created.body.program.recruitment).toMatchObject({
      mode: 'open',
      state: 'open',
      category: 'startup',
      audiences: ['undergraduate', 'alumni'],
      eligibility: { grades: [3, 4], regions: '대구·경북' },
      benefits: ['certificate', 'funding'],
      capacity: 20,
    })
    const form = await api().get(`/api/programs/${created.body.program.id}/application-form`).set(bearer(admin.token))
    expect(form.body.fields).toHaveLength(1)

    const toPrivate = await api().patch(`/api/programs/${created.body.program.id}`).set(bearer(admin.token)).send({ visibility: 'private' })
    expect(toPrivate.status).toBe(400)
    const foreignCover = await api()
      .patch(`/api/programs/${created.body.program.id}`)
      .set(bearer(admin.token))
      .send({ coverImageUrl: 'https://evil.example.com/a.png' })
    expect(foreignCover.status).toBe(400)
  })

  it('publishes, closes and reopens recruitment and rotates share links', async () => {
    const program = await recruitingProgram(orgId, '게시 관리 테스트', { publishedAt: null })
    const act = (action: string) => api().post(`/api/programs/${program.id}/publication`).set(bearer(professor.token)).send({ action })
    expect((await act('publish')).body.program.recruitment.state).toBe('open')
    expect((await discover(outsider)).map((p) => p.title)).toContain('게시 관리 테스트')

    expect((await act('close_recruitment')).body.program.recruitment.state).toBe('closed')
    expect((await save(outsider, program.id, {})).status).toBe(409)
    expect((await act('reopen_recruitment')).body.program.recruitment.state).toBe('open')

    await act('unpublish')
    expect((await discover(outsider)).map((p) => p.title)).not.toContain('게시 관리 테스트')
    expect((await api().post(`/api/programs/${program.id}/publication`).set(bearer(member.token)).send({ action: 'publish' })).status).toBe(404)

    const unlisted = await prisma.program.findFirstOrThrow({ where: { title: '링크 공개 교육' } })
    const rotated = await api().post(`/api/programs/${unlisted.id}/publication`).set(bearer(professor.token)).send({ action: 'rotate_share_link' })
    expect(rotated.status).toBe(200)
    expect((await api().get(`/api/programs/discover/${unlisted.id}?t=share-token-0123456789`)).status).toBe(404)
    expect((await api().get(`/api/programs/discover/${unlisted.id}?t=${rotated.body.program.shareToken}`)).status).toBe(200)
  })
})

describe('program applications', () => {
  it('derives the recruitment state and only accepts applications while open', async () => {
    await publicProgram(orgId, '기선발 프로그램')
    await publicProgram(orgId, '초대 전용 프로그램', { recruitmentMode: 'INVITE' })
    const scheduled = await recruitingProgram(orgId, '모집 예정', { applyStartAt: inDays(3), applyEndAt: inDays(10) })
    const closed = await recruitingProgram(orgId, '모집 마감', { applyStartAt: inDays(-10), applyEndAt: inDays(-2) })
    await recruitingProgram(orgId, '발표 완료', { applyStartAt: inDays(-10), applyEndAt: inDays(-3), announceAt: inDays(-1) })

    expect((await save(outsider, scheduled.id, { submit: true })).status).toBe(409)
    expect((await save(outsider, scheduled.id, {})).status).toBe(200)
    expect((await save(outsider, closed.id, {})).status).toBe(409)

    const states = Object.fromEntries((await discover(outsider)).map((program) => [program.title, program.recruitment.state]))
    expect(states).toMatchObject({
      '기선발 프로그램': 'selected',
      '초대 전용 프로그램': 'invite_only',
      '모집 예정': 'scheduled',
      '모집 마감': 'closed',
      '발표 완료': 'selected',
      '공개 모집 캠프': 'open',
    })
  })

  it('saves drafts privately and enforces required answers on submit', async () => {
    const draft = await save(outsider, recruitingId, { answers: { [fields.motivation]: '초안' } })
    expect(draft.status).toBe(200)
    expect(draft.body.application.status).toBe('draft')

    const staffView = await api().get(`/api/programs/${recruitingId}/applications?status=all`).set(bearer(professor.token))
    expect(staffView.body.applications).toHaveLength(0)

    const incomplete = await save(outsider, recruitingId, { answers: { [fields.motivation]: '초안' }, submit: true })
    expect(incomplete.status).toBe(400)
    expect(incomplete.body.message).toContain('개인정보 동의')

    const badChoice = await save(outsider, recruitingId, { answers: { [fields.consent]: 'yes' } })
    expect(badChoice.status).toBe(400)

    const detail = await api().get(`/api/programs/discover/${recruitingId}`).set(bearer(outsider.token))
    expect(detail.body.program.myStatus.application.answers[fields.motivation]).toBe('초안')
    expect(detail.body.program.applicationFields).toHaveLength(3)
  })

  it('keeps attachments private to the applicant and, after submission, the program staff', async () => {
    const uploaded = await api()
      .post(`/api/programs/${recruitingId}/applications/me/files`)
      .set(bearer(outsider.token))
      .field('fieldId', fields.portfolio)
      .attach('file', PDF, 'portfolio.pdf')
    expect(uploaded.status).toBe(201)
    const fileId = uploaded.body.file.id as string

    expect((await api().get(`/api/programs/application-files/${fileId}/url`).set(bearer(outsider.token))).status).toBe(200)
    expect((await api().get(`/api/programs/application-files/${fileId}/url`).set(bearer(professor.token))).status).toBe(404)

    const submitted = await save(outsider, recruitingId, { answers: completeAnswers(), submit: true })
    expect(submitted.status).toBe(200)
    expect(submitted.body.application.status).toBe('pending')
    expect((await save(outsider, recruitingId, { answers: completeAnswers() })).status).toBe(409)

    expect((await api().get(`/api/programs/application-files/${fileId}/url`).set(bearer(professor.token))).status).toBe(200)
    expect((await api().get(`/api/programs/application-files/${fileId}/url`).set(bearer(member.token))).status).toBe(404)
    expect((await api().delete(`/api/programs/${recruitingId}/applications/me/files/${fileId}`).set(bearer(outsider.token))).status).toBe(409)
  })

  it('shows staff the submitted answers and notifies them', async () => {
    expect((await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(member.token))).status).toBe(404)
    const queue = await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(professor.token))
    expect(queue.status).toBe(200)
    expect(queue.body.applications).toHaveLength(1)
    expect(queue.body.applications[0].answers.map((answer: { label: string }) => answer.label)).toEqual(['지원 동기', '개인정보 동의'])
    expect(queue.body.applications[0].files).toHaveLength(1)

    const notice = await prisma.notification.findFirst({ where: { userId: professor.user.id, title: '새 프로그램 지원자가 있습니다' } })
    expect(notice).not.toBeNull()
  })

  it('archives answered questions when the form changes so submitted applications stay readable', async () => {
    const replaced = await api()
      .put(`/api/programs/${recruitingId}/application-form`)
      .set(bearer(professor.token))
      .send({ fields: [{ id: fields.consent, type: 'consent', label: '개인정보 동의', required: true }, { type: 'url', label: 'GitHub' }] })
    expect(replaced.status).toBe(200)
    expect(replaced.body.fields.map((field: { label: string }) => field.label)).toEqual(['개인정보 동의', 'GitHub'])
    expect(await prisma.programApplicationField.findUniqueOrThrow({ where: { id: fields.motivation } })).toMatchObject({ archivedAt: expect.any(Date) })

    const queue = await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(professor.token))
    const motivation = queue.body.applications[0].answers.find((answer: { fieldId: string }) => answer.fieldId === fields.motivation)
    expect(motivation).toMatchObject({ archived: true, value: '창업 경험을 쌓고 싶습니다.' })

    const invalid = await api()
      .put(`/api/programs/${recruitingId}/application-form`)
      .set(bearer(professor.token))
      .send({ fields: [{ type: 'single_choice', label: '트랙', options: ['A'] }] })
    expect(invalid.status).toBe(400)
  })

  it('makes an offer that the applicant confirms to become a participant, without joining the organization', async () => {
    const queue = await api().get(`/api/programs/${recruitingId}/applications`).set(bearer(professor.token))
    const applicationId = queue.body.applications[0].id as string
    expect((await api().patch(`/api/programs/${recruitingId}/applications/${applicationId}`).set(bearer(member.token)).send({ decision: 'accept' })).status).toBe(404)

    const accepted = await api().patch(`/api/programs/${recruitingId}/applications/${applicationId}`).set(bearer(professor.token)).send({ decision: 'accept' })
    expect(accepted.status).toBe(200)
    expect(accepted.body.application.status).toBe('accepted')
    expect(new Date(accepted.body.application.offerExpiresAt).getTime()).toBeGreaterThan(Date.now() + 2 * DAY)
    const participantRow = () => prisma.programParticipant.findUnique({ where: { programId_userId: { programId: recruitingId, userId: outsider.user.id } } })
    expect(await participantRow()).toBeNull()

    expect((await api().post(`/api/programs/${recruitingId}/applications/me/confirm`).set(bearer(second.token))).status).toBe(409)
    const confirmed = await api().post(`/api/programs/${recruitingId}/applications/me/confirm`).set(bearer(outsider.token))
    expect(confirmed.status).toBe(200)
    expect(await participantRow()).not.toBeNull()
    expect(await prisma.organizationMember.count({ where: { organizationId: orgId, userId: outsider.user.id } })).toBe(0)
    expect((await api().post(`/api/programs/${recruitingId}/applications/me/confirm`).set(bearer(outsider.token))).status).toBe(409)

    const again = await api().patch(`/api/programs/${recruitingId}/applications/${applicationId}`).set(bearer(professor.token)).send({ decision: 'reject' })
    expect(again.status).toBe(409)
  })

  it('gives external participants access to their program but not to the organization', async () => {
    const program = await api().get(`/api/programs/${recruitingId}`).set(bearer(outsider.token))
    expect(program.status).toBe(200)
    expect(program.body.myAccess).toMatchObject({ isParticipant: true, isStaff: false, orgRole: null })

    expect((await api().get(`/api/organizations/${orgId}/programs`).set(bearer(outsider.token))).status).toBe(403)
    expect((await api().get(`/api/organizations/${orgId}/members`).set(bearer(outsider.token))).status).toBe(403)
    expect((await api().get(`/api/programs/${recruitingId}/participants`).set(bearer(outsider.token))).status).toBe(403)

    const mine = await api().get('/api/programs/participating').set(bearer(outsider.token))
    expect(mine.status).toBe(200)
    expect(mine.body.programs).toEqual([expect.objectContaining({ id: recruitingId, isOrgMember: false, organization: { id: orgId, name: 'A대학교' } })])

    const usage = await api().get(`/api/organizations/${orgId}/billing`).set(bearer(admin.token))
    const rows = usage.body.usage as { key: string; used: number }[]
    expect(rows.find((row) => row.key === 'participants')?.used).toBe(1)
    expect(rows.find((row) => row.key === 'members')?.used).toBe(3)
  })

  it('lets only one of two simultaneous selections take the last seat', async () => {
    const program = await recruitingProgram(orgId, '동시 선발', { capacity: 1 })
    const applicants = await Promise.all([createUserWithToken(), createUserWithToken()])
    for (const applicant of applicants) expect((await save(applicant, program.id, { submit: true })).status).toBe(200)
    const applications = await prisma.programApplication.findMany({ where: { programId: program.id } })

    const decide = (applicationId: string) =>
      api().patch(`/api/programs/${program.id}/applications/${applicationId}`).set(bearer(professor.token)).send({ decision: 'accept' })
    const responses = await Promise.all(applications.map((application) => decide(application.id)))
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    expect(await prisma.programApplication.count({ where: { programId: program.id, status: 'ACCEPTED' } })).toBe(1)
  })

  it('decides one application only once even when two reviewers act at the same time', async () => {
    const program = await recruitingProgram(orgId, '중복 심사')
    const applicant = await createUserWithToken()
    expect((await save(applicant, program.id, { submit: true })).status).toBe(200)
    const application = await prisma.programApplication.findFirstOrThrow({ where: { programId: program.id } })
    const path = `/api/programs/${program.id}/applications/${application.id}`
    const responses = await Promise.all([
      api().patch(path).set(bearer(professor.token)).send({ decision: 'accept' }),
      api().patch(path).set(bearer(admin.token)).send({ decision: 'reject' }),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
    const final = await prisma.programApplication.findUniqueOrThrow({ where: { id: application.id } })
    expect(['ACCEPTED', 'REJECTED']).toContain(final.status)
  })

  it('registers organization members directly but asks outsiders to confirm through an invite', async () => {
    const program = await createProgram(orgId, { managerIds: [professor.user.id], title: '기선발 등록' })
    const stranger = await createUserWithToken()
    const response = await api()
      .post(`/api/programs/${program.id}/participants`)
      .set(bearer(professor.token))
      .send({ participants: [{ email: member.user.email, studentNo: 'A1023' }, { email: stranger.user.email }, { email: 'nobody@test.baesh.dev' }] })
    expect(response.status).toBe(200)
    expect(response.body.added).toEqual([member.user.id])
    expect(response.body.skipped).toEqual([
      expect.objectContaining({ input: stranger.user.email, needsInvite: true }),
      expect.objectContaining({ input: 'nobody@test.baesh.dev', needsInvite: true }),
    ])
    expect(await prisma.organizationMember.count({ where: { organizationId: orgId, userId: stranger.user.id } })).toBe(0)
  })

  it('stops accepting once the capacity is filled', async () => {
    await prisma.program.update({ where: { id: recruitingId }, data: { capacity: 1 } })
    const answers = { [fields.consent]: true }
    expect((await save(second, recruitingId, { answers, submit: true })).status).toBe(200)
    const application = await prisma.programApplication.findFirstOrThrow({ where: { programId: recruitingId, userId: second.user.id } })
    const response = await api().patch(`/api/programs/${recruitingId}/applications/${application.id}`).set(bearer(professor.token)).send({ decision: 'accept' })
    expect(response.status).toBe(409)
    expect(await prisma.programParticipant.count({ where: { programId: recruitingId } })).toBe(1)
  })

  it('allows reapplying after withdrawal but not after rejection, and shows the rejection note', async () => {
    const answers = { [fields.consent]: true }
    expect((await api().delete(`/api/programs/${recruitingId}/applications/me`).set(bearer(second.token))).status).toBe(204)
    expect((await save(second, recruitingId, { answers, submit: true })).status).toBe(200)

    const application = await prisma.programApplication.findFirstOrThrow({ where: { programId: recruitingId, userId: second.user.id } })
    const rejected = await api()
      .patch(`/api/programs/${recruitingId}/applications/${application.id}`)
      .set(bearer(professor.token))
      .send({ decision: 'reject', note: '정원이 마감되었습니다.' })
    expect(rejected.status).toBe(200)
    expect((await save(second, recruitingId, { answers, submit: true })).status).toBe(409)

    const mine = await api().get('/api/programs/applications/me').set(bearer(second.token))
    expect(mine.status).toBe(200)
    expect(mine.body.applications[0]).toMatchObject({ status: 'rejected', reviewNote: '정원이 마감되었습니다.' })
    expect(await prisma.organizationMember.count({ where: { organizationId: orgId, userId: second.user.id } })).toBe(0)
  })

  it('discards a draft together with its files', async () => {
    const program = await recruitingProgram(orgId, '임시저장 삭제')
    const field = await prisma.programApplicationField.create({ data: { programId: program.id, position: 0, type: 'FILE', label: '첨부' } })
    const uploaded = await api()
      .post(`/api/programs/${program.id}/applications/me/files`)
      .set(bearer(member.token))
      .field('fieldId', field.id)
      .attach('file', PDF, 'draft.pdf')
    expect(uploaded.status).toBe(201)
    expect((await api().delete(`/api/programs/${program.id}/applications/me`).set(bearer(member.token))).status).toBe(204)
    expect(await prisma.programApplication.count({ where: { programId: program.id } })).toBe(0)
    expect(await prisma.programApplicationFile.count({ where: { fieldId: field.id } })).toBe(0)
  })
})

describe('offers, waitlist and refill', () => {
  const decide = (programId: string, applicationId: string, decision: 'accept' | 'waitlist' | 'reject') =>
    api().patch(`/api/programs/${programId}/applications/${applicationId}`).set(bearer(professor.token)).send({ decision })
  const applyAll = async (programId: string, applicants: Actor[]) => {
    for (const applicant of applicants) expect((await save(applicant, programId, { submit: true })).status).toBe(200)
    const rows = await prisma.programApplication.findMany({ where: { programId } })
    return Object.fromEntries(applicants.map((applicant) => [applicant.user.id, rows.find((row) => row.userId === applicant.user.id)!.id]))
  }
  const statusOf = async (id: string) => (await prisma.programApplication.findUniqueOrThrow({ where: { id } })).status

  it('passes a declined seat to the first waitlisted applicant, who can then confirm', async () => {
    const program = await recruitingProgram(orgId, '대기자 충원', { capacity: 1 })
    const [first, waitingA, waitingB] = await Promise.all([createUserWithToken(), createUserWithToken(), createUserWithToken()])
    const ids = await applyAll(program.id, [first, waitingA, waitingB])

    expect((await decide(program.id, ids[first.user.id], 'accept')).status).toBe(200)
    expect((await decide(program.id, ids[waitingA.user.id], 'waitlist')).status).toBe(200)
    expect((await decide(program.id, ids[waitingB.user.id], 'waitlist')).status).toBe(200)
    expect((await decide(program.id, ids[waitingA.user.id], 'accept')).status).toBe(409)

    const declined = await api().post(`/api/programs/${program.id}/applications/me/decline`).set(bearer(first.token))
    expect(declined.status).toBe(200)
    expect(declined.body.refill).toEqual({ lapsed: 0, offered: 1 })
    expect(await statusOf(ids[first.user.id])).toBe('DECLINED')
    expect(await statusOf(ids[waitingA.user.id])).toBe('ACCEPTED')
    expect(await statusOf(ids[waitingB.user.id])).toBe('WAITLISTED')
    expect(await prisma.notification.count({ where: { userId: waitingA.user.id, title: '대기 중이던 프로그램에 합격했습니다' } })).toBe(1)

    expect((await api().post(`/api/programs/${program.id}/applications/me/confirm`).set(bearer(waitingA.token))).status).toBe(200)
    expect(await prisma.programParticipant.count({ where: { programId: program.id } })).toBe(1)
    expect((await save(first, program.id, { submit: true })).status).toBe(409)

    expect((await api().delete(`/api/programs/${program.id}/applications/me`).set(bearer(waitingB.token))).status).toBe(204)
    expect(await statusOf(ids[waitingB.user.id])).toBe('WITHDRAWN')
  })

  it('frees the seat of an expired offer and the hourly job hands it to the waitlist', async () => {
    const { expireProgramOffers } = await import('../src/services/programs/applicationOffers.js')
    const program = await recruitingProgram(orgId, '기한 만료', { capacity: 1 })
    const [late, next, another] = await Promise.all([createUserWithToken(), createUserWithToken(), createUserWithToken()])
    const ids = await applyAll(program.id, [late, next, another])
    expect((await decide(program.id, ids[late.user.id], 'accept')).status).toBe(200)
    expect((await decide(program.id, ids[next.user.id], 'waitlist')).status).toBe(200)
    await prisma.programApplication.update({ where: { id: ids[late.user.id] }, data: { offerExpiresAt: new Date(Date.now() - 1000) } })

    expect((await api().post(`/api/programs/${program.id}/applications/me/confirm`).set(bearer(late.token))).status).toBe(409)
    expect((await decide(program.id, ids[another.user.id], 'accept')).status).toBe(200)
    await prisma.programApplication.update({ where: { id: ids[another.user.id] }, data: { offerExpiresAt: new Date(Date.now() - 1000) } })

    const totals = await expireProgramOffers()
    expect(totals).toMatchObject({ lapsed: 2, offered: 1 })
    const lapsed = await prisma.programApplication.findUniqueOrThrow({ where: { id: ids[late.user.id] } })
    expect(lapsed).toMatchObject({ status: 'DECLINED', respondedAt: null })
    expect(await statusOf(ids[next.user.id])).toBe('ACCEPTED')

    const mine = await api().get('/api/programs/applications/me').set(bearer(late.token))
    expect(mine.body.applications.find((row: { program: { id: string } }) => row.program.id === program.id)).toMatchObject({ status: 'declined', lapsed: true })
  })

  it('lets staff refill on demand after removing a participant', async () => {
    const program = await recruitingProgram(orgId, '수동 충원', { capacity: 1 })
    const [joined, waiting] = await Promise.all([createUserWithToken(), createUserWithToken()])
    const ids = await applyAll(program.id, [joined, waiting])
    expect((await decide(program.id, ids[joined.user.id], 'accept')).status).toBe(200)
    expect((await api().post(`/api/programs/${program.id}/applications/me/confirm`).set(bearer(joined.token))).status).toBe(200)
    expect((await decide(program.id, ids[waiting.user.id], 'waitlist')).status).toBe(200)

    const empty = await api().post(`/api/programs/${program.id}/applications/refill`).set(bearer(professor.token))
    expect(empty.body).toEqual({ lapsed: 0, offered: 0 })
    expect((await api().post(`/api/programs/${program.id}/applications/refill`).set(bearer(joined.token))).status).toBe(403)

    await prisma.programParticipant.deleteMany({ where: { programId: program.id, userId: joined.user.id } })
    const refill = await api().post(`/api/programs/${program.id}/applications/refill`).set(bearer(professor.token))
    expect(refill.body).toEqual({ lapsed: 0, offered: 1 })
    const queue = await api().get(`/api/programs/${program.id}/applications?status=all`).set(bearer(professor.token))
    expect(queue.body).toMatchObject({ capacity: 1, participantCount: 0, openOffers: 1 })
    expect(queue.body.counts).toMatchObject({ accepted: 1, confirmed: 1 })
  })
})
