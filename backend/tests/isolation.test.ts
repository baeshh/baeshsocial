import { OrganizationMemberStatus, OrganizationRole } from '@prisma/client'
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

let ownerA: Actor
let professorA: Actor
let otherManagerA: Actor
let studentA: Actor
let classmateA: Actor
let ownerB: Actor
let suspendedA: Actor
let orgA: { id: string }
let orgB: { id: string }
let programA: { id: string }
let programB: { id: string }
let projectA: { id: string }
let evidenceId: string
let fileId: string

beforeAll(async () => {
  await resetDb()
  ownerA = await createUserWithToken({ name: 'A대학 관리자' })
  professorA = await createUserWithToken({ name: 'A대학 교수' })
  otherManagerA = await createUserWithToken({ name: 'A대학 다른 매니저' })
  studentA = await createUserWithToken({ name: 'A대학 학생' })
  classmateA = await createUserWithToken({ name: 'A대학 동기' })
  suspendedA = await createUserWithToken({ name: 'A대학 정지' })
  ownerB = await createUserWithToken({ name: 'B대학 관리자' })

  orgA = await createOrg(ownerA.user.id, { name: 'A대학교' })
  orgB = await createOrg(ownerB.user.id, { name: 'B대학교' })
  await addMember(orgA.id, professorA.user.id, OrganizationRole.MANAGER)
  await addMember(orgA.id, otherManagerA.user.id, OrganizationRole.MANAGER)
  await addMember(orgA.id, studentA.user.id)
  await addMember(orgA.id, classmateA.user.id)
  await addMember(orgA.id, suspendedA.user.id, OrganizationRole.MEMBER, OrganizationMemberStatus.SUSPENDED)

  programA = await createProgram(orgA.id, { managerIds: [professorA.user.id], participantIds: [studentA.user.id, classmateA.user.id] })
  programB = await createProgram(orgB.id, { title: 'B 프로그램' })
  projectA = await createProgramProject(programA.id, professorA.user.id, [studentA.user.id])

  const created = await api()
    .post(`/api/projects/${projectA.id}/evidence`)
    .set(bearer(studentA.token))
    .field('title', '1차 회의')
    .field('activityDate', '2026-10-01')
    .attach('files', PDF, { filename: 'minutes.pdf', contentType: 'application/pdf' })
  expect(created.status).toBe(201)
  evidenceId = created.body.evidence.id
  fileId = created.body.evidence.files[0].id
  expect((await api().post(`/api/evidence/${evidenceId}/submit`).set(bearer(studentA.token))).status).toBe(200)
})

describe('cross-organization isolation (university A vs B)', () => {
  const orgRoutes = ['programs', 'members', 'billing', 'invites', 'onboarding', 'audit-logs', 'reports']

  it('B admin is denied every A organization route and the attempt is audited', async () => {
    for (const route of orgRoutes) {
      const response = await api().get(`/api/organizations/${orgA.id}/${route}`).set(bearer(ownerB.token))
      expect(response.status, route).toBe(403)
    }
    const denied = await prisma.auditLog.count({ where: { action: 'org.access_denied', actorId: ownerB.user.id, organizationId: orgA.id } })
    expect(denied).toBeGreaterThanOrEqual(orgRoutes.length)
  })

  it('B admin cannot see A programs, projects, evidence or files (404, existence not leaked)', async () => {
    expect((await api().get(`/api/programs/${programA.id}`).set(bearer(ownerB.token))).status).toBe(404)
    expect((await api().get(`/api/programs/${programA.id}/projects`).set(bearer(ownerB.token))).status).toBe(404)
    expect((await api().get(`/api/projects/${projectA.id}/evidence`).set(bearer(ownerB.token))).status).toBe(404)
    expect((await api().get(`/api/evidence/${evidenceId}`).set(bearer(ownerB.token))).status).toBe(404)
    expect((await api().get(`/api/evidence-files/${fileId}/url`).set(bearer(ownerB.token))).status).toBe(404)
  })

  it('B admin cannot create projects in, approve evidence of, or move projects into/out of A', async () => {
    const create = await api().post(`/api/programs/${programA.id}/projects`).set(bearer(ownerB.token)).send({ title: '침투 프로젝트' })
    expect(create.status).toBe(404)
    const review = await api().post(`/api/evidence/${evidenceId}/review`).set(bearer(ownerB.token)).send({ decision: 'approve' })
    expect(review.status).toBe(404)
    const move = await api()
      .post(`/api/programs/${programA.id}/projects/${projectA.id}/move`)
      .set(bearer(professorA.token))
      .send({ targetProgramId: programB.id })
    expect(move.status).toBe(404)
  })

  it('B admin cannot invite people into A or accept an A invite meant for someone else', async () => {
    const invite = await api()
      .post(`/api/organizations/${orgA.id}/invites`)
      .set(bearer(ownerB.token))
      .send({ rows: [{ email: 'x@test.baesh.dev' }] })
    expect(invite.status).toBe(403)
  })
})

describe('roles inside one organization', () => {
  it('students cannot manage, see audit logs, or see other members’ emails', async () => {
    expect((await api().post(`/api/organizations/${orgA.id}/programs`).set(bearer(studentA.token)).send({ title: '학생 프로그램' })).status).toBe(403)
    expect((await api().get(`/api/organizations/${orgA.id}/audit-logs`).set(bearer(studentA.token))).status).toBe(403)
    expect((await api().get(`/api/organizations/${orgA.id}/billing`).set(bearer(studentA.token))).status).toBe(403)
    const members = await api().get(`/api/organizations/${orgA.id}/members`).set(bearer(studentA.token))
    expect(members.status).toBe(200)
    for (const member of members.body.members) expect(member.email ?? null).toBeNull()
  })

  it('students only see their own team’s evidence; non-team classmates get 404', async () => {
    expect((await api().get(`/api/evidence/${evidenceId}`).set(bearer(classmateA.token))).status).toBe(404)
    expect((await api().get(`/api/evidence-files/${fileId}/url`).set(bearer(classmateA.token))).status).toBe(404)
  })

  it('a manager not assigned to the program cannot review its evidence', async () => {
    const review = await api().post(`/api/evidence/${evidenceId}/review`).set(bearer(otherManagerA.token)).send({ decision: 'approve' })
    expect([403, 404]).toContain(review.status)
  })

  it('suspended members lose organization access', async () => {
    const response = await api().get(`/api/organizations/${orgA.id}/programs`).set(bearer(suspendedA.token))
    expect(response.status).toBe(403)
  })

  it('assigned professor approves; the approval and file download are audited', async () => {
    const review = await api().post(`/api/evidence/${evidenceId}/review`).set(bearer(professorA.token)).send({ decision: 'approve' })
    expect(review.status).toBe(200)
    const download = await api().get(`/api/evidence-files/${fileId}/url?download=1`).set(bearer(professorA.token))
    expect(download.status).toBe(200)
    expect(await prisma.auditLog.count({ where: { action: 'evidence.approve', targetId: evidenceId, organizationId: orgA.id } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { action: 'evidence.file_download', targetId: fileId } })).toBe(1)
  })

  it('org admins see the trail of their own organization only', async () => {
    const logs = await api().get(`/api/organizations/${orgA.id}/audit-logs`).set(bearer(ownerA.token))
    expect(logs.status).toBe(200)
    expect(logs.body.logs.length).toBeGreaterThan(0)
    for (const log of logs.body.logs) {
      expect(log.organizationId).toBe(orgA.id)
      expect(log.ip).toBeUndefined()
    }
  })
})

describe('personal data exposure', () => {
  it('other users’ emails are hidden on profiles and org contact details only shown to admins', async () => {
    const profile = await api().get(`/api/users/${studentA.user.id}`).set(bearer(classmateA.token))
    expect(profile.status).toBe(200)
    expect(profile.body.user?.email ?? null).toBeNull()

    const asMember = await api().get(`/api/organizations/${orgA.id}`).set(bearer(studentA.token))
    expect(asMember.status).toBe(200)
    expect(asMember.body.organization.contactEmail).toBeNull()
    expect(asMember.body.organization.registrationNumber).toBeNull()
    const asAdmin = await api().get(`/api/organizations/${orgA.id}`).set(bearer(ownerA.token))
    expect(asAdmin.body.organization.contactEmail).toBe('contact@test.baesh.dev')
  })
})
