import {
  EvidenceStatus,
  OrganizationRole,
  OrganizationType,
  ProgramProjectRecordStatus,
  ProgramProjectRegistrationSource,
  ProgramProjectRegistrationStatus,
  ProgramStatus,
  ProjectVisibility,
} from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { REDACTED_NAME, captureProgramProjectRecord, type RecordSnapshot } from '../src/services/records/programProjectRecords.js'
import { applyBackfill, findBackfillCandidates } from '../src/services/records/recordBackfill.js'
import { PASSWORD, addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

let owner: Actor
let professor: Actor
let unassignedManager: Actor
let plainMember: Actor
let leader: Actor
let mate: Actor
let otherOrgOwner: Actor
let recruiter: Actor
let pendingOrgOwner: Actor
let orgId: string
let otherOrgId: string
let companyId: string
let pendingOrgId: string
let programId: string
let projectId: string
let recordId: string
let evidenceId: string

const records = (actor: Actor, org = orgId, query = '') => api().get(`/api/organizations/${org}/project-records${query}`).set(bearer(actor.token))
const detail = (actor: Actor, id = recordId, org = orgId) => api().get(`/api/organizations/${org}/project-records/${id}`).set(bearer(actor.token))
const version = (actor: Actor, v: number) => api().get(`/api/organizations/${orgId}/project-records/${recordId}/versions/${v}`).set(bearer(actor.token))
const current = async () => prisma.programProjectRecord.findUniqueOrThrow({ where: { id: recordId }, include: { events: { orderBy: { version: 'asc' } } } })
const snapshotOf = (row: { snapshot: unknown }) => row.snapshot as unknown as RecordSnapshot

async function approvedRequest(programIdToUse: string, actor: Actor, body: Record<string, unknown>) {
  const created = await api().post(`/api/programs/${programIdToUse}/project-requests`).set(bearer(actor.token)).send(body)
  expect(created.status).toBe(201)
  const approved = await api()
    .patch(`/api/programs/${programIdToUse}/project-requests/${created.body.registration.id}`)
    .set(bearer(professor.token))
    .send({ decision: 'approve' })
  expect(approved.status).toBe(200)
  return created.body.registration.project.id as string
}

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '기관 소유자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  unassignedManager = await createUserWithToken({ name: '다른 담당자' })
  plainMember = await createUserWithToken({ name: '일반 구성원' })
  leader = await createUserWithToken({ name: '팀장 학생' })
  mate = await createUserWithToken({ name: '동료 학생' })
  otherOrgOwner = await createUserWithToken({ name: '다른 기관 소유자' })
  recruiter = await createUserWithToken({ name: '기업 채용 담당' })
  pendingOrgOwner = await createUserWithToken({ name: '미승인 기관 소유자' })

  orgId = (await createOrg(owner.user.id, { name: '기록 대학교' })).id
  otherOrgId = (await createOrg(otherOrgOwner.user.id, { name: '다른 대학교' })).id
  companyId = (await createOrg(recruiter.user.id, { name: '기록 테크', type: OrganizationType.COMPANY })).id
  pendingOrgId = (await createOrg(pendingOrgOwner.user.id, { name: '미승인 기관', approved: false })).id
  await addMember(orgId, professor.user.id, OrganizationRole.MANAGER)
  await addMember(orgId, unassignedManager.user.id, OrganizationRole.MANAGER)
  await addMember(orgId, plainMember.user.id, OrganizationRole.MEMBER)

  const program = await createProgram(orgId, {
    managerIds: [professor.user.id],
    participantIds: [leader.user.id, mate.user.id],
    title: '공식 기록 캡스톤',
  })
  await prisma.program.update({ where: { id: program.id }, data: { allowStudentProjects: true, term: '2026-2' } })
  programId = program.id
})

describe('capture', () => {
  it('approving a registration creates the official record, and team changes add versions', async () => {
    projectId = await approvedRequest(programId, leader, { mode: 'new', title: '공식 기록 앱', teamName: '기록팀' })
    const record = await prisma.programProjectRecord.findUniqueOrThrow({
      where: { programId_projectId: { programId, projectId } },
      include: { events: true },
    })
    recordId = record.id
    expect(record).toMatchObject({
      organizationId: orgId,
      organizationName: '기록 대학교',
      programTitle: '공식 기록 캡스톤',
      programTerm: '2026-2',
      projectTitle: '공식 기록 앱',
      status: ProgramProjectRecordStatus.ACTIVE,
      version: 1,
    })
    expect(record.events.map((event) => [event.action, event.trigger])).toEqual([['CAPTURED', 'registration.approved']])
    expect(snapshotOf(record).registration).toMatchObject({ status: 'APPROVED', reviewer: { id: professor.user.id } })

    const assigned = await api()
      .post(`/api/programs/${programId}/projects/${projectId}/members`)
      .set(bearer(professor.token))
      .send({ userIds: [mate.user.id], teamRole: 'member' })
    expect(assigned.status).toBe(200)
    const after = await current()
    expect(after.version).toBe(2)
    expect(after.events[1]).toMatchObject({ action: 'UPDATED', trigger: 'team.assigned', previousHash: record.contentHash })
    expect(snapshotOf(after).participants.map((p) => [p.name, p.onTeam])).toEqual([
      ['팀장 학생', true],
      ['동료 학생', true],
    ])
  })

  it('keeps no email, contact or student number in the snapshot', async () => {
    const text = JSON.stringify((await current()).snapshot)
    expect(text).not.toContain(leader.user.email)
    expect(text).not.toContain(mate.user.email)
    expect(text).not.toMatch(/studentNo|phone|email/)
  })

  it('is idempotent: capturing unchanged content adds no version', async () => {
    const before = await current()
    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, { programId, projectId, trigger: 'test.noop' }))
    const after = await current()
    expect(after.version).toBe(before.version)
    expect(after.events).toHaveLength(before.events.length)
  })

  it('evidence review and revocation are versioned; the approved version stays in the history', async () => {
    const created = await api()
      .post(`/api/projects/${projectId}/evidence`)
      .set(bearer(mate.token))
      .field('title', '중간 발표')
      .field('activityDate', '2026-10-01')
      .attach('files', PDF, { filename: 'slides.pdf', contentType: 'application/pdf' })
    expect(created.status).toBe(201)
    evidenceId = created.body.evidence.id
    expect((await api().post(`/api/evidence/${evidenceId}/submit`).set(bearer(mate.token))).status).toBe(200)
    expect((await api().post(`/api/evidence/${evidenceId}/review`).set(bearer(professor.token)).send({ decision: 'approve' })).status).toBe(200)

    const approved = await current()
    const approvedVersion = approved.version
    expect(approved.events.at(-1)).toMatchObject({ action: 'UPDATED', trigger: 'evidence.approved' })
    const evidence = snapshotOf(approved).evidence[0]
    expect(evidence).toMatchObject({ title: '중간 발표', status: 'APPROVED', authorId: mate.user.id, reviewer: { id: professor.user.id } })
    expect(evidence.files[0]).toMatchObject({ name: 'slides.pdf' })
    expect(evidence.files[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(snapshotOf(approved).records[0]).toMatchObject({ userId: mate.user.id, status: 'VERIFIED' })

    const revoked = await api().post(`/api/evidence/${evidenceId}/revoke`).set(bearer(professor.token)).send({ reason: '증빙 파일 오류' })
    expect(revoked.status).toBe(200)
    const after = await current()
    expect(after.events.at(-1)).toMatchObject({ action: 'UPDATED', trigger: 'evidence.revoked', reason: '증빙 파일 오류' })
    expect(snapshotOf(after).evidence[0].status).toBe('REJECTED')
    expect(snapshotOf(after).records[0].status).toBe('REVOKED')

    const old = await version(owner, approvedVersion)
    expect(old.status).toBe(200)
    expect(old.body.version.snapshot.evidence[0].status).toBe('APPROVED')
    expect(old.body.version.snapshot.records[0].status).toBe('VERIFIED')
  })
})

describe('independent of the personal profile and the live project', () => {
  it('hiding the project from the personal profile leaves the official record untouched', async () => {
    const before = await current()
    const hidden = await api().put(`/api/projects/${projectId}/profile-display`).set(bearer(leader.token)).send({ hidden: true })
    expect(hidden.status).toBe(200)
    const after = await current()
    expect(after.version).toBe(before.version)
    expect(after.contentHash).toBe(before.contentHash)
    const view = await detail(owner)
    expect(view.status).toBe(200)
    expect(view.body.record.projectTitle).toBe('공식 기록 앱')
    expect(view.body.record.snapshot.participants.map((p: { userId: string }) => p.userId)).toContain(leader.user.id)
  })

  it("a teammate taken off the team stays on the record with their history", async () => {
    const removed = await api().delete(`/api/programs/${programId}/projects/${projectId}/members/${mate.user.id}`).set(bearer(professor.token))
    expect(removed.status).toBe(204)
    const after = await current()
    expect(after.events.at(-1)).toMatchObject({ trigger: 'team.member_removed' })
    const mateRow = snapshotOf(after).participants.find((p) => p.userId === mate.user.id)
    expect(mateRow).toMatchObject({ name: '동료 학생', onTeam: false })
    expect(snapshotOf(after).evidence.map((e) => e.authorId)).toContain(mate.user.id)
    expect(snapshotOf(after).records.map((r) => r.userId)).toContain(mate.user.id)
  })
})

describe('retention policy and program end', () => {
  it('only owners and admins set the policy; a basis is required and the previous one is retired', async () => {
    const path = `/api/organizations/${orgId}/project-records/retention-policy`
    expect((await api().put(path).set(bearer(professor.token)).send({ basis: 'contract', reference: '협약서 제7조', retentionMonths: 60 })).status).toBe(403)
    expect((await api().put(path).set(bearer(owner.token)).send({ basis: 'contract', reference: '', retentionMonths: 60 })).status).toBe(400)
    expect((await api().get(path).set(bearer(owner.token))).body.current).toBeNull()

    expect((await api().put(path).set(bearer(owner.token)).send({ basis: 'service_policy', reference: '내부 규정 v1', retentionMonths: null })).status).toBe(200)
    const set = await api().put(path).set(bearer(owner.token)).send({ basis: 'contract', reference: '협약서 제7조', retentionMonths: 60 })
    expect(set.status).toBe(200)
    const read = await api().get(path).set(bearer(professor.token))
    expect(read.body.current).toMatchObject({ basis: 'contract', reference: '협약서 제7조', retentionMonths: 60, retiredAt: null })
    expect(read.body.history).toHaveLength(2)
    expect(read.body.history[1].retiredAt).not.toBeNull()
  })

  it('completing the program finalizes the record with the retention date from the policy', async () => {
    const response = await api().patch(`/api/programs/${programId}`).set(bearer(owner.token)).send({ status: 'completed' })
    expect(response.status).toBe(200)
    const after = await current()
    expect(after.status).toBe(ProgramProjectRecordStatus.FINAL)
    expect(after.events.at(-1)).toMatchObject({ action: 'FINALIZED', trigger: 'program.completed', actorId: owner.user.id })
    expect(after.finalizedAt).not.toBeNull()
    const expected = new Date(after.finalizedAt!)
    expected.setUTCMonth(expected.getUTCMonth() + 60)
    expect(after.retainUntil?.toISOString()).toBe(expected.toISOString())
    expect(after.retentionPolicyId).not.toBeNull()
  })

  it('stays viewable after the end; edits to the live project do not change the final version', async () => {
    const final = await current()
    await prisma.project.update({ where: { id: projectId }, data: { title: '나중에 바꾼 제목' } })
    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, { programId, projectId, trigger: 'test.after_end' }))
    const view = await detail(professor)
    expect(view.status).toBe(200)
    expect(view.body.record.status).toBe('final')
    const finalizedEvent = (await current()).events.find((event) => event.action === 'FINALIZED')!
    expect(snapshotOf(finalizedEvent).project.title).toBe('공식 기록 앱')
    expect(finalizedEvent.contentHash).toBe(final.contentHash)
  })

  it('a change after the end is a CORRECTED version; the record stays FINAL', async () => {
    const after = await current()
    expect(after.status).toBe(ProgramProjectRecordStatus.FINAL)
    expect(after.events.at(-1)).toMatchObject({ action: 'CORRECTED', trigger: 'test.after_end' })
    expect(snapshotOf(after).project.title).toBe('나중에 바꾼 제목')
  })

  it('staff corrections need a reason and keep every earlier version', async () => {
    const path = `/api/organizations/${orgId}/project-records/${recordId}/corrections`
    expect((await api().post(path).set(bearer(professor.token)).send({ reason: '' })).status).toBe(400)
    const corrected = await api().post(path).set(bearer(professor.token)).send({ reason: '팀명 오기 정정', note: '기록팀 → 기록 팀' })
    expect(corrected.status).toBe(200)
    const after = await current()
    expect(after.status).toBe(ProgramProjectRecordStatus.FINAL)
    expect(snapshotOf(after).corrections).toEqual([
      expect.objectContaining({ reason: '팀명 오기 정정', note: '기록팀 → 기록 팀', by: { id: professor.user.id, name: '담당 교수' } }),
    ])
    expect(after.events.map((event) => event.version)).toEqual(Array.from({ length: after.version }, (_, i) => i + 1))
    for (let i = 1; i < after.events.length; i += 1) expect(after.events[i].previousHash).toBe(after.events[i - 1].contentHash)

    const view = await detail(owner)
    expect(view.body.record.events.map((event: { action: string }) => event.action)).toEqual(after.events.map((event) => event.action.toLowerCase()))
    expect(await prisma.auditLog.count({ where: { action: 'records.correct', targetId: recordId } })).toBe(1)
  })
})

describe('access', () => {
  it('owners and the assigned manager see the record; others in the organization do not', async () => {
    expect((await records(owner)).body.records.map((r: { id: string }) => r.id)).toContain(recordId)
    expect((await records(professor)).body.records.map((r: { id: string }) => r.id)).toContain(recordId)

    const unassigned = await records(unassignedManager)
    expect(unassigned.status).toBe(200)
    expect(unassigned.body.records).toEqual([])
    expect((await detail(unassignedManager)).status).toBe(404)
    expect((await api().post(`/api/organizations/${orgId}/project-records/${recordId}/corrections`).set(bearer(unassignedManager.token)).send({ reason: '권한 없음 정정' })).status).toBe(404)

    expect((await records(plainMember)).status).toBe(403)
    expect((await detail(plainMember)).status).toBe(403)
  })

  it('participants, other organizations, companies and unapproved organizations are blocked', async () => {
    for (const actor of [leader, mate]) {
      expect((await records(actor)).status).toBe(403)
      expect((await detail(actor)).status).toBe(403)
    }
    expect((await records(otherOrgOwner)).status).toBe(403)
    expect((await detail(otherOrgOwner)).status).toBe(403)
    expect((await detail(otherOrgOwner, recordId, otherOrgId)).status).toBe(404)
    expect((await detail(recruiter, recordId, companyId)).status).toBe(404)
    expect((await records(recruiter, companyId)).body.records).toEqual([])
    expect((await records(pendingOrgOwner, pendingOrgId)).status).toBe(403)
    expect(await prisma.auditLog.count({ where: { action: 'org.access_denied', actorId: otherOrgOwner.user.id, organizationId: orgId } })).toBeGreaterThan(0)
  })

  it('redaction is for owners and admins, and removes the name from every version', async () => {
    const path = `/api/organizations/${orgId}/project-records/${recordId}/redactions`
    expect((await api().post(path).set(bearer(professor.token)).send({ userId: mate.user.id, reason: '삭제 요청' })).status).toBe(403)
    expect((await api().post(path).set(bearer(owner.token)).send({ userId: recruiter.user.id, reason: '삭제 요청' })).status).toBe(404)

    const redacted = await api().post(path).set(bearer(owner.token)).send({ userId: mate.user.id, reason: '본인 삭제 요청' })
    expect(redacted.status).toBe(200)
    const after = await current()
    expect(after.events.at(-1)).toMatchObject({ action: 'REDACTED', reason: '본인 삭제 요청', actorId: owner.user.id })
    for (const row of [after, ...after.events]) {
      const mateRow = snapshotOf(row).participants.find((p) => p.userId === mate.user.id)
      if (mateRow) expect(mateRow).toMatchObject({ name: REDACTED_NAME, role: null })
      expect(JSON.stringify(row.snapshot)).not.toContain('동료 학생')
    }
    for (let i = 1; i < after.events.length; i += 1) expect(after.events[i].previousHash).toBe(after.events[i - 1].contentHash)

    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, { programId, projectId, trigger: 'test.after_redaction', link: true }))
    expect(JSON.stringify((await current()).snapshot)).not.toContain('동료 학생')
  })
})

describe('source deletion is protected', () => {
  it('the program cannot be deleted through the API and the database refuses direct deletes', async () => {
    const refused = await api().delete(`/api/programs/${programId}`).set(bearer(owner.token))
    expect(refused.status).toBe(409)

    const onlyRecord = await createProgram(orgId, { title: '기록만 남은 프로그램' })
    const moved = await prisma.project.create({
      data: { title: '떠난 프로젝트', slug: `left-${Date.now()}`, ownerId: leader.user.id, programId: onlyRecord.id },
    })
    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, { programId: onlyRecord.id, projectId: moved.id, trigger: 'test.capture' }))
    await prisma.project.update({ where: { id: moved.id }, data: { programId: null } })
    const recordOnly = await api().delete(`/api/programs/${onlyRecord.id}`).set(bearer(owner.token))
    expect(recordOnly.status).toBe(409)
    expect(recordOnly.body.details).toMatchObject({ code: 'PROGRAM_RETAINED', counts: { officialRecords: 1, registrations: 0 } })

    await expect(prisma.programProjectRecord.delete({ where: { id: recordId } })).rejects.toThrow()
    await expect(prisma.organization.delete({ where: { id: orgId } })).rejects.toThrow()
    await expect(prisma.program.delete({ where: { id: programId } })).rejects.toThrow()
    expect(await prisma.programProjectRecord.count({ where: { id: recordId } })).toBe(1)
  })

  it('a program project cannot be deleted by the student', async () => {
    const response = await api().delete(`/api/projects/${projectId}`).set(bearer(leader.token)).send({ password: PASSWORD, confirmTeamImpact: true })
    expect([403, 409]).toContain(response.status)
    expect(await prisma.project.count({ where: { id: projectId } })).toBe(1)
  })

  it('a rejected request stays as a review log when the student deletes their personal project', async () => {
    const other = await createProgram(orgId, { managerIds: [professor.user.id], participantIds: [leader.user.id], title: '반려 프로그램' })
    await prisma.program.update({ where: { id: other.id }, data: { allowStudentProjects: true } })
    const created = await api().post(`/api/programs/${other.id}/project-requests`).set(bearer(leader.token)).send({ mode: 'new', title: '반려될 프로젝트' })
    expect(created.status).toBe(201)
    const registrationId = created.body.registration.id as string
    const personalId = created.body.registration.project.id as string
    expect((await api().patch(`/api/programs/${other.id}/project-requests/${registrationId}`).set(bearer(professor.token)).send({ decision: 'reject', note: '주제 불일치' })).status).toBe(200)

    expect((await api().delete(`/api/projects/${personalId}`).set(bearer(leader.token)).send({ password: PASSWORD })).status).toBe(204)
    const log = await prisma.programProjectRegistration.findUniqueOrThrow({ where: { id: registrationId } })
    expect(log).toMatchObject({ projectId: null, status: ProgramProjectRegistrationStatus.REJECTED, reviewNote: '주제 불일치' })
    expect((log.snapshot as { title: string }).title).toBe('반려될 프로젝트')

    const listed = await api().get(`/api/programs/${other.id}/project-requests?status=all`).set(bearer(professor.token))
    expect(listed.status).toBe(200)
    expect(listed.body.requests[0]).toMatchObject({ id: registrationId, project: null, snapshot: { title: '반려될 프로젝트' } })
    expect(await prisma.programProjectRecord.count({ where: { programId: other.id } })).toBe(0)
  })
})

describe('removal and re-linking', () => {
  it('removing a student project finalizes its record; linking it again reopens the same record', async () => {
    const second = await createProgram(orgId, { managerIds: [professor.user.id], participantIds: [leader.user.id], title: '재연결 프로그램' })
    await prisma.program.update({ where: { id: second.id }, data: { allowStudentProjects: true } })
    const linkedId = await approvedRequest(second.id, leader, { mode: 'new', title: '재연결 프로젝트' })

    const removed = await api().post(`/api/programs/${second.id}/projects/${linkedId}/remove`).set(bearer(professor.token)).send({ reason: '팀 요청으로 제외' })
    expect(removed.status).toBe(200)
    const record = await prisma.programProjectRecord.findUniqueOrThrow({
      where: { programId_projectId: { programId: second.id, projectId: linkedId } },
      include: { events: { orderBy: { version: 'asc' } } },
    })
    expect(record.status).toBe(ProgramProjectRecordStatus.FINAL)
    expect(record.events.at(-1)).toMatchObject({ action: 'FINALIZED', trigger: 'project.removed', reason: '팀 요청으로 제외' })
    expect(snapshotOf(record).registration?.status).toBe('REMOVED')
    expect(snapshotOf(record).participants[0]).toMatchObject({ userId: leader.user.id, name: '팀장 학생', onTeam: true })

    await approvedRequest(second.id, leader, { mode: 'existing', projectId: linkedId })
    const reopened = await prisma.programProjectRecord.findUniqueOrThrow({ where: { id: record.id }, include: { events: { orderBy: { version: 'asc' } } } })
    expect(reopened.status).toBe(ProgramProjectRecordStatus.ACTIVE)
    expect(reopened.finalizedAt).toBeNull()
    expect(reopened.events.at(-1)).toMatchObject({ action: 'REOPENED', trigger: 'registration.approved' })
    expect(await prisma.programProjectRecord.count({ where: { programId: second.id, projectId: linkedId } })).toBe(1)
  })
})

describe('talent search does not read official records', () => {
  it("a company's own program record never reaches its talent search", async () => {
    const program = await createProgram(companyId, { managerIds: [recruiter.user.id], participantIds: [leader.user.id], title: '기업 인턴 과제' })
    const project = await prisma.project.create({
      data: {
        title: '기업 비공개 과제',
        slug: `company-private-${Date.now()}`,
        ownerId: leader.user.id,
        programId: program.id,
        visibility: ProjectVisibility.TEAM,
        skills: ['Rust'],
        members: { create: { userId: leader.user.id, role: '팀장' } },
      },
    })
    await prisma.$transaction((tx) => captureProgramProjectRecord(tx, { programId: program.id, projectId: project.id, trigger: 'test.company' }))
    expect(await prisma.programProjectRecord.count({ where: { organizationId: companyId } })).toBe(1)
    await prisma.profile.upsert({
      where: { userId: leader.user.id },
      create: { userId: leader.user.id, talentSearchOptIn: true, skills: ['Rust'] },
      update: { talentSearchOptIn: true, skills: ['Rust'] },
    })

    const search = await api().post(`/api/organizations/${companyId}/talent/searches`).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
    expect(search.status).toBe(201)
    expect(JSON.stringify(search.body)).not.toContain('기업 비공개 과제')
    expect(JSON.stringify(search.body)).not.toContain('공식 기록 앱')
  })
})

describe('migration and backfill', () => {
  it('the migration set the delete rules the design relies on', async () => {
    const rows = await prisma.$queryRaw<{ name: string; rule: string }[]>`
      SELECT conname AS name, confdeltype::text AS rule FROM pg_constraint
      WHERE contype = 'f' AND conname IN (
        'Program_organizationId_fkey', 'ProgramParticipant_programId_fkey',
        'ProgramProjectRegistration_programId_fkey', 'ProgramProjectRegistration_projectId_fkey',
        'ProjectVerification_projectId_fkey', 'VerifiedRecord_projectId_fkey', 'EvidenceReview_evidenceId_fkey',
        'ProjectReview_projectId_fkey', 'ProgramProjectRecord_organizationId_fkey', 'ProgramProjectRecord_projectId_fkey',
        'ProgramProjectRecord_programId_fkey', 'ProgramProjectRecordEvent_recordId_fkey', 'ProjectEvidence_projectId_fkey')`
    const rules = Object.fromEntries(rows.map((row) => [row.name, row.rule]))
    // r = restrict, n = set null, c = cascade
    expect(rules).toEqual({
      Program_organizationId_fkey: 'r',
      ProgramParticipant_programId_fkey: 'r',
      ProgramProjectRegistration_programId_fkey: 'r',
      ProgramProjectRegistration_projectId_fkey: 'n',
      ProjectVerification_projectId_fkey: 'r',
      VerifiedRecord_projectId_fkey: 'r',
      EvidenceReview_evidenceId_fkey: 'r',
      ProjectReview_projectId_fkey: 'r',
      ProgramProjectRecord_organizationId_fkey: 'r',
      ProgramProjectRecord_projectId_fkey: 'n',
      ProgramProjectRecord_programId_fkey: 'n',
      ProgramProjectRecordEvent_recordId_fkey: 'r',
      ProjectEvidence_projectId_fkey: 'c',
    })
  })

  it('backfills history from before the feature, marks ended ones FINAL and is idempotent', async () => {
    const legacyOrg = await createOrg(owner.user.id, { name: '백필 대학교' })
    const running = await createProgram(legacyOrg.id, { title: '진행 중 프로그램' })
    const ended = await createProgram(legacyOrg.id, { title: '종료된 프로그램' })
    await prisma.program.update({ where: { id: ended.id }, data: { status: ProgramStatus.COMPLETED } })
    const make = (title: string, programIdToUse: string | null) =>
      prisma.project.create({
        data: { title, slug: `${title}-${Date.now()}-${Math.random()}`, ownerId: leader.user.id, programId: programIdToUse, members: { create: { userId: leader.user.id, role: '팀장' } } },
      })
    const live = await make('진행 프로젝트', running.id)
    const done = await make('종료 프로젝트', ended.id)
    const left = await make('제외된 프로젝트', null)
    await prisma.programProjectRegistration.create({
      data: { programId: running.id, projectId: left.id, source: ProgramProjectRegistrationSource.EXISTING_PROJECT, status: ProgramProjectRegistrationStatus.REMOVED },
    })
    const rejected = await make('반려 프로젝트', null)
    await prisma.programProjectRegistration.create({
      data: { programId: running.id, projectId: rejected.id, source: ProgramProjectRegistrationSource.EXISTING_PROJECT, status: ProgramProjectRegistrationStatus.REJECTED },
    })
    await prisma.projectEvidence.create({
      data: { projectId: live.id, authorId: leader.user.id, title: '기존 증빙', activityDate: new Date(), status: EvidenceStatus.SUBMITTED, submittedAt: new Date() },
    })

    const candidates = await findBackfillCandidates({ organizationId: legacyOrg.id })
    expect(candidates.map((row) => [row.projectTitle, row.final, row.existing]).sort()).toEqual(
      [
        ['제외된 프로젝트', true, 'none'],
        ['종료 프로젝트', true, 'none'],
        ['진행 프로젝트', false, 'none'],
      ].sort(),
    )
    expect(await applyBackfill(candidates)).toEqual({ created: 3, finalized: 0 })
    const created = await prisma.programProjectRecord.findMany({ where: { organizationId: legacyOrg.id }, include: { events: true } })
    expect(created).toHaveLength(3)
    const byTitle = new Map(created.map((row) => [row.projectTitle, row]))
    expect(byTitle.get('진행 프로젝트')?.status).toBe(ProgramProjectRecordStatus.ACTIVE)
    expect(snapshotOf(byTitle.get('진행 프로젝트')!).evidence.map((e) => e.title)).toEqual(['기존 증빙'])
    expect(byTitle.get('종료 프로젝트')?.status).toBe(ProgramProjectRecordStatus.FINAL)
    expect(byTitle.get('제외된 프로젝트')?.status).toBe(ProgramProjectRecordStatus.FINAL)
    for (const row of created) expect(row.events).toEqual([expect.objectContaining({ trigger: 'backfill', version: 1, actorId: null })])

    const again = await findBackfillCandidates({ organizationId: legacyOrg.id })
    expect(await applyBackfill(again)).toEqual({ created: 0, finalized: 0 })
    expect(await prisma.programProjectRecordEvent.count({ where: { record: { organizationId: legacyOrg.id } } })).toBe(3)

    await prisma.program.update({ where: { id: running.id }, data: { status: ProgramStatus.COMPLETED } })
    expect(await applyBackfill(await findBackfillCandidates({ organizationId: legacyOrg.id }))).toEqual({ created: 0, finalized: 1 })
    expect((await prisma.programProjectRecord.findUniqueOrThrow({ where: { id: byTitle.get('진행 프로젝트')!.id } })).status).toBe(ProgramProjectRecordStatus.FINAL)
  })
})
