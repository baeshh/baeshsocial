import { beforeAll, describe, expect, it } from 'vitest'
import { api, bearer, createOrg, createProgram, createProgramProject, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>
type ListedProject = {
  id: string
  title: string
  status: string
  programId: string | null
  myRole: { name: string | null; isLeader: boolean }
  restricted: boolean
  nextTask: { id: string; title: string; status: string; dueDate: string | null } | null
}

let owner: Actor
let teammate: Actor
let personalId: string

const list = async (actor: Actor, params = '') => {
  const response = await api().get(`/api/projects?${params}`).set(bearer(actor.token))
  expect(response.status).toBe(200)
  return response.body as { projects: ListedProject[]; statusCounts?: Record<string, number>; nextCursor: string | null }
}

const create = async (title: string, data: Record<string, unknown> = {}) => {
  const response = await api().post('/api/projects').set(bearer(owner.token)).send({ title, ...data })
  expect(response.status).toBe(201)
  return response.body.project.id as string
}

const addTask = (actor: Actor, projectId: string, data: Record<string, unknown>) =>
  api().post(`/api/projects/${projectId}/tasks`).set(bearer(actor.token)).send(data)

beforeAll(async () => {
  await resetDb()
  owner = await createUserWithToken({ name: '프로젝트 주인' })
  teammate = await createUserWithToken({ name: '팀원' })

  personalId = await create('웹 리뉴얼', { status: 'active', description: '디자인 시스템 정리', visibility: 'team' })
  await create('앱 기획', { status: 'planning' })
  await create('지난 해커톤', { status: 'completed' })
  await create('보관한 실험', { status: 'archived' })

  const org = await createOrg(owner.user.id, { name: '워크스페이스대학' })
  const program = await createProgram(org.id, { title: '캡스톤', participantIds: [owner.user.id] })
  const programProject = await createProgramProject(program.id, owner.user.id, [owner.user.id])
  await prisma.project.update({ where: { id: programProject.id }, data: { title: '캡스톤 팀 프로젝트', status: 'ACTIVE' } })

  expect((await api().post(`/api/projects/${personalId}/members`).set(bearer(owner.token)).send({ email: teammate.user.email, role: '편집자' })).status).toBe(201)
})

describe('project list filters', () => {
  it('filters by status, kind and search text while counts ignore only the status filter', async () => {
    expect((await list(owner, 'status=active')).projects.map((row) => row.title).sort()).toEqual(['웹 리뉴얼', '캡스톤 팀 프로젝트'])

    const personal = await list(owner, 'kind=personal')
    expect(personal.projects.every((row) => row.programId === null)).toBe(true)
    expect(personal.statusCounts).toEqual({ PLANNING: 1, ACTIVE: 1, COMPLETED: 1, ARCHIVED: 1 })

    const program = await list(owner, 'kind=program&status=planning')
    expect(program.projects).toEqual([])
    expect(program.statusCounts).toEqual({ PLANNING: 0, ACTIVE: 1, COMPLETED: 0, ARCHIVED: 0 })

    expect((await list(owner, `q=${encodeURIComponent('디자인')}`)).projects.map((row) => row.title)).toEqual(['웹 리뉴얼'])
    expect((await list(owner, `q=${encodeURIComponent('해커톤')}&status=completed`)).projects).toHaveLength(1)
  })

  it('pages through creation order without repeats', async () => {
    const titles: string[] = []
    let cursor: string | null = null
    do {
      const page = await list(owner, `sort=created&limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      titles.push(...page.projects.map((row) => row.title))
      cursor = page.nextCursor
    } while (cursor)
    expect(titles).toEqual(['캡스톤 팀 프로젝트', '보관한 실험', '지난 해커톤', '앱 기획', '웹 리뉴얼'])
  })

  it('rejects unknown filter values', async () => {
    expect((await api().get('/api/projects?status=done').set(bearer(owner.token))).status).toBe(400)
    expect((await api().get('/api/projects?kind=team').set(bearer(owner.token))).status).toBe(400)
  })
})

describe('next task and role on project cards', () => {
  it('shows the open task due soonest and the viewer role', async () => {
    await addTask(owner, personalId, { title: '완료된 일', status: 'done', dueDate: '2026-01-01' })
    await addTask(owner, personalId, { title: '마감 없는 일' })
    await addTask(owner, personalId, { title: '다음 주 마감', dueDate: '2026-11-20' })
    await addTask(owner, personalId, { title: '내일 마감', status: 'in_progress', dueDate: '2026-11-10' })

    const mine = (await list(owner, 'kind=personal&status=active')).projects[0]
    expect(mine.nextTask).toMatchObject({ title: '내일 마감', status: 'IN_PROGRESS' })
    expect(mine.myRole).toEqual({ name: '소유자', isLeader: true })

    const theirs = (await list(teammate)).projects.find((row) => row.id === personalId)
    expect(theirs).toMatchObject({ myRole: { name: '편집자', isLeader: false }, restricted: false, nextTask: { title: '내일 마감' } })
  })

  it('hides the next task from members who may not see tasks', async () => {
    const role = await prisma.projectRole.create({ data: { projectId: personalId, name: '관찰자', slug: 'observer', permissions: ['project.view'] } })
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: personalId, userId: teammate.user.id } }, data: { roleId: role.id, role: role.name } })
    expect((await list(teammate)).projects.find((row) => row.id === personalId)).toMatchObject({ myRole: { name: '관찰자' }, nextTask: null })
  })

  it('hides it from members locked out of a private project', async () => {
    const editor = await prisma.projectRole.findUniqueOrThrow({ where: { projectId_slug: { projectId: personalId, slug: 'editor' } } })
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: personalId, userId: teammate.user.id } }, data: { roleId: editor.id, role: editor.name } })
    await prisma.project.update({ where: { id: personalId }, data: { visibility: 'PRIVATE' } })

    expect((await list(teammate)).projects.find((row) => row.id === personalId)).toMatchObject({ restricted: true, nextTask: null })
    await prisma.project.update({ where: { id: personalId }, data: { visibility: 'TEAM' } })
  })
})

describe('task assignees', () => {
  it('accepts team members and rejects anyone else', async () => {
    const outsider = await createUserWithToken({ name: '외부인' })
    const assigned = await addTask(owner, personalId, { title: '팀원 담당', assigneeId: teammate.user.id })
    expect(assigned.status).toBe(201)
    expect(assigned.body.task.assignee).toMatchObject({ id: teammate.user.id })

    const rejected = await addTask(owner, personalId, { title: '외부인 담당', assigneeId: outsider.user.id })
    expect(rejected.status).toBe(400)

    const taskId = assigned.body.task.id
    const reassign = await api().patch(`/api/projects/${personalId}/tasks/${taskId}`).set(bearer(owner.token)).send({ assigneeId: outsider.user.id })
    expect(reassign.status).toBe(400)
    const cleared = await api().patch(`/api/projects/${personalId}/tasks/${taskId}`).set(bearer(owner.token)).send({ assigneeId: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.task.assigneeId).toBeNull()
  })
})
