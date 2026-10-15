import { ProgramStatus, ProjectStatus, type Prisma } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { collectCareerSources } from '../src/services/ai/careerSources.js'
import { issueContributionRecord, issueVerifiedRecord, revokeRecordById } from '../src/services/verification/verifiedRecords.js'
import { api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Career = Awaited<ReturnType<typeof collectCareerSources>>

let staff: Actor
let student: Actor
let mate: Actor
let leaver: Actor
let organizationId: string
let programId: string
let teamProjectId: string

const texts = (career: Career) => [...career.sources.values()].map((source) => `${source.label} ${source.text}`).join('\n')
const projectIds = (career: Career) => career.projects.map((project) => project.projectId)
const verifiedTexts = (career: Career, projectId: string) =>
  [...career.sources.values()].filter((source) => source.projectId === projectId && source.verified).map((source) => source.text)

async function approveEvidence(projectId: string, authorId: string, title: string) {
  const evidence = await prisma.projectEvidence.create({
    data: {
      projectId,
      authorId,
      title,
      description: `${title} 상세`,
      activityDate: new Date('2026-09-01'),
      status: 'APPROVED',
      reviewedById: staff.user.id,
      reviewedAt: new Date('2026-09-10'),
    },
  })
  return prisma.$transaction((tx) => issueVerifiedRecord(tx, { evidenceId: evidence.id, approverId: staff.user.id, approvedAt: new Date('2026-09-10') }))
}

async function verifyContribution(projectId: string, program: string, userId: string, role: string, contribution: string) {
  const verification = await prisma.projectVerification.create({
    data: { projectId, programId: program, organizationId, outcomeSummary: '최종 시연 완료', verifiedById: staff.user.id, snapshot: {}, contentHash: 'fixture' },
  })
  return prisma.$transaction((tx) =>
    issueContributionRecord(tx, {
      projectVerificationId: verification.id,
      userId,
      role,
      contribution,
      startDate: null,
      endDate: null,
      approverId: staff.user.id,
      approvedAt: new Date('2026-09-20'),
    }),
  )
}

beforeAll(async () => {
  await resetDb()
  staff = await createUserWithToken({ name: '기관담당자' })
  student = await createUserWithToken({ name: '수행학생' })
  mate = await createUserWithToken({ name: '동료학생' })
  leaver = await createUserWithToken({ name: '탈퇴학생' })
  const org = await createOrg(staff.user.id, { name: '커리어대학' })
  organizationId = org.id
  const program = await createProgram(org.id, {
    title: '캡스톤 디자인',
    managerIds: [staff.user.id],
    participantIds: [student.user.id, mate.user.id, leaver.user.id],
  })
  programId = program.id

  // Staff created the project, so staff is its owner without being on the team.
  const project = await createProgramProject(program.id, staff.user.id, [student.user.id, mate.user.id, leaver.user.id])
  teamProjectId = project.id
  await prisma.project.update({
    where: { id: project.id },
    data: { title: '스마트 캠퍼스 앱', description: '캠퍼스 시설 예약 서비스', status: ProjectStatus.ACTIVE },
  })
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: project.id, userId: student.user.id } },
    data: { role: '프론트엔드 개발' },
  })
  await prisma.projectActivity.createMany({
    data: [
      { projectId: project.id, userId: staff.user.id, title: 'STAFF 운영 점검 메모' },
      { projectId: project.id, userId: student.user.id, title: 'STUDENT 화면 설계' },
      { projectId: project.id, userId: mate.user.id, title: 'MATE 비공개 회고' },
    ],
  })
  await prisma.projectTask.createMany({
    data: [
      { projectId: project.id, assigneeId: staff.user.id, title: 'STAFF 중간 점검' },
      { projectId: project.id, assigneeId: mate.user.id, title: 'MATE 백엔드 배포' },
      { projectId: project.id, assigneeId: student.user.id, title: 'STUDENT 예약 화면', status: 'DONE' },
    ],
  })
  await prisma.projectFile.create({
    data: { projectId: project.id, uploadedBy: mate.user.id, name: 'MATE_내부자료.pdf', url: 'https://example.com/mate.pdf', fileType: '문서' },
  })

  await approveEvidence(project.id, student.user.id, '예약 화면 사용성 테스트')
  await approveEvidence(project.id, leaver.user.id, '사용자 인터뷰 정리')
  await verifyContribution(project.id, program.id, student.user.id, '프론트엔드 리드', '예약 화면 전체를 설계하고 구현했습니다.')
})

describe('AI career sources follow who actually did the work', () => {
  it('1. leaves a program project out of the career of the staff member who created it', async () => {
    const career = await collectCareerSources(staff.user.id)
    expect(projectIds(career)).not.toContain(teamProjectId)
    expect(texts(career)).not.toMatch(/STAFF|스마트 캠퍼스 앱/)

    const picked = await collectCareerSources(staff.user.id, { projectIds: [teamProjectId], maxProjects: 1 })
    expect(picked.projects).toEqual([])
    const insight = await api().post('/api/ai/project-insight').set(bearer(staff.token)).send({ projectId: teamProjectId })
    expect(insight.status).toBe(404)
  })

  it('2. includes a real team member with their role, own work and official records', async () => {
    const career = await collectCareerSources(student.user.id)
    const project = career.projects.find((item) => item.projectId === teamProjectId)
    expect(project).toMatchObject({ title: '스마트 캠퍼스 앱', role: '프론트엔드 개발', isProgramProject: true })
    expect(project!.verifiedRefs).toHaveLength(2)
    const all = texts(career)
    expect(all).toContain('STUDENT 화면 설계')
    expect(all).toContain('STUDENT 예약 화면')
    expect(all).toContain('기관 공식 인증 · 커리어대학 · 캡스톤 디자인')
    expect(all).toContain('예약 화면 전체를 설계하고 구현했습니다.')
    expect(all).toContain('분석에 포함된 프로젝트 1개 / 기관 검증 기록 2건 / 완료한 담당 태스크 1개')
  })

  it('9. never exposes teammates’ activities, tasks, files or the managing staff’s notes', async () => {
    const all = texts(await collectCareerSources(student.user.id))
    expect(all).not.toMatch(/MATE|STAFF|동료학생|기관담당자|MATE_내부자료/)
  })

  it('3. keeps a verified record after the person leaves the team, described only from its snapshot', async () => {
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: teamProjectId, userId: leaver.user.id } } })
    const career = await collectCareerSources(leaver.user.id)
    const project = career.projects.find((item) => item.projectId === teamProjectId)
    expect(project).toMatchObject({ title: '스마트 캠퍼스 앱', isProgramProject: true })
    expect(project!.verifiedRefs).toHaveLength(1)
    const projectSource = career.sources.get(project!.ref)!
    expect(projectSource.text).toContain('소속: 커리어대학 · 캡스톤 디자인')
    expect(projectSource.text).toContain('기관 승인: 2026-09-10')
    expect(verifiedTexts(career, teamProjectId).join()).toContain('사용자 인터뷰 정리')
    const all = texts(career)
    expect(all).not.toMatch(/캠퍼스 시설 예약 서비스|STUDENT|MATE|STAFF/)

    const insight = await api().post('/api/ai/project-insight').set(bearer(leaver.token)).send({ projectId: teamProjectId })
    expect(insight.status).toBe(201)
  })

  it('7. drops a revoked record; with no team access left the project disappears', async () => {
    const record = await prisma.verifiedRecord.findFirstOrThrow({ where: { userId: leaver.user.id } })
    await prisma.$transaction((tx) => revokeRecordById(tx, { recordId: record.id, actorId: staff.user.id, reason: '증빙 재검토' }))
    const career = await collectCareerSources(leaver.user.id)
    expect(projectIds(career)).not.toContain(teamProjectId)
    expect(texts(career)).not.toContain('사용자 인터뷰 정리')
  })

  it('8. does not treat a record whose snapshot no longer matches its hash as an official record', async () => {
    const record = await approveEvidence(teamProjectId, student.user.id, '원본 발표 자료')
    const snapshot = record.snapshot as Prisma.JsonObject
    await prisma.verifiedRecord.update({
      where: { id: record.id },
      data: { snapshot: { ...snapshot, evidence: { ...(snapshot.evidence as Prisma.JsonObject), title: '조작된 전국 대상 수상' } } },
    })
    const career = await collectCareerSources(student.user.id)
    const all = texts(career)
    expect(all).not.toMatch(/조작된 전국 대상 수상|원본 발표 자료/)
    expect(career.projects.find((item) => item.projectId === teamProjectId)!.verifiedRefs).toHaveLength(2)

    await prisma.verifiedRecord.update({ where: { id: record.id }, data: { snapshot: { broken: true } } })
    expect(texts(await collectCareerSources(student.user.id))).not.toContain('원본 발표 자료')
  })

  it('6. leaves a project hidden from the profile out by default and includes it when picked', async () => {
    await prisma.projectDisplayPreference.create({ data: { userId: student.user.id, projectId: teamProjectId } })
    const career = await collectCareerSources(student.user.id)
    expect(projectIds(career)).not.toContain(teamProjectId)
    expect(texts(career)).not.toMatch(/예약 화면|공식 인증/)

    const picked = await collectCareerSources(student.user.id, { projectIds: [teamProjectId] })
    expect(picked.projects[0]?.verifiedRefs).toHaveLength(2)
    expect(texts(picked)).toContain('STUDENT 화면 설계')
    await prisma.projectDisplayPreference.deleteMany({ where: { userId: student.user.id } })
  })

  it('4. keeps the verified career after the program ends and the project is archived', async () => {
    const ended = await createProgram(organizationId, { title: '여름 해커톤', managerIds: [staff.user.id], participantIds: [mate.user.id] })
    const project = await createProgramProject(ended.id, staff.user.id, [mate.user.id])
    await prisma.project.update({ where: { id: project.id }, data: { title: '해커톤 챗봇', description: '해커톤 내부 설명' } })
    await approveEvidence(project.id, mate.user.id, '챗봇 데모 발표')
    await verifyContribution(project.id, ended.id, mate.user.id, '백엔드 개발', '대화 API를 구현했습니다.')
    await prisma.program.update({ where: { id: ended.id }, data: { status: ProgramStatus.COMPLETED } })
    await prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.ARCHIVED } })

    const career = await collectCareerSources(mate.user.id)
    const entry = career.projects.find((item) => item.projectId === project.id)
    expect(entry).toMatchObject({ title: '해커톤 챗봇', role: '백엔드 개발' })
    expect(entry!.verifiedRefs).toHaveLength(2)
    expect(career.sources.get(entry!.ref)!.text).toContain('기관 인증: 2026-09-20')
    expect(texts(career)).not.toContain('해커톤 내부 설명')

    const picked = await collectCareerSources(mate.user.id, { projectIds: [project.id] })
    expect(texts(picked)).toContain('해커톤 내부 설명')
    expect(picked.projects[0].verifiedRefs).toHaveLength(2)
  })

  it('5. archived personal projects stay out by default, are included when picked, and never for someone else', async () => {
    const created = await api().post('/api/projects').set(bearer(student.token)).send({ title: '보관한 개인 실험', description: '개인 실험 설명' })
    const archivedId = created.body.project.id as string
    await prisma.project.update({ where: { id: archivedId }, data: { status: ProjectStatus.ARCHIVED } })

    expect(projectIds(await collectCareerSources(student.user.id))).not.toContain(archivedId)
    const picked = await collectCareerSources(student.user.id, { projectIds: [archivedId] })
    expect(picked.projects).toMatchObject([{ projectId: archivedId, role: '프로젝트 리더' }])
    expect(texts(picked)).toContain('개인 실험 설명')

    expect((await collectCareerSources(mate.user.id, { projectIds: [archivedId] })).projects).toEqual([])
  })

  it('9. reads nothing from a PRIVATE project the leader has not opened to the member', async () => {
    const owner = await createUserWithToken({ name: '비공개팀장' })
    const created = await api().post('/api/projects').set(bearer(owner.token)).send({ title: '비공개 연구', description: 'SECRET 연구 설명', visibility: 'private' })
    const privateId = created.body.project.id as string
    expect((await api().post(`/api/projects/${privateId}/members`).set(bearer(owner.token)).send({ email: student.user.email, role: 'editor' })).status).toBe(201)

    const career = await collectCareerSources(student.user.id)
    expect(projectIds(career)).not.toContain(privateId)
    expect(texts(career)).not.toContain('SECRET')
    expect((await collectCareerSources(student.user.id, { projectIds: [privateId] })).projects).toEqual([])

    await prisma.projectMember.update({ where: { projectId_userId: { projectId: privateId, userId: student.user.id } }, data: { privateAccess: true } })
    expect(texts(await collectCareerSources(student.user.id, { projectIds: [privateId] }))).toContain('SECRET 연구 설명')
  })
})

describe('AI API responses keep their shape', () => {
  it('10. generates a portfolio and profile insight with the existing response fields', async () => {
    const portfolio = await api().post('/api/ai/portfolio').set(bearer(student.token)).send({})
    expect(portfolio.status).toBe(201)
    expect(Object.keys(portfolio.body).sort()).toEqual(['analysisId', 'meta', 'portfolio', 'validation'])
    expect(Object.keys(portfolio.body.portfolio).sort()).toEqual(['headline', 'projects', 'resumeSummary', 'skills', 'sources', 'stats'])
    const team = portfolio.body.portfolio.projects.find((project: { projectId: string }) => project.projectId === teamProjectId)
    expect(Object.keys(team).sort()).toEqual(
      ['contributions', 'intro', 'isProgramProject', 'links', 'outcomes', 'process', 'projectId', 'ref', 'role', 'roleSummary', 'technicalResults', 'title', 'verifiedEvidence'].sort(),
    )
    expect(team.verifiedEvidence.map((item: { label: string }) => item.label)).toContain('기관 공식 인증 · 커리어대학 · 캡스톤 디자인')
    expect(JSON.stringify(portfolio.body)).not.toMatch(/MATE|STAFF|조작된/)

    const latest = await api().get('/api/ai/portfolio/latest').set(bearer(student.token))
    expect(latest.status).toBe(200)
    expect(latest.body.analysisId).toBe(portfolio.body.analysisId)

    const staffPortfolio = await api().post('/api/ai/portfolio').set(bearer(staff.token)).send({ projectIds: [teamProjectId] })
    expect(staffPortfolio.status).toBe(400)

    const insight = await api().post('/api/ai/profile-insight').set(bearer(student.token)).send({})
    expect(insight.status).toBe(201)
    expect(Object.keys(insight.body).sort()).toEqual(['analysisId', 'insight', 'meta', 'validation'])
    expect(Object.keys(insight.body.insight).sort()).toEqual(['gaps', 'matchScore', 'mode', 'recommendations', 'sources', 'strengths', 'summary'])
  })
})
