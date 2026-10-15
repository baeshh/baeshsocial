import { OrganizationMemberStatus, OrganizationRole, OrganizationType, ProjectVerificationStatus, VerifiedRecordStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

/**
 * Talent search privacy (PR #11) and independent official records (PR #12) on the same project: what a student
 * withdraws from companies disappears from their results, while the institution's record and verification history
 * stay exactly as they were.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Result = {
  withdrawn: boolean
  reason?: string
  candidate?: { id: string }
  evidence?: { projects: { id: string; title: string }[]; verified: { id: string }[] }
}

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
const TITLE = '통합 러스트 플랫폼'

let owner: Actor
let professor: Actor
let suspended: Actor
let leader: Actor
let mate: Actor
let third: Actor
let recruiter: Actor
let orgId: string
let companyId: string
let programId: string
let projectId: string
let recordId: string
let searchId: string

const talentDetail = async () => {
  const response = await api().get(`/api/organizations/${companyId}/talent/searches/${searchId}`).set(bearer(recruiter.token))
  expect(response.status).toBe(200)
  return response.body.results as Result[]
}
const resultOf = (results: Result[], actor: Actor) => results.find((row) => row.candidate?.id === actor.user.id)
const storedRow = (actor: Actor) => prisma.matchResult.findFirstOrThrow({ where: { searchId, candidateId: actor.user.id } })
const officialRecord = () => prisma.programProjectRecord.findUniqueOrThrow({ where: { id: recordId } })
const recordView = async () => {
  const response = await api().get(`/api/organizations/${orgId}/project-records/${recordId}`).set(bearer(owner.token))
  expect(response.status).toBe(200)
  return response.body.record
}
const institutionHistory = async () => ({
  verifications: await prisma.projectVerification.findMany({ where: { projectId }, select: { id: true, status: true, contentHash: true } }),
  records: await prisma.verifiedRecord.findMany({ where: { projectId }, select: { id: true, status: true, contentHash: true }, orderBy: { id: 'asc' } }),
  reviews: await prisma.evidenceReview.count({ where: { evidence: { projectId } } }),
})

async function approvedEvidence(author: Actor, title: string) {
  const created = await api()
    .post(`/api/projects/${projectId}/evidence`)
    .set(bearer(author.token))
    .field('title', title)
    .field('activityDate', '2026-10-02')
    .attach('files', PDF, { filename: `${title}.pdf`, contentType: 'application/pdf' })
  expect(created.status).toBe(201)
  expect((await api().post(`/api/evidence/${created.body.evidence.id}/submit`).set(bearer(author.token))).status).toBe(200)
  const reviewed = await api().post(`/api/evidence/${created.body.evidence.id}/review`).set(bearer(professor.token)).send({ decision: 'approve' })
  expect(reviewed.status).toBe(200)
}

async function optIn(actor: Actor, value: boolean) {
  const response = await api().patch('/api/profiles/me').set(bearer(actor.token)).send({ talentSearchOptIn: value, skills: ['Rust'] })
  expect(response.status).toBe(200)
}

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '기관 소유자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  suspended = await createUserWithToken({ name: '정지된 담당자' })
  leader = await createUserWithToken({ name: '팀장 학생' })
  mate = await createUserWithToken({ name: '동료 학생' })
  third = await createUserWithToken({ name: '세번째 학생' })
  recruiter = await createUserWithToken({ name: '기업 채용 담당' })
  orgId = (await createOrg(owner.user.id, { name: '통합 대학교' })).id
  companyId = (await createOrg(recruiter.user.id, { name: '통합 테크', type: OrganizationType.COMPANY })).id
  await addMember(orgId, professor.user.id, OrganizationRole.MANAGER)
  await addMember(orgId, suspended.user.id, OrganizationRole.ADMIN, OrganizationMemberStatus.SUSPENDED)

  const program = await createProgram(orgId, {
    managerIds: [professor.user.id],
    participantIds: [leader.user.id, mate.user.id, third.user.id],
    title: '통합 캡스톤',
  })
  programId = program.id
  await prisma.program.update({ where: { id: programId }, data: { allowStudentProjects: true, allowPublicProjects: true } })

  const requested = await api()
    .post(`/api/programs/${programId}/project-requests`)
    .set(bearer(leader.token))
    .send({ mode: 'new', title: TITLE, visibility: 'public', skills: ['Rust'] })
  expect(requested.status).toBe(201)
  projectId = requested.body.registration.project.id
  const approved = await api()
    .patch(`/api/programs/${programId}/project-requests/${requested.body.registration.id}`)
    .set(bearer(professor.token))
    .send({ decision: 'approve' })
  expect(approved.status).toBe(200)
  const assigned = await api()
    .post(`/api/programs/${programId}/projects/${projectId}/members`)
    .set(bearer(professor.token))
    .send({ userIds: [mate.user.id, third.user.id], teamRole: 'member' })
  expect(assigned.body.added).toHaveLength(2)

  await approvedEvidence(leader, '팀장 시연')
  await approvedEvidence(mate, '동료 학생 시연')
  const verified = await api()
    .post(`/api/programs/${programId}/projects/${projectId}/verification`)
    .set(bearer(professor.token))
    .send({
      outcomeSummary: '러스트 기반 플랫폼 시제품을 완성했습니다.',
      members: [{ userId: leader.user.id, role: '팀장', contribution: '아키텍처 설계와 핵심 모듈 구현을 맡았습니다.' }],
    })
  expect(verified.status).toBe(201)
  recordId = (await prisma.programProjectRecord.findUniqueOrThrow({ where: { programId_projectId: { programId, projectId } } })).id

  for (const actor of [leader, mate, third]) await optIn(actor, true)
  const search = await api().post(`/api/organizations/${companyId}/talent/searches`).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
  expect(search.status).toBe(201)
  searchId = search.body.search.id
})

describe('one project, two audiences', () => {
  it('before any change, the company sees the public project and the institution has the full record', async () => {
    const results = await talentDetail()
    for (const actor of [leader, mate, third]) expect(resultOf(results, actor)?.evidence?.projects.map((p) => p.title)).toContain(TITLE)
    expect(resultOf(results, leader)?.evidence?.verified.length).toBeGreaterThan(0)

    const view = await recordView()
    expect(view.snapshot.verification).toMatchObject({ status: 'VERIFIED' })
    expect(view.snapshot.participants.map((p: { userId: string }) => p.userId)).toEqual([leader.user.id, mate.user.id, third.user.id])
    expect(view.snapshot.evidence).toHaveLength(2)
  })

  it('hiding the project removes it from the leader’s company results; the official record and verification are untouched', async () => {
    const record = await officialRecord()
    const history = await institutionHistory()
    expect((await api().put(`/api/projects/${projectId}/profile-display`).set(bearer(leader.token)).send({ hidden: true })).status).toBe(200)

    const stored = await storedRow(leader)
    expect(JSON.stringify(stored.evidence)).not.toContain(TITLE)
    expect(JSON.stringify(stored.evidence)).not.toContain(projectId)
    expect(stored.explanation ?? '').not.toContain(TITLE)
    const shown = resultOf(await talentDetail(), leader)
    expect(JSON.stringify(shown ?? {})).not.toContain(TITLE)

    // Hiding is personal: teammates keep the project in their own results.
    expect(resultOf(await talentDetail(), mate)?.evidence?.projects.map((p) => p.title)).toContain(TITLE)

    const after = await officialRecord()
    expect(after.version).toBe(record.version)
    expect(after.contentHash).toBe(record.contentHash)
    expect(await institutionHistory()).toEqual(history)
    expect(history.verifications[0].status).toBe(ProjectVerificationStatus.VERIFIED)
    expect(history.records.every((row) => row.status === VerifiedRecordStatus.VERIFIED)).toBe(true)
    expect((await recordView()).snapshot.participants.map((p: { userId: string }) => p.userId)).toContain(leader.user.id)
  })

  it('withdrawing consent empties the mate’s results at rest; the institution keeps their part', async () => {
    const record = await officialRecord()
    await optIn(mate, false)
    const stored = await storedRow(mate)
    expect(stored.score).toBe(0)
    expect(JSON.stringify(stored.evidence)).not.toContain(TITLE)
    expect(stored.explanation).toBeNull()
    expect(resultOf(await talentDetail(), mate)).toBeUndefined()
    const withdrawn = (await talentDetail()).filter((row) => row.withdrawn)
    expect(withdrawn.map((row) => row.reason)).toContain('consent')
    expect(JSON.stringify(withdrawn)).not.toContain(mate.user.id)

    expect((await officialRecord()).contentHash).toBe(record.contentHash)
    const view = await recordView()
    expect(view.snapshot.evidence.map((e: { authorId: string }) => e.authorId)).toContain(mate.user.id)
    expect(await prisma.verifiedRecord.count({ where: { projectId, userId: mate.user.id, status: VerifiedRecordStatus.VERIFIED } })).toBe(1)
  })

  it('taking a student off the team rewrites their stored results right away and keeps them on the record', async () => {
    const removed = await api().delete(`/api/programs/${programId}/projects/${projectId}/members/${third.user.id}`).set(bearer(professor.token))
    expect(removed.status).toBe(204)
    const stored = await storedRow(third)
    expect(JSON.stringify(stored.evidence)).not.toContain(TITLE)
    expect(JSON.stringify(stored.evidence)).not.toContain(projectId)
    const view = await recordView()
    expect(view.snapshot.participants.find((p: { userId: string }) => p.userId === third.user.id)).toMatchObject({ onTeam: false })
  })

  it('redacting a participant from the record hides their id and name from the API but keeps the source history', async () => {
    const path = `/api/organizations/${orgId}/project-records/${recordId}`
    const correction = await api().post(`${path}/corrections`).set(bearer(professor.token)).send({ reason: '역할 정정', note: '동료 학생의 시연 역할 보완' })
    expect(correction.status).toBe(200)

    const redacted = await api().post(`${path}/redactions`).set(bearer(owner.token)).send({ userId: mate.user.id, reason: '동료 학생 본인 삭제 요청' })
    expect(redacted.status).toBe(200)
    expect((await api().post(`${path}/redactions`).set(bearer(owner.token)).send({ userId: mate.user.id, reason: '중복 요청' })).status).toBe(409)

    const view = (await api().get(path).set(bearer(owner.token))).body.record
    const text = JSON.stringify(view)
    expect(text).not.toContain(mate.user.id)
    expect(text).not.toContain('동료 학생')
    expect(text).not.toContain('redactedUserIds')
    expect(view.snapshot.redactedCount).toBe(1)
    const mateRow = view.snapshot.participants.find((p: { userId: string }) => p.userId === 'redacted:1')
    expect(mateRow).toMatchObject({ name: '비식별 처리된 참여자', role: null })
    const mateEvidence = view.snapshot.evidence.find((e: { authorId: string }) => e.authorId === 'redacted:1')
    expect(mateEvidence).toMatchObject({ id: null, status: 'APPROVED' })
    expect(mateEvidence.title).toBe('비식별 처리된 참여자 시연')
    expect(mateEvidence.files[0].name).toBe('비식별 처리된 참여자 시연.pdf')
    expect(view.snapshot.records.find((r: { userId: string }) => r.userId === 'redacted:1')).toMatchObject({ id: null, contentHash: null })
    expect(view.snapshot.corrections[0].note).not.toContain('동료 학생')
    // Statuses, dates and hashes are never rewritten by the name replacement.
    expect(view.snapshot.verification.status).toBe('VERIFIED')
    expect(view.events.every((event: { contentHash: string }) => /^[0-9a-f]{64}$/.test(event.contentHash))).toBe(true)

    for (let v = 1; v <= view.version; v += 1) {
      const old = await api().get(`${path}/versions/${v}`).set(bearer(owner.token))
      expect(old.status).toBe(200)
      expect(JSON.stringify(old.body)).not.toContain(mate.user.id)
      expect(JSON.stringify(old.body)).not.toContain('동료 학생')
    }

    const stored = await officialRecord()
    expect((stored.snapshot as { redactedUserIds: string[] }).redactedUserIds).toEqual([mate.user.id])
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'records.redact', targetId: recordId } })
    expect(JSON.stringify(audit.metadata)).not.toContain(mate.user.id)
    expect(audit.metadata).toMatchObject({ pseudonym: 'redacted:1' })

    // The live source rows are operational data of a running project and are not touched by a record redaction.
    expect(await prisma.verifiedRecord.count({ where: { projectId, userId: mate.user.id } })).toBe(1)
    expect(await prisma.projectEvidence.count({ where: { projectId, authorId: mate.user.id } })).toBe(1)
  })

  it('a later capture keeps the redacted person hidden', async () => {
    const reviewed = await api()
      .post(`/api/programs/${programId}/projects/${projectId}/revoke-verification`)
      .set(bearer(professor.token))
      .send({ reason: '재검토 필요' })
    expect(reviewed.status).toBe(200)
    const view = await recordView()
    expect(view.events.at(-1)).toMatchObject({ trigger: 'verification.revoked' })
    expect(view.snapshot.verification.status).toBe('REVOKED')
    expect(JSON.stringify(view)).not.toContain(mate.user.id)
    expect(JSON.stringify(view)).not.toContain('동료 학생')
  })
})

describe('who may read and change the three record tables', () => {
  it('companies, suspended staff and managers outside their scope are refused; nobody can write events directly', async () => {
    expect((await api().get(`/api/organizations/${orgId}/project-records`).set(bearer(recruiter.token))).status).toBe(403)
    expect((await api().get(`/api/organizations/${companyId}/project-records/${recordId}`).set(bearer(recruiter.token))).status).toBe(404)
    expect((await api().get(`/api/organizations/${orgId}/project-records`).set(bearer(suspended.token))).status).toBe(403)
    expect(
      (await api().put(`/api/organizations/${orgId}/project-records/retention-policy`).set(bearer(professor.token)).send({ basis: 'law', reference: '법 제1조', retentionMonths: 12 })).status,
    ).toBe(403)
    expect((await api().post(`/api/organizations/${orgId}/project-records`).set(bearer(owner.token)).send({})).status).toBe(404)
    expect((await api().patch(`/api/organizations/${orgId}/project-records/${recordId}`).set(bearer(owner.token)).send({ status: 'active' })).status).toBe(404)
    expect((await api().delete(`/api/organizations/${orgId}/project-records/${recordId}`).set(bearer(owner.token))).status).toBe(404)
  })

  it('the retention policy records who set it and on what basis', async () => {
    const set = await api()
      .put(`/api/organizations/${orgId}/project-records/retention-policy`)
      .set(bearer(owner.token))
      .send({ basis: 'law', reference: '공공기록물 관리에 관한 법률 시행령 별표', retentionMonths: 120 })
    expect(set.status).toBe(200)
    const policy = await prisma.recordRetentionPolicy.findUniqueOrThrow({ where: { id: set.body.policy.id } })
    expect(policy).toMatchObject({ organizationId: orgId, createdById: owner.user.id, retentionMonths: 120, retiredAt: null })
    expect(await prisma.auditLog.count({ where: { action: 'records.retention_policy_set', targetId: policy.id } })).toBe(1)
  })
})
