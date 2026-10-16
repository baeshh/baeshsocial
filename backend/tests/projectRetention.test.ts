import {
  EvidenceReviewAction,
  EvidenceStatus,
  OrganizationRole,
  ProgramProjectRegistrationSource,
  ProgramProjectRegistrationStatus,
  ProjectReviewKind,
  VerifiedRecordEventAction,
  VerifiedRecordKind,
  VerifiedRecordStatus,
} from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { PASSWORD, addMember, api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

let admin: Actor
let professor: Actor
let leader: Actor
let mate: Actor
let outsider: Actor
let otherOrgAdmin: Actor
let orgId: string
let programId: string

async function personalProject(owner: Actor, title: string) {
  const response = await api().post('/api/projects').set(bearer(owner.token)).send({ title, visibility: 'team' })
  expect(response.status).toBe(201)
  return response.body.project.id as string
}

async function addTeammate(projectId: string, userId: string, slug = 'editor') {
  const role = await prisma.projectRole.findUniqueOrThrow({ where: { projectId_slug: { projectId, slug } } })
  await prisma.projectMember.create({ data: { projectId, userId, roleId: role.id, role: role.name } })
}

const remove = (actor: Actor, projectId: string, body: Record<string, unknown> = {}) =>
  api().delete(`/api/projects/${projectId}`).set(bearer(actor.token)).send({ password: PASSWORD, ...body })

const deletion = (actor: Actor, projectId: string) => api().get(`/api/projects/${projectId}/deletion`).set(bearer(actor.token))

/**
 * A student-led project that went through the program: linked, evidence approved with a verified record and its
 * events, the outcome verified, staff feedback — then taken out of the program, which leaves it personal again.
 */
async function projectWithInstitutionHistory() {
  const projectId = await personalProject(leader, `검증 이력 프로젝트 ${Date.now()}`)
  await addTeammate(projectId, mate.user.id)
  await prisma.project.update({ where: { id: projectId }, data: { programId } })
  await prisma.programProjectRegistration.create({
    data: {
      programId,
      projectId,
      requesterId: leader.user.id,
      source: ProgramProjectRegistrationSource.EXISTING_PROJECT,
      status: ProgramProjectRegistrationStatus.APPROVED,
      reviewedById: professor.user.id,
      reviewedAt: new Date(),
    },
  })
  const evidence = await prisma.projectEvidence.create({
    data: {
      projectId,
      authorId: leader.user.id,
      title: '중간 발표',
      activityDate: new Date(),
      status: EvidenceStatus.APPROVED,
      submittedAt: new Date(),
      reviewedById: professor.user.id,
      reviewedAt: new Date(),
      reviews: {
        create: [
          { actorId: leader.user.id, action: EvidenceReviewAction.SUBMITTED },
          { actorId: professor.user.id, action: EvidenceReviewAction.APPROVED },
        ],
      },
    },
  })
  const verification = await prisma.projectVerification.create({
    data: {
      projectId,
      programId,
      organizationId: orgId,
      outcomeSummary: '시제품 완성',
      verifiedById: professor.user.id,
      snapshot: { v: 1 },
      contentHash: 'hash',
    },
  })
  const record = await prisma.verifiedRecord.create({
    data: {
      userId: leader.user.id,
      projectId,
      role: '팀장',
      contributionSummary: '중간 발표',
      evidenceId: evidence.id,
      status: VerifiedRecordStatus.VERIFIED,
      kind: VerifiedRecordKind.EVIDENCE,
      organizationId: orgId,
      programId,
      verifiedById: professor.user.id,
      verifiedAt: new Date(),
      contentHash: 'hash',
      snapshot: { v: 1 },
      events: { create: [{ action: VerifiedRecordEventAction.ISSUED, actorId: professor.user.id }] },
    },
  })
  await prisma.projectReview.create({ data: { projectId, programId, authorId: professor.user.id, kind: ProjectReviewKind.FEEDBACK, body: '좋습니다' } })
  const removed = await api()
    .post(`/api/programs/${programId}/projects/${projectId}/remove`)
    .set(bearer(professor.token))
    .send({ reason: '팀 요청으로 제외' })
  expect(removed.status).toBe(200)
  expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).programId).toBeNull()
  return { projectId, evidenceId: evidence.id, verificationId: verification.id, recordId: record.id }
}

beforeAll(async () => {
  await resetDb()
  admin = await createUserWithToken({ name: '기관 관리자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  leader = await createUserWithToken({ name: '팀장 학생' })
  mate = await createUserWithToken({ name: '동료 학생' })
  outsider = await createUserWithToken({ name: '외부인' })
  otherOrgAdmin = await createUserWithToken({ name: '다른 기관 관리자' })
  const org = await createOrg(admin.user.id, { name: '보존 대학교' })
  await createOrg(otherOrgAdmin.user.id, { name: '다른 대학교' })
  orgId = org.id
  await addMember(org.id, professor.user.id, OrganizationRole.MANAGER)
  const program = await createProgram(org.id, { managerIds: [professor.user.id], participantIds: [leader.user.id, mate.user.id], title: '보존 캡스톤' })
  programId = program.id
})

describe('personal projects', () => {
  it('a solo personal project can still be deleted, and the deletion is audited', async () => {
    const projectId = await personalProject(leader, '혼자 만든 프로젝트')
    const check = await deletion(leader, projectId)
    expect(check.body).toMatchObject({ canDelete: true, hasPermission: true, canArchive: true, blockers: [], impact: { otherMembers: 0 } })

    expect((await remove(leader, projectId)).status).toBe(204)
    expect(await prisma.project.findUnique({ where: { id: projectId } })).toBeNull()
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'project.delete', targetId: projectId } })
    expect(log).toMatchObject({ outcome: 'success', actorId: leader.user.id })
  })

  it('asks for confirmation when other members would lose the project too', async () => {
    const projectId = await personalProject(leader, '함께 만든 프로젝트')
    await addTeammate(projectId, mate.user.id)
    expect((await deletion(leader, projectId)).body.impact).toMatchObject({ otherMembers: 1 })

    const refused = await remove(leader, projectId)
    expect(refused.status).toBe(409)
    expect(refused.body.details).toMatchObject({ code: 'TEAM_IMPACT', impact: { otherMembers: 1 } })
    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull()

    expect((await remove(leader, projectId, { confirmTeamImpact: true })).status).toBe(204)
  })

  it('a teammate without the delete permission cannot delete, and outsiders cannot even look', async () => {
    const projectId = await personalProject(leader, '팀원 권한 프로젝트')
    await addTeammate(projectId, mate.user.id)
    expect((await deletion(mate, projectId)).body).toMatchObject({ canDelete: false, hasPermission: false })
    expect((await remove(mate, projectId, { confirmTeamImpact: true })).status).toBe(403)
    expect((await deletion(outsider, projectId)).status).toBe(404)
    expect([403, 404]).toContain((await remove(outsider, projectId, { confirmTeamImpact: true })).status)
    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull()
  })

  it('a pending program link must be withdrawn first; a rejected one does not hold the project', async () => {
    const pending = await personalProject(leader, '심사 중 프로젝트')
    await prisma.programProjectRegistration.create({
      data: { programId, projectId: pending, requesterId: leader.user.id, source: ProgramProjectRegistrationSource.EXISTING_PROJECT },
    })
    const refused = await remove(leader, pending)
    expect(refused.status).toBe(409)
    expect(refused.body.details.blockers.map((b: { code: string }) => b.code)).toEqual(['pending_registration'])

    const rejected = await personalProject(leader, '반려된 프로젝트')
    await prisma.programProjectRegistration.create({
      data: {
        programId,
        projectId: rejected,
        requesterId: leader.user.id,
        source: ProgramProjectRegistrationSource.EXISTING_PROJECT,
        status: ProgramProjectRegistrationStatus.REJECTED,
      },
    })
    expect((await remove(leader, rejected)).status).toBe(204)
  })
})

describe('program projects are retained', () => {
  it('neither the team leader nor program staff can delete a project that is in a program', async () => {
    const project = await createProgramProject(programId, professor.user.id)
    const leaderRole = await prisma.projectRole.create({
      data: { projectId: project.id, name: '관리자', slug: 'admin', permissions: ['project.view', 'project.edit', 'project.settings'] },
    })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: leader.user.id, roleId: leaderRole.id, role: '관리자' } })

    expect((await remove(leader, project.id)).status).toBe(403)
    expect((await remove(professor, project.id)).status).toBe(403)
    expect((await remove(admin, project.id)).status).toBe(403)
    const staffView = await deletion(professor, project.id)
    expect(staffView.body).toMatchObject({ canDelete: false, hasPermission: false })
    expect(staffView.body.blockers.map((b: { code: string }) => b.code)).toEqual(['program_project'])
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull()
  })

  it('a project taken out of a program keeps its link, verification, evidence and record history: deleting is refused', async () => {
    const { projectId, evidenceId, verificationId, recordId } = await projectWithInstitutionHistory()

    const check = await deletion(leader, projectId)
    expect(check.body.canDelete).toBe(false)
    expect(check.body.hasPermission).toBe(true)
    expect(check.body.blockers.map((b: { code: string }) => b.code)).toEqual([
      'program_history',
      'project_verification',
      'verified_record',
      'submitted_evidence',
      'program_review',
    ])

    const refused = await remove(leader, projectId, { confirmTeamImpact: true })
    expect(refused.status).toBe(409)
    expect(refused.body.details.code).toBe('PROJECT_RETAINED')

    expect(await prisma.project.findUnique({ where: { id: projectId } })).not.toBeNull()
    expect(await prisma.projectEvidence.findUnique({ where: { id: evidenceId } })).not.toBeNull()
    expect(await prisma.evidenceReview.count({ where: { evidenceId } })).toBe(2)
    expect(await prisma.projectVerification.findUnique({ where: { id: verificationId } })).not.toBeNull()
    expect(await prisma.verifiedRecord.findUnique({ where: { id: recordId } })).not.toBeNull()
    expect(await prisma.verifiedRecordEvent.count({ where: { recordId } })).toBe(1)
    expect(await prisma.programProjectRegistration.count({ where: { projectId, status: ProgramProjectRegistrationStatus.REMOVED } })).toBe(1)
    expect(await prisma.projectMember.count({ where: { projectId } })).toBe(2)

    const denied = await prisma.auditLog.findFirstOrThrow({ where: { action: 'project.delete', targetId: projectId } })
    expect(denied).toMatchObject({ outcome: 'denied', organizationId: orgId, actorId: leader.user.id })
  })

  it('a delete racing a program link either deletes a personal project or is refused, never deleting a linked one', async () => {
    const projectId = await personalProject(leader, '경합 프로젝트')
    const link = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`
      await tx.project.update({ where: { id: projectId }, data: { programId } })
    })
    const [deleted, linked] = await Promise.all([remove(leader, projectId), link.then(() => 'linked', () => 'failed')])
    const row = await prisma.project.findUnique({ where: { id: projectId } })
    if (row) {
      expect(linked).toBe('linked')
      expect(row.programId).toBe(programId)
      expect([403, 409]).toContain(deleted.status)
    } else {
      expect(deleted.status).toBe(204)
      expect(linked).toBe('failed')
    }
  })
})

describe('programs with records are retained', () => {
  it('a program with participants cannot be deleted; an empty draft still can', async () => {
    const withPeople = await createProgram(orgId, { managerIds: [professor.user.id], participantIds: [mate.user.id], title: '참여자 있는 프로그램' })
    const refused = await api().delete(`/api/programs/${withPeople.id}`).set(bearer(admin.token))
    expect(refused.status).toBe(409)
    expect(refused.body.details).toMatchObject({ code: 'PROGRAM_RETAINED', counts: { participants: 1 } })
    expect(await prisma.programParticipant.count({ where: { programId: withPeople.id } })).toBe(1)

    const empty = await createProgram(orgId, { title: '빈 프로그램' })
    expect((await api().delete(`/api/programs/${empty.id}`).set(bearer(admin.token))).status).toBe(204)
  })

  it('a program whose project left still keeps the verification and link history it holds', async () => {
    const program = await createProgram(orgId, { managerIds: [professor.user.id], title: '이력만 남은 프로그램' })
    const projectId = await personalProject(leader, `이력 보존 ${Date.now()}`)
    await prisma.programProjectRegistration.create({
      data: {
        programId: program.id,
        projectId,
        requesterId: leader.user.id,
        source: ProgramProjectRegistrationSource.EXISTING_PROJECT,
        status: ProgramProjectRegistrationStatus.REMOVED,
      },
    })
    await prisma.projectVerification.create({
      data: { projectId, programId: program.id, organizationId: orgId, outcomeSummary: '완료', snapshot: { v: 1 }, contentHash: 'h' },
    })
    const refused = await api().delete(`/api/programs/${program.id}`).set(bearer(admin.token))
    expect(refused.status).toBe(409)
    expect(refused.body.details.counts).toMatchObject({ registrations: 1, verifications: 1 })
    expect(await prisma.projectVerification.count({ where: { programId: program.id } })).toBe(1)
  })

  it('another organization cannot delete or inspect the program', async () => {
    const response = await api().delete(`/api/programs/${programId}`).set(bearer(otherOrgAdmin.token))
    expect([403, 404]).toContain(response.status)
    expect(await prisma.program.findUnique({ where: { id: programId } })).not.toBeNull()
  })
})
