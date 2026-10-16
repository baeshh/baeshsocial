import { OrganizationRole, ProgramProjectRegistrationStatus, VerifiedRecordKind, VerifiedRecordStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  addMember,
  api,
  bearer,
  createOrg,
  createProgram,
  createProgramProject,
  createUserWithToken,
  prisma,
  resetDb,
} from './helpers.js'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

let admin: Actor
let professor: Actor
let leader: Actor
let mate: Actor
let other: Actor
let outsider: Actor
let ownerB: Actor
let orgId: string
let programId: string
let closedProgramId: string
let programBId: string
let leaderProjectId: string
let mateProjectId: string

type HistoryItem = { category: string | null; title: string; description: string | null; verification: { official?: boolean } | null }
type ProfileCard = { id: string; access: string; description: string | null; progress: number | null }

const history = async (viewer: Actor) => {
  const response = await api().get(`/api/profiles/${leader.user.id}/history`).set(bearer(viewer.token))
  expect(response.status).toBe(200)
  return (response.body.items as HistoryItem[]).filter((item) => item.verification)
}

const profileCards = async (viewer: Actor) => {
  const response = await api().get(`/api/profiles/${leader.user.id}/projects`).set(bearer(viewer.token))
  expect(response.status).toBe(200)
  return response.body.projects as ProfileCard[]
}

beforeAll(async () => {
  await resetDb()
  admin = await createUserWithToken({ name: '기관 관리자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  leader = await createUserWithToken({ name: '팀장 학생' })
  mate = await createUserWithToken({ name: '동료 학생' })
  other = await createUserWithToken({ name: '다른 학생' })
  outsider = await createUserWithToken({ name: '외부인' })
  ownerB = await createUserWithToken({ name: 'B기관 관리자' })

  const org = await createOrg(admin.user.id, { name: 'A대학교' })
  const orgB = await createOrg(ownerB.user.id, { name: 'B대학교' })
  orgId = org.id
  await addMember(org.id, professor.user.id, OrganizationRole.MANAGER)
  for (const student of [leader, mate, other]) await addMember(org.id, student.user.id)

  const participants = [leader.user.id, mate.user.id, other.user.id]
  const program = await createProgram(org.id, { managerIds: [professor.user.id], participantIds: participants, title: '창업 캡스톤' })
  await prisma.program.update({
    where: { id: program.id },
    data: { allowStudentProjects: true, requireProjectApproval: true, allowStudentTeams: true },
  })
  programId = program.id
  closedProgramId = (await createProgram(org.id, { managerIds: [professor.user.id], participantIds: participants, title: '기관 과제' })).id
  programBId = (await createProgram(orgB.id, { title: 'B 프로그램' })).id
})

describe('student project registration', () => {
  it('is refused when the program policy does not allow student projects', async () => {
    const response = await api()
      .post(`/api/programs/${closedProgramId}/project-requests`)
      .set(bearer(leader.token))
      .send({ mode: 'new', title: '허용되지 않은 프로젝트' })
    expect(response.status).toBe(403)
  })

  it('is refused for non-participants and for another organization’s program', async () => {
    const asOutsider = await api()
      .post(`/api/programs/${programId}/project-requests`)
      .set(bearer(outsider.token))
      .send({ mode: 'new', title: '외부인 프로젝트' })
    expect([403, 404]).toContain(asOutsider.status)

    const personal = await api().post('/api/projects').set(bearer(leader.token)).send({ title: '내 개인 프로젝트' })
    expect(personal.status).toBe(201)
    const crossOrg = await api()
      .post(`/api/programs/${programBId}/project-requests`)
      .set(bearer(leader.token))
      .send({ mode: 'existing', projectId: personal.body.project.id })
    expect(crossOrg.status).toBe(404)
    const untouched = await prisma.project.findUniqueOrThrow({ where: { id: personal.body.project.id } })
    expect(untouched.programId).toBeNull()
  })

  it('creates a pending request that stays a personal project until approved; one team per student', async () => {
    const created = await api()
      .post(`/api/programs/${programId}/project-requests`)
      .set(bearer(leader.token))
      .send({ mode: 'new', title: '캠퍼스 중고거래 앱', teamName: '알파팀', message: '검토 부탁드립니다' })
    expect(created.status).toBe(201)
    expect(created.body.registration.status).toBe('pending')
    expect(created.body.registration.project.inProgram).toBe(false)
    leaderProjectId = created.body.registration.project.id
    expect((await prisma.project.findUniqueOrThrow({ where: { id: leaderProjectId } })).programId).toBeNull()

    const second = await api()
      .post(`/api/programs/${programId}/project-requests`)
      .set(bearer(leader.token))
      .send({ mode: 'new', title: '두 번째 프로젝트' })
    expect(second.status).toBe(409)
  })

  it('only staff decide, a rejection needs a reason, and approval does not verify', async () => {
    const [request] = (await prisma.programProjectRegistration.findMany({ where: { projectId: leaderProjectId } }))
    const path = `/api/programs/${programId}/project-requests/${request.id}`

    expect((await api().patch(path).set(bearer(leader.token)).send({ decision: 'approve' })).status).toBe(403)
    expect((await api().patch(path).set(bearer(professor.token)).send({ decision: 'reject' })).status).toBe(400)

    const approved = await api().patch(path).set(bearer(professor.token)).send({ decision: 'approve', note: '좋습니다' })
    expect(approved.status).toBe(200)
    expect(approved.body.registration.status).toBe('approved')

    const project = await prisma.project.findUniqueOrThrow({ where: { id: leaderProjectId } })
    expect(project.programId).toBe(programId)
    expect(project.teamName).toBe('알파팀')
    expect(await prisma.projectVerification.count({ where: { projectId: leaderProjectId } })).toBe(0)
    expect(await prisma.verifiedRecord.count({ where: { projectId: leaderProjectId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: 'program.project_request_approve', targetId: leaderProjectId } })).toBe(1)

    const list = await api().get(`/api/programs/${programId}/projects`).set(bearer(professor.token))
    expect(list.status).toBe(200)
    const row = list.body.projects.find((p: { id: string }) => p.id === leaderProjectId)
    expect(row.origin).toBe('student')
    expect(row.verification).toBeNull()
    expect(list.body.summary.studentProjects).toBe(1)
  })

  it('links an existing project in place: same row, programId only after approval, rejection keeps it personal', async () => {
    const personal = await api().post('/api/projects').set(bearer(mate.token)).send({ title: '기존 동아리 프로젝트', visibility: 'team' })
    mateProjectId = personal.body.project.id
    const before = await prisma.project.count()

    const first = await api()
      .post(`/api/programs/${programId}/project-requests`)
      .set(bearer(mate.token))
      .send({ mode: 'existing', projectId: mateProjectId })
    expect(first.status).toBe(201)
    const rejected = await api()
      .patch(`/api/programs/${programId}/project-requests/${first.body.registration.id}`)
      .set(bearer(professor.token))
      .send({ decision: 'reject', note: '목표를 구체화해 주세요' })
    expect(rejected.body.registration.status).toBe('rejected')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: mateProjectId } })).programId).toBeNull()

    const second = await api()
      .post(`/api/programs/${programId}/project-requests`)
      .set(bearer(mate.token))
      .send({ mode: 'existing', projectId: mateProjectId })
    expect(second.status).toBe(201)
    await api()
      .patch(`/api/programs/${programId}/project-requests/${second.body.registration.id}`)
      .set(bearer(professor.token))
      .send({ decision: 'approve' })

    expect(await prisma.project.count()).toBe(before)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: mateProjectId } })).programId).toBe(programId)
    const history = await prisma.programProjectRegistration.findMany({ where: { projectId: mateProjectId }, orderBy: { createdAt: 'asc' } })
    expect(history.map((h) => h.status)).toEqual([ProgramProjectRegistrationStatus.REJECTED, ProgramProjectRegistrationStatus.APPROVED])
  })
})

describe('team and content permissions', () => {
  it('leaders invite only program participants who are not on another team', async () => {
    const role = await prisma.projectRole.findUniqueOrThrow({ where: { projectId_slug: { projectId: leaderProjectId, slug: 'editor' } } })
    const invite = (userId: string) =>
      api().post(`/api/projects/${leaderProjectId}/invites`).set(bearer(leader.token)).send({ userId, roleId: role.id })

    expect((await invite(outsider.user.id)).status).toBe(400)
    expect((await invite(mate.user.id)).status).toBe(409)
    expect((await invite(other.user.id)).status).toBeLessThan(300)

    const pending = await prisma.projectInvite.findFirstOrThrow({ where: { projectId: leaderProjectId, inviteeId: other.user.id } })
    expect((await api().post(`/api/projects/invites/${pending.id}/accept`).set(bearer(other.token))).status).toBeLessThan(300)
  })

  it('program staff can read a student-led project but not edit its content', async () => {
    const read = await api().get(`/api/projects/${leaderProjectId}`).set(bearer(professor.token))
    expect(read.status).toBe(200)
    expect(read.body.isProgramStaff).toBe(true)
    expect((await api().patch(`/api/projects/${leaderProjectId}`).set(bearer(professor.token)).send({ title: '바꾼 제목' })).status).toBe(403)
    expect(
      (await api().patch(`/api/programs/${programId}/projects/${leaderProjectId}`).set(bearer(professor.token)).send({ title: '바꾼 제목' }))
        .status,
    ).toBe(403)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: leaderProjectId } })).title).toBe('캠퍼스 중고거래 앱')
  })

  it('PRIVATE limits the team to members the leader designates', async () => {
    expect((await api().patch(`/api/projects/${leaderProjectId}/visibility`).set(bearer(leader.token)).send({ visibility: 'private' })).status).toBe(200)
    const locked = await api().get(`/api/projects/${leaderProjectId}`).set(bearer(other.token))
    expect(locked.status).toBe(200)
    expect(locked.body.restricted).toBe(true)
    expect(locked.body.project.tasks).toEqual([])

    const member = await prisma.projectMember.findFirstOrThrow({ where: { projectId: leaderProjectId, userId: other.user.id } })
    const grantByMember = await api()
      .patch(`/api/projects/${leaderProjectId}/members/${member.id}/private-access`)
      .set(bearer(other.token))
      .send({ allowed: true })
    expect(grantByMember.status).toBe(403)
    const grant = await api()
      .patch(`/api/projects/${leaderProjectId}/members/${member.id}/private-access`)
      .set(bearer(leader.token))
      .send({ allowed: true })
    expect(grant.status).toBe(200)
    expect((await api().get(`/api/projects/${leaderProjectId}`).set(bearer(other.token))).body.restricted).toBe(false)

    await api().patch(`/api/projects/${leaderProjectId}/visibility`).set(bearer(leader.token)).send({ visibility: 'team' })
  })

  it('PUBLIC program projects are visible to outsiders only while the program allows it', async () => {
    expect((await api().patch(`/api/projects/${leaderProjectId}/visibility`).set(bearer(leader.token)).send({ visibility: 'public' })).status).toBe(400)
    expect((await api().get(`/api/projects/${leaderProjectId}`).set(bearer(outsider.token))).status).toBe(404)

    expect((await api().patch(`/api/programs/${programId}`).set(bearer(admin.token)).send({ allowPublicProjects: true })).status).toBe(200)
    expect((await api().patch(`/api/projects/${leaderProjectId}/visibility`).set(bearer(leader.token)).send({ visibility: 'public' })).status).toBe(200)
    const asOutsider = await api().get(`/api/projects/${leaderProjectId}`).set(bearer(outsider.token))
    expect(asOutsider.status).toBe(200)
    for (const member of asOutsider.body.project.members) expect(member.user?.email).toBeFalsy()
    expect(asOutsider.body.project.tasks).toEqual([])

    expect((await api().patch(`/api/programs/${programId}`).set(bearer(admin.token)).send({ allowPublicProjects: false })).status).toBe(200)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: leaderProjectId } })).visibility).toBe('TEAM')
    expect((await api().get(`/api/projects/${leaderProjectId}`).set(bearer(outsider.token))).status).toBe(404)
  })
})

describe('outcome verification and record disclosure', () => {
  const verifyPath = () => `/api/programs/${programId}/projects/${leaderProjectId}/verification`
  const verifyBody = () => ({
    outcomeSummary: '중고거래 앱 MVP를 출시하고 교내 사용자 120명을 확보했습니다.',
    members: [{ userId: leader.user.id, role: '팀장 · 백엔드', contribution: '결제 연동과 API 서버 전체를 설계하고 구현했습니다.' }],
  })

  it('needs approved evidence first, and team members cannot verify themselves', async () => {
    expect((await api().post(verifyPath()).set(bearer(professor.token)).send(verifyBody())).status).toBe(400)

    const evidence = await api()
      .post(`/api/projects/${leaderProjectId}/evidence`)
      .set(bearer(leader.token))
      .field('title', 'MVP 출시 회고')
      .field('description', '내부 매출 지표와 회고 내용')
      .field('activityDate', '2026-10-05')
      .attach('files', PDF, { filename: 'retro.pdf', contentType: 'application/pdf' })
    expect(evidence.status).toBe(201)
    expect((await api().post(`/api/evidence/${evidence.body.evidence.id}/submit`).set(bearer(leader.token))).status).toBe(200)
    expect(
      (await api().post(`/api/evidence/${evidence.body.evidence.id}/review`).set(bearer(professor.token)).send({ decision: 'approve' })).status,
    ).toBe(200)

    expect((await api().post(verifyPath()).set(bearer(leader.token)).send(verifyBody())).status).toBe(403)
  })

  it('issues a contribution record per member with approved evidence; others are refused', async () => {
    const verified = await api().post(verifyPath()).set(bearer(professor.token)).send(verifyBody())
    expect(verified.status).toBe(201)
    expect((await api().post(verifyPath()).set(bearer(professor.token)).send(verifyBody())).status).toBe(409)

    const withoutEvidence = await api()
      .post(`/api/programs/${programId}/projects/${leaderProjectId}/verify-members`)
      .set(bearer(professor.token))
      .send({ members: [{ userId: other.user.id, role: '디자이너', contribution: '증빙 없이 기여를 주장하는 경우입니다.' }] })
    expect(withoutEvidence.status).toBe(400)

    const records = await prisma.verifiedRecord.findMany({ where: { projectId: leaderProjectId, kind: VerifiedRecordKind.CONTRIBUTION } })
    expect(records.map((r) => r.userId)).toEqual([leader.user.id])
    expect(await prisma.auditLog.count({ where: { action: 'project.verify', targetId: leaderProjectId } })).toBe(1)
  })

  it('outsiders see a summary by default: official badge and role, no contribution text or project content', async () => {
    const items = await history(outsider)
    const official = items.find((item) => item.category === 'CONTRIBUTION')
    expect(official?.verification?.official).toBe(true)
    expect(official?.title).toBe('캠퍼스 중고거래 앱')
    expect(official?.description).toBeNull()
    const evidenceItem = items.find((item) => item.category !== 'CONTRIBUTION')
    expect(evidenceItem?.title).toBe('캠퍼스 중고거래 앱 활동 증빙')
    expect(evidenceItem?.description).toBeNull()

    const card = (await profileCards(outsider)).find((p) => p.id === leaderProjectId)
    expect(card?.access).toBe('limited')
    expect(card?.description).toBeNull()
    expect(card?.progress).toBeNull()

    const own = (await history(leader)).find((item) => item.category === 'CONTRIBUTION')
    expect(own?.description).toContain('결제 연동')
  })

  it('only the owner changes disclosure, and the program cap still applies', async () => {
    const record = await prisma.verifiedRecord.findFirstOrThrow({ where: { projectId: leaderProjectId, kind: VerifiedRecordKind.CONTRIBUTION } })
    const path = `/api/verified-records/${record.id}/visibility`
    expect([403, 404]).toContain((await api().patch(path).set(bearer(professor.token)).send({ disclosure: 'full' })).status)

    expect((await api().patch(path).set(bearer(leader.token)).send({ disclosure: 'full' })).status).toBe(200)
    expect((await history(outsider)).find((item) => item.category === 'CONTRIBUTION')?.description).toBeNull()

    await api().patch(`/api/programs/${programId}`).set(bearer(admin.token)).send({ recordDisclosure: 'full' })
    expect((await history(outsider)).find((item) => item.category === 'CONTRIBUTION')?.description).toContain('결제 연동')

    expect((await api().patch(path).set(bearer(leader.token)).send({ disclosure: 'hidden' })).status).toBe(200)
    expect((await history(outsider)).find((item) => item.category === 'CONTRIBUTION')).toBeUndefined()
    await api().patch(path).set(bearer(leader.token)).send({ disclosure: 'full' })
  })

  it('revoking removes the official record from the public profile', async () => {
    const revoked = await api()
      .post(`/api/programs/${programId}/projects/${leaderProjectId}/revoke-verification`)
      .set(bearer(professor.token))
      .send({ reason: '증빙 재검토 필요' })
    expect(revoked.status).toBe(200)
    const record = await prisma.verifiedRecord.findFirstOrThrow({ where: { projectId: leaderProjectId, kind: VerifiedRecordKind.CONTRIBUTION } })
    expect(record.status).toBe(VerifiedRecordStatus.REVOKED)
    expect((await history(outsider)).find((item) => item.category === 'CONTRIBUTION')).toBeUndefined()
  })
})

describe('supervision', () => {
  it('staff give feedback, students respond, and only staff can send feedback', async () => {
    const reviews = `/api/programs/${programId}/projects/${leaderProjectId}/reviews`
    expect((await api().post(reviews).set(bearer(leader.token)).send({ kind: 'feedback', body: '셀프 피드백' })).status).toBe(403)
    expect((await api().post(reviews).set(bearer(professor.token)).send({ kind: 'revision_request', body: '일정표를 보완해 주세요' })).status).toBe(201)
    expect((await api().post(reviews).set(bearer(leader.token)).send({ kind: 'response', body: '보완했습니다' })).status).toBe(201)
    expect((await api().get(reviews).set(bearer(outsider.token))).status).toBe(404)
    const thread = await api().get(reviews).set(bearer(professor.token))
    expect(thread.status).toBe(200)
    expect(thread.body.reviews.length).toBe(2)
  })

  it('staff remove a student project from the program without deleting it; institution projects must be archived', async () => {
    const removed = await api()
      .post(`/api/programs/${programId}/projects/${mateProjectId}/remove`)
      .set(bearer(professor.token))
      .send({ reason: '프로그램 목적과 맞지 않음' })
    expect(removed.status).toBe(200)
    const project = await prisma.project.findUniqueOrThrow({ where: { id: mateProjectId } })
    expect(project.programId).toBeNull()
    const latest = await prisma.programProjectRegistration.findFirstOrThrow({ where: { projectId: mateProjectId }, orderBy: { updatedAt: 'desc' } })
    expect(latest.status).toBe(ProgramProjectRegistrationStatus.REMOVED)
    expect(await prisma.auditLog.count({ where: { action: 'program.project_remove', targetId: mateProjectId, organizationId: orgId } })).toBe(1)

    const institutional = await createProgramProject(programId, professor.user.id, [])
    const refused = await api()
      .post(`/api/programs/${programId}/projects/${institutional.id}/remove`)
      .set(bearer(professor.token))
      .send({ reason: '정리' })
    expect(refused.status).toBe(409)
  })
})
