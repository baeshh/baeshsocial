import { EvidenceStatus, OrganizationRole, OrganizationType, ProjectVisibility, VerifiedRecordStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { rankCandidates } from '../src/modules/matching/scoring.js'
import { issueVerifiedRecord } from '../src/services/verification/verifiedRecords.js'
import { addMember, api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Card = { id: string; hiddenFromProfile?: boolean }
type HistoryItem = { kind: string; project: { id: string; hiddenFromProfile?: boolean } | null }

let professor: Actor
let leader: Actor
let mate: Actor
let outsider: Actor
let otherOrgAdmin: Actor
let recruiter: Actor
let companyId: string
let programId: string
let projectId: string

const display = (actor: Actor, id: string, hidden: boolean) =>
  api().put(`/api/projects/${id}/profile-display`).set(bearer(actor.token)).send({ hidden })

async function profileProjects(subject: Actor, viewer: Actor | null) {
  const request = api().get(`/api/profiles/${subject.user.id}/projects?limit=30`)
  const response = viewer ? await request.set(bearer(viewer.token)) : await request
  expect(response.status).toBe(200)
  return response.body.projects as Card[]
}

async function profileHistory(subject: Actor, viewer: Actor | null) {
  const request = api().get(`/api/profiles/${subject.user.id}/history?limit=50`)
  const response = viewer ? await request.set(bearer(viewer.token)) : await request
  expect(response.status).toBe(200)
  return (response.body.items as HistoryItem[]).filter((item) => item.kind === 'project')
}

async function overview(subject: Actor, viewer: Actor | null) {
  const request = api().get(`/api/profiles/${subject.user.id}/overview`)
  const response = viewer ? await request.set(bearer(viewer.token)) : await request
  expect(response.status).toBe(200)
  return response.body as { featuredProjects: Card[]; stats: { projectCount: number; verifiedCount: number }; profile: { featuredProjectIds?: string[] } }
}

async function issueRecord(authorId: string) {
  const evidence = await prisma.projectEvidence.create({
    data: {
      projectId,
      authorId,
      title: '시제품 시연',
      activityDate: new Date(),
      status: EvidenceStatus.APPROVED,
      submittedAt: new Date(),
      reviewedById: professor.user.id,
      reviewedAt: new Date(),
    },
  })
  await prisma.$transaction((tx) => issueVerifiedRecord(tx, { evidenceId: evidence.id, approverId: professor.user.id, approvedAt: new Date() }))
}

const institutionRows = () =>
  Promise.all([
    prisma.projectVerification.count({ where: { projectId } }),
    prisma.verifiedRecord.count({ where: { projectId } }),
    prisma.verifiedRecordEvent.count({ where: { record: { projectId } } }),
    prisma.projectMember.count({ where: { projectId } }),
  ])

beforeAll(async () => {
  await resetDb()
  const orgOwner = await createUserWithToken({ name: '기관 관리자' })
  professor = await createUserWithToken({ name: '담당 교수' })
  leader = await createUserWithToken({ name: '숨기는 학생' })
  mate = await createUserWithToken({ name: '같은 팀원' })
  outsider = await createUserWithToken({ name: '외부인' })
  otherOrgAdmin = await createUserWithToken({ name: '다른 기관 관리자' })
  recruiter = await createUserWithToken({ name: '기업 채용 담당' })

  const org = await createOrg(orgOwner.user.id)
  await addMember(org.id, professor.user.id, OrganizationRole.MANAGER)
  await createOrg(otherOrgAdmin.user.id)
  companyId = (await createOrg(recruiter.user.id, { type: OrganizationType.COMPANY })).id

  const program = await createProgram(org.id, { managerIds: [professor.user.id], participantIds: [leader.user.id, mate.user.id] })
  programId = program.id
  const project = await createProgramProject(programId, professor.user.id, [leader.user.id, mate.user.id])
  projectId = project.id
  await prisma.project.update({ where: { id: projectId }, data: { skills: ['Rust'], visibility: ProjectVisibility.TEAM } })
  const role = await prisma.projectRole.create({ data: { projectId, name: '팀원', slug: 'member', permissions: ['project.view'] } })
  await prisma.projectMember.updateMany({ where: { projectId }, data: { roleId: role.id, role: role.name } })

  await prisma.projectVerification.create({
    data: {
      projectId,
      programId,
      organizationId: org.id,
      outcomeSummary: '시제품 완성',
      verifiedById: professor.user.id,
      snapshot: { v: 1 },
      contentHash: 'hash',
    },
  })
  await issueRecord(leader.user.id)
  await issueRecord(mate.user.id)
  await prisma.profile.upsert({
    where: { userId: leader.user.id },
    create: { userId: leader.user.id, talentSearchOptIn: true },
    update: { talentSearchOptIn: true },
  })
  await prisma.profile.upsert({
    where: { userId: mate.user.id },
    create: { userId: mate.user.id, talentSearchOptIn: true },
    update: { talentSearchOptIn: true },
  })
  const pinned = await api().put('/api/profiles/me/featured-projects').set(bearer(leader.token)).send({ projectIds: [projectId] })
  expect(pinned.status).toBe(200)
})

describe('hiding a program project from the personal profile', () => {
  let searchId: string

  it('shows on the profile, history, featured projects and talent search before hiding', async () => {
    expect((await profileProjects(leader, outsider)).map((card) => card.id)).toContain(projectId)
    expect((await profileHistory(leader, outsider)).map((item) => item.project?.id)).toContain(projectId)
    expect((await overview(leader, outsider)).featuredProjects.map((card) => card.id)).toContain(projectId)

    const ranked = await rankCandidates({ skills: ['Rust'], keywords: [], limit: 20 }, [])
    expect(ranked.map((row) => row.userId)).toEqual(expect.arrayContaining([leader.user.id, mate.user.id]))

    const search = await api().post(`/api/organizations/${companyId}/talent/searches`).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
    expect(search.status).toBe(201)
    searchId = search.body.search.id
    const results = search.body.results as { candidate?: { id: string }; evidence?: { verified: unknown[] } }[]
    expect(results.find((row) => row.candidate?.id === leader.user.id)?.evidence?.verified).toHaveLength(1)
  })

  it('only someone the project appears for can change it', async () => {
    for (const actor of [outsider, otherOrgAdmin, recruiter, professor]) {
      expect((await display(actor, projectId, true)).status).toBe(404)
    }
    expect(await prisma.projectDisplayPreference.count()).toBe(0)
  })

  it('hides it from others everywhere on the profile without touching institution records', async () => {
    const before = await institutionRows()
    const response = await display(leader, projectId, true)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ hidden: true })
    expect((await display(leader, projectId, true)).status).toBe(200)

    for (const viewer of [outsider, mate, null]) {
      expect((await profileProjects(leader, viewer)).map((card) => card.id)).not.toContain(projectId)
      expect((await profileHistory(leader, viewer)).map((item) => item.project?.id)).not.toContain(projectId)
      const view = await overview(leader, viewer)
      expect(view.featuredProjects.map((card) => card.id)).not.toContain(projectId)
      expect(view.stats.verifiedCount).toBe(0)
    }
    expect(await institutionRows()).toEqual(before)
  })

  it('the student still sees it on their own profile, marked hidden, with the pin kept', async () => {
    const card = (await profileProjects(leader, leader)).find((row) => row.id === projectId)
    expect(card?.hiddenFromProfile).toBe(true)
    const item = (await profileHistory(leader, leader)).find((row) => row.project?.id === projectId)
    expect(item?.project?.hiddenFromProfile).toBe(true)
    const own = await overview(leader, leader)
    expect(own.featuredProjects.map((row) => row.id)).not.toContain(projectId)
    expect(own.profile.featuredProjectIds).toContain(projectId)
  })

  it('team access is unchanged for the student', async () => {
    const list = await api().get('/api/projects?limit=50').set(bearer(leader.token))
    expect(list.status).toBe(200)
    expect((list.body.projects as Card[]).find((row) => row.id === projectId)?.hiddenFromProfile).toBe(true)
    const detail = await api().get(`/api/projects/${projectId}`).set(bearer(leader.token))
    expect(detail.status).toBe(200)
    expect(detail.body.profileDisplay).toEqual({ canSet: true, hidden: true })
  })

  it("teammates' profiles keep the project and their own record", async () => {
    expect((await profileProjects(mate, outsider)).map((card) => card.id)).toContain(projectId)
    expect((await profileHistory(mate, outsider)).map((item) => item.project?.id)).toContain(projectId)
    const teammateView = await api().get('/api/projects?limit=50').set(bearer(mate.token))
    expect((teammateView.body.projects as Card[]).find((row) => row.id === projectId)?.hiddenFromProfile).toBe(false)
  })

  it('program staff still see the project and its verification', async () => {
    const detail = await api().get(`/api/projects/${projectId}`).set(bearer(professor.token))
    expect(detail.status).toBe(200)
    expect(detail.body.profileDisplay).toEqual({ canSet: false, hidden: false })
    const programProjects = await api().get(`/api/programs/${programId}/projects`).set(bearer(professor.token))
    expect(programProjects.status).toBe(200)
    expect(JSON.stringify(programProjects.body)).toContain(projectId)
    expect(await prisma.verifiedRecord.count({ where: { projectId, userId: leader.user.id, status: VerifiedRecordStatus.VERIFIED } })).toBe(1)
  })

  it('companies no longer match on it, in new or past searches', async () => {
    const ranked = await rankCandidates({ skills: ['Rust'], keywords: [], limit: 20 }, [])
    const leaderRow = ranked.find((row) => row.userId === leader.user.id)
    expect(leaderRow?.evidence.verified ?? []).toHaveLength(0)
    expect(leaderRow?.evidence.projects.map((row) => row.id) ?? []).not.toContain(projectId)
    expect(ranked.find((row) => row.userId === mate.user.id)?.evidence.verified).toHaveLength(1)

    const past = await api().get(`/api/organizations/${companyId}/talent/searches/${searchId}`).set(bearer(recruiter.token))
    expect(past.status).toBe(200)
    const rows = past.body.results as { candidate?: { id: string }; evidence?: { verified: unknown[]; projects: { id: string }[] } }[]
    const leaderPast = rows.find((row) => row.candidate?.id === leader.user.id)
    expect(leaderPast?.evidence?.verified).toHaveLength(0)
    expect(leaderPast?.evidence?.projects.map((row) => row.id)).not.toContain(projectId)
    expect(rows.find((row) => row.candidate?.id === mate.user.id)?.evidence?.verified).toHaveLength(1)
  })

  it('talent search consent still applies on top of display settings', async () => {
    await prisma.profile.update({ where: { userId: mate.user.id }, data: { talentSearchOptIn: false } })
    const ranked = await rankCandidates({ skills: ['Rust'], keywords: [], limit: 20 }, [])
    expect(ranked.map((row) => row.userId)).not.toContain(mate.user.id)
    await prisma.profile.update({ where: { userId: mate.user.id }, data: { talentSearchOptIn: true } })
  })

  it('showing it again restores the profile, history and the featured pin', async () => {
    const response = await display(leader, projectId, false)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ hidden: false })
    expect((await profileProjects(leader, outsider)).map((card) => card.id)).toContain(projectId)
    expect((await profileHistory(leader, outsider)).map((item) => item.project?.id)).toContain(projectId)
    expect((await overview(leader, outsider)).featuredProjects.map((card) => card.id)).toContain(projectId)
    expect(await prisma.projectDisplayPreference.count()).toBe(0)
  })

  it('a hidden project cannot be newly pinned', async () => {
    await display(leader, projectId, true)
    expect((await api().put('/api/profiles/me/featured-projects').set(bearer(leader.token)).send({ projectIds: [] })).status).toBe(200)
    const pin = await api().put('/api/profiles/me/featured-projects').set(bearer(leader.token)).send({ projectIds: [projectId] })
    expect(pin.status).toBe(400)
    await display(leader, projectId, false)
    expect((await api().put('/api/profiles/me/featured-projects').set(bearer(leader.token)).send({ projectIds: [projectId] })).status).toBe(200)
  })
})

describe('hiding a personal project', () => {
  it('the owner and teammates hide it independently; outsiders cannot', async () => {
    const created = await api().post('/api/projects').set(bearer(outsider.token)).send({ title: '개인 공개 프로젝트', visibility: 'public' })
    expect(created.status).toBe(201)
    const personalId = created.body.project.id as string
    const editor = await prisma.projectRole.findUniqueOrThrow({ where: { projectId_slug: { projectId: personalId, slug: 'editor' } } })
    await prisma.projectMember.create({ data: { projectId: personalId, userId: mate.user.id, roleId: editor.id, role: editor.name } })

    expect((await display(leader, personalId, true)).status).toBe(404)
    expect((await display(outsider, personalId, true)).status).toBe(200)
    expect((await profileProjects(outsider, leader)).map((card) => card.id)).not.toContain(personalId)
    expect((await profileProjects(mate, leader)).map((card) => card.id)).toContain(personalId)

    expect((await display(mate, personalId, true)).status).toBe(200)
    expect((await profileProjects(mate, leader)).map((card) => card.id)).not.toContain(personalId)
    expect((await api().get(`/api/projects/${personalId}`).set(bearer(mate.token))).status).toBe(200)
  })
})
