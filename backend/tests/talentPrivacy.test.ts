import { EvidenceStatus, OrganizationRole, OrganizationType, ProjectVisibility, RecordDisclosure, VerifiedRecordStatus } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { issueVerifiedRecord } from '../src/services/verification/verifiedRecords.js'
import { addMember, api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type Result = {
  id: string
  rank: number
  withdrawn: boolean
  reason?: string
  recalculated?: boolean
  score?: number
  explanationSource?: string | null
  candidate?: { id: string }
  evidence?: { projects: { id: string; title: string; public: boolean }[]; verified: { id: string; projectTitle: string }[]; matchedSkills: { backedBy: string[] }[] }
}

const PERSONAL_TITLE = '에이 개인 러스트 엔진'
const PROGRAM_TITLE = '산학 러스트 시제품'

let recruiter: Actor
let professor: Actor
let alice: Actor
let bob: Actor
let carol: Actor
let companyId: string
let programId: string
let personalId: string
let programProjectId: string
let searchId: string

const talent = (path: string) => `/api/organizations/${companyId}/talent${path}`
const detail = async () => {
  const response = await api().get(talent(`/searches/${searchId}`)).set(bearer(recruiter.token))
  expect(response.status).toBe(200)
  return response.body.results as Result[]
}
const resultOf = (results: Result[], actor: Actor) => results.find((row) => row.candidate?.id === actor.user.id)
const storedRow = (actor: Actor) => prisma.matchResult.findFirstOrThrow({ where: { searchId, candidateId: actor.user.id } })

async function approvedRecord(authorId: string) {
  const evidence = await prisma.projectEvidence.create({
    data: {
      projectId: programProjectId,
      authorId,
      title: '러스트 시연',
      activityDate: new Date(),
      status: EvidenceStatus.APPROVED,
      submittedAt: new Date(),
      reviewedById: professor.user.id,
      reviewedAt: new Date(),
    },
  })
  await prisma.$transaction((tx) => issueVerifiedRecord(tx, { evidenceId: evidence.id, approverId: professor.user.id, approvedAt: new Date() }))
  return prisma.verifiedRecord.findUniqueOrThrow({ where: { evidenceId: evidence.id } })
}

async function optIn(actor: Actor, value: boolean, skills?: string[]) {
  const response = await api()
    .patch('/api/profiles/me')
    .set(bearer(actor.token))
    .send({ talentSearchOptIn: value, ...(skills ? { skills } : {}) })
  expect(response.status).toBe(200)
}

beforeAll(async () => {
  await resetDb()
  recruiter = await createUserWithToken({ name: '채용 담당' })
  professor = await createUserWithToken({ name: '담당 교수' })
  alice = await createUserWithToken({ name: '앨리스' })
  bob = await createUserWithToken({ name: '밥' })
  carol = await createUserWithToken({ name: '캐럴' })
  companyId = (await createOrg(recruiter.user.id, { type: OrganizationType.COMPANY })).id
  const university = await createOrg((await createUserWithToken()).user.id)
  await addMember(university.id, professor.user.id, OrganizationRole.MANAGER)
  programId = (await createProgram(university.id, { managerIds: [professor.user.id], participantIds: [alice.user.id, bob.user.id] })).id

  const created = await api().post('/api/projects').set(bearer(alice.token)).send({ title: PERSONAL_TITLE, visibility: 'public', skills: ['Rust'] })
  expect(created.status).toBe(201)
  personalId = created.body.project.id
  await prisma.project.update({ where: { id: personalId }, data: { skills: ['Rust'] } })

  const programProject = await createProgramProject(programId, professor.user.id, [alice.user.id, bob.user.id])
  programProjectId = programProject.id
  await prisma.project.update({ where: { id: programProjectId }, data: { title: PROGRAM_TITLE, skills: ['Rust'], visibility: ProjectVisibility.TEAM } })
  await approvedRecord(alice.user.id)
  await approvedRecord(bob.user.id)

  await optIn(alice, true, ['Go'])
  await optIn(bob, true)
  await optIn(professor, true)
  await prisma.profile.upsert({ where: { userId: carol.user.id }, create: { userId: carol.user.id, skills: ['Rust'] }, update: { skills: ['Rust'] } })

  const search = await api().post(talent('/searches')).set(bearer(recruiter.token)).send({ skills: ['Rust', 'Go'] })
  expect(search.status).toBe(201)
  searchId = search.body.search.id
})

describe('talent search only uses data the candidate shares now', () => {
  it('ranks consenting candidates on public projects and disclosed records only', async () => {
    const results = await detail()
    expect(results.map((row) => row.candidate?.id)).toEqual(expect.arrayContaining([alice.user.id, bob.user.id]))
    expect(resultOf(results, carol)).toBeUndefined()
    // Program projects owned by staff are not the staff member's own work.
    expect(resultOf(results, professor)).toBeUndefined()
    const a = resultOf(results, alice)!
    expect(a.evidence!.projects.map((row) => row.title)).toEqual(expect.arrayContaining([PERSONAL_TITLE, PROGRAM_TITLE]))
    expect(a.evidence!.projects.find((row) => row.id === programProjectId)?.public).toBe(false)
    expect(JSON.stringify(a)).toContain(PERSONAL_TITLE)
    expect(a.recalculated).toBe(false)
  })

  it('a program project marked PUBLIC does not count as public while the program disallows it', async () => {
    await prisma.project.update({ where: { id: programProjectId }, data: { visibility: ProjectVisibility.PUBLIC } })
    const fresh = await api().post(talent('/searches')).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
    const a = (fresh.body.results as Result[]).find((row) => row.candidate?.id === alice.user.id)!
    expect(a.evidence!.projects.find((row) => row.id === programProjectId)?.public).toBe(false)
    await prisma.project.update({ where: { id: programProjectId }, data: { visibility: ProjectVisibility.TEAM } })
  })

  it('saved search list carries no candidate data', async () => {
    const response = await api().get(talent('/searches')).set(bearer(recruiter.token))
    expect(response.status).toBe(200)
    expect(response.body.searches.map((row: { id: string }) => row.id)).toContain(searchId)
    expect(JSON.stringify(response.body)).not.toContain(PERSONAL_TITLE)
    expect(JSON.stringify(response.body)).not.toContain(alice.user.name)
  })

  it('hiding a project removes its title, skills, records and AI text from past results, at rest too', async () => {
    const before = resultOf(await detail(), alice)!
    expect((await api().put(`/api/projects/${personalId}/profile-display`).set(bearer(alice.token)).send({ hidden: true })).status).toBe(200)

    const stored = await storedRow(alice)
    expect(JSON.stringify(stored.evidence)).not.toContain(PERSONAL_TITLE)
    expect(stored.explanation ?? '').not.toContain(PERSONAL_TITLE)

    const after = resultOf(await detail(), alice)!
    expect(after.recalculated).toBe(true)
    expect(after.explanationSource).toBe('rule')
    expect(JSON.stringify(after)).not.toContain(PERSONAL_TITLE)
    expect(after.evidence!.projects.map((row) => row.id)).not.toContain(personalId)
    expect(after.score!).toBeLessThanOrEqual(before.score!)
    expect(after.evidence!.verified).toHaveLength(1)
  })

  it("other candidates' results are kept exactly as they were", async () => {
    const b = resultOf(await detail(), bob)!
    expect(b.recalculated).toBe(false)
    expect(b.evidence!.verified).toHaveLength(1)
  })

  it('showing the project again does not bring back the old AI text, but new searches see it again', async () => {
    await api().put(`/api/projects/${personalId}/profile-display`).set(bearer(alice.token)).send({ hidden: false })
    const past = resultOf(await detail(), alice)!
    expect(past.explanationSource).toBe('rule')
    const fresh = await api().post(talent('/searches')).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
    expect(JSON.stringify((fresh.body.results as Result[]).find((row) => row.candidate?.id === alice.user.id))).toContain(PERSONAL_TITLE)
  })

  it('making a project non-public re-scores past results without it', async () => {
    const visibility = await api().patch(`/api/projects/${personalId}/visibility`).set(bearer(alice.token)).send({ visibility: 'team' })
    expect(visibility.status).toBe(200)
    const fresh = await api().post(talent('/searches')).set(bearer(recruiter.token)).send({ skills: ['Rust'] })
    expect(JSON.stringify(fresh.body.results)).not.toContain(PERSONAL_TITLE)
    expect(JSON.stringify(await detail())).not.toContain(PERSONAL_TITLE)
  })

  it('a record the student hides drops out; with nothing shareable left the result is withdrawn and emptied', async () => {
    const record = await prisma.verifiedRecord.findFirstOrThrow({ where: { userId: bob.user.id } })
    expect((await api().patch(`/api/verified-records/${record.id}/visibility`).set(bearer(bob.token)).send({ disclosure: 'hidden' })).status).toBe(200)
    const bobRowId = (await storedRow(bob)).id
    const b = (await detail()).find((row) => row.id === bobRowId)!
    expect(b).toMatchObject({ withdrawn: true, reason: 'not_shareable' })
    expect(b.candidate).toBeUndefined()
    const stored = await storedRow(bob)
    expect(stored.score).toBe(0)
    expect(JSON.stringify(stored.evidence)).not.toContain(PROGRAM_TITLE)
    expect(stored.explanation).toBeNull()
    await prisma.verifiedRecord.update({ where: { id: record.id }, data: { disclosure: RecordDisclosure.SUMMARY } })
  })

  it('a revoked record is not shown even before any hook runs', async () => {
    const record = await prisma.verifiedRecord.findFirstOrThrow({ where: { userId: alice.user.id } })
    await prisma.verifiedRecord.update({ where: { id: record.id }, data: { status: VerifiedRecordStatus.REVOKED } })
    const a = resultOf(await detail(), alice)
    expect(JSON.stringify(a ?? {})).not.toContain(PROGRAM_TITLE)
    await prisma.verifiedRecord.update({ where: { id: record.id }, data: { status: VerifiedRecordStatus.VERIFIED } })
  })

  it('withdrawing consent empties stored results; consenting again re-scores from current data', async () => {
    await optIn(alice, false)
    const aliceRowId = (await storedRow(alice)).id
    const withdrawn = (await detail()).find((row) => row.id === aliceRowId)!
    expect(withdrawn).toMatchObject({ withdrawn: true, reason: 'consent' })
    const stored = await storedRow(alice)
    expect(JSON.stringify(stored.evidence)).not.toContain(PROGRAM_TITLE)
    expect(stored.explanation).toBeNull()
    expect(
      (await api().patch(talent(`/searches/${searchId}/results/${stored.id}/feedback`)).set(bearer(recruiter.token)).send({ feedback: 'shortlisted' }))
        .status,
    ).toBe(404)

    await optIn(alice, true)
    const back = resultOf(await detail(), alice)!
    expect(back.recalculated).toBe(true)
    expect(back.evidence!.verified).toHaveLength(1)
  })

  it('removing a profile skill drops it from past evidence', async () => {
    await optIn(alice, true, [])
    const a = resultOf(await detail(), alice)!
    expect(a.evidence!.matchedSkills.flatMap((row) => row.backedBy)).not.toContain('프로필')
  })

  it('results stay ordered by the current score', async () => {
    const shown = (await detail()).filter((row) => !row.withdrawn)
    const scores = shown.map((row) => row.score!)
    expect([...scores].sort((x, y) => y - x)).toEqual(scores)
    expect(shown.map((row) => row.rank)).toEqual(shown.map((_, index) => index + 1))
  })

  it('other companies cannot open the search', async () => {
    const other = await createUserWithToken()
    const otherCompany = await createOrg(other.user.id, { type: OrganizationType.COMPANY })
    const response = await api().get(`/api/organizations/${otherCompany.id}/talent/searches/${searchId}`).set(bearer(other.token))
    expect(response.status).toBe(404)
  })
})
