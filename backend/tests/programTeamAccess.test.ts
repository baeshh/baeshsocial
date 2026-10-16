import { OrganizationRole } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

/**
 * People selected through recruitment join a program without joining its organization. Once staff put
 * them on a team they must be able to open that project and its evidence, also after it moves programs.
 */
let professor: Actor
let external: Actor
let student: Actor
let stranger: Actor
let programId: string
let nextProgramId: string
let projectId: string

beforeAll(async () => {
  await resetDb()
  const admin = await createUserWithToken({ name: '기관 관리자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  external = await createUserWithToken({ name: '외부 선발자' })
  student = await createUserWithToken({ name: '재학생' })
  stranger = await createUserWithToken({ name: '무관한 사람' })

  const org = await createOrg(admin.user.id, { name: '팀 접근 대학교' })
  await addMember(org.id, professor.user.id, OrganizationRole.MANAGER)
  await addMember(org.id, student.user.id)
  programId = (await createProgram(org.id, { managerIds: [professor.user.id], participantIds: [external.user.id, student.user.id], title: '여름 캠프' })).id
  nextProgramId = (await createProgram(org.id, { managerIds: [professor.user.id], title: '가을 심화' })).id

  const created = await api().post(`/api/programs/${programId}/projects`).set(bearer(professor.token)).send({ title: '외부 선발 팀' })
  expect(created.status).toBe(201)
  projectId = created.body.project?.id ?? created.body.id
  const assigned = await api()
    .post(`/api/programs/${programId}/projects/${projectId}/members`)
    .set(bearer(professor.token))
    .send({ userIds: [external.user.id, student.user.id], teamRole: 'member' })
  expect(assigned.status).toBe(200)
  expect(assigned.body.added).toHaveLength(2)
})

describe('program team access for participants outside the organization', () => {
  it('lets an external participant on the team open the project and its evidence', async () => {
    const project = await api().get(`/api/projects/${projectId}`).set(bearer(external.token))
    expect(project.status).toBe(200)
    expect(project.body.project?.title ?? project.body.title).toBe('외부 선발 팀')

    const evidence = await api().get(`/api/projects/${projectId}/evidence`).set(bearer(external.token))
    expect(evidence.status).toBe(200)
  })

  it('keeps organization members on the team working as before', async () => {
    expect((await api().get(`/api/projects/${projectId}`).set(bearer(student.token))).status).toBe(200)
  })

  it('still hides the project from people who are neither on the team nor staff', async () => {
    expect((await api().get(`/api/projects/${projectId}`).set(bearer(stranger.token))).status).toBe(404)
    expect((await api().get(`/api/projects/${projectId}/evidence`).set(bearer(stranger.token))).status).toBe(404)
  })

  it('keeps access after staff move the project to another program', async () => {
    const moved = await api()
      .post(`/api/programs/${programId}/projects/${projectId}/move`)
      .set(bearer(professor.token))
      .send({ targetProgramId: nextProgramId })
    expect(moved.status).toBe(200)

    const project = await api().get(`/api/projects/${projectId}`).set(bearer(external.token))
    expect(project.status).toBe(200)
    expect((await api().get(`/api/projects/${projectId}/evidence`).set(bearer(external.token))).status).toBe(200)
  })
})
