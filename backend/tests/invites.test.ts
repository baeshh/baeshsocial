import { OrganizationRole } from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

beforeEach(resetDb)

const tokenOf = (url: string) => url.split('/').pop()!

describe('bulk invitations', () => {
  it('program invite → student signs up with the link → enrolled with student number', async () => {
    const owner = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    const program = await createProgram(org.id)
    const response = await api()
      .post(`/api/organizations/${org.id}/invites`)
      .set(bearer(owner.token))
      .send({
        programId: program.id,
        rows: [
          { email: 'Student.One@test.baesh.dev', name: '학생1', studentNo: '20260001', department: '컴퓨터공학과' },
          { email: 'student.one@test.baesh.dev', name: '중복' },
          { email: 'not-an-email' },
        ],
      })
    expect(response.status).toBe(201)
    expect(response.body.summary).toEqual({ invited: 1, invalid: 2 })
    const invited = response.body.results.find((row: { status: string }) => row.status === 'invited')
    const token = tokenOf(invited.inviteUrl)

    const stored = await prisma.organizationInvite.findFirstOrThrow({ where: { organizationId: org.id } })
    expect(stored.tokenHash).not.toBe(token)
    expect(stored.email).toBe('student.one@test.baesh.dev')

    const preview = await api().get(`/api/invites/${token}`)
    expect(preview.status).toBe(200)
    expect(preview.body.invite.email).not.toContain('student.one')

    const register = await api()
      .post('/api/auth/register')
      .send({ name: '학생1', email: 'student.one@test.baesh.dev', password: 'abcd1234x', inviteToken: token })
    expect(register.status).toBe(201)
    expect(register.body.invite).toMatchObject({ organizationId: org.id, programId: program.id, role: 'member' })

    const participant = await prisma.programParticipant.findFirstOrThrow({ where: { programId: program.id } })
    expect(participant).toMatchObject({ studentNo: '20260001', department: '컴퓨터공학과' })
    const reuse = await api().post(`/api/invites/${token}/accept`).set(bearer(register.body.token))
    expect(reuse.status).toBe(410)
  })

  it('an invite can only be accepted by the invited email', async () => {
    const owner = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    const response = await api()
      .post(`/api/organizations/${org.id}/invites`)
      .set(bearer(owner.token))
      .send({ rows: [{ email: 'target@test.baesh.dev' }] })
    const token = tokenOf(response.body.results[0].inviteUrl)
    const stranger = await createUserWithToken()
    const accept = await api().post(`/api/invites/${token}/accept`).set(bearer(stranger.token))
    expect(accept.status).toBe(403)
    expect(await prisma.organizationMember.count({ where: { organizationId: org.id, userId: stranger.user.id } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { action: 'org.invite_accept', outcome: 'denied' } })).toBe(1)
  })

  it('managers can only invite members into programs they manage, never staff roles', async () => {
    const owner = await createUserWithToken()
    const manager = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    await addMember(org.id, manager.user.id, OrganizationRole.MANAGER)
    const mine = await createProgram(org.id, { managerIds: [manager.user.id] })
    const notMine = await createProgram(org.id, { title: '다른 프로그램' })

    const orgWide = await api().post(`/api/organizations/${org.id}/invites`).set(bearer(manager.token)).send({ rows: [{ email: 'a@test.baesh.dev' }] })
    expect(orgWide.status).toBe(403)
    const other = await api()
      .post(`/api/organizations/${org.id}/invites`)
      .set(bearer(manager.token))
      .send({ programId: notMine.id, rows: [{ email: 'a@test.baesh.dev' }] })
    expect(other.status).toBe(404)
    const staff = await api()
      .post(`/api/organizations/${org.id}/invites`)
      .set(bearer(manager.token))
      .send({ programId: mine.id, rows: [{ email: 'b@test.baesh.dev', role: 'manager' }, { email: 'c@test.baesh.dev' }] })
    expect(staff.status).toBe(201)
    expect(staff.body.summary).toEqual({ invalid: 1, invited: 1 })
  })

  it('respects the member limit of the plan', async () => {
    const owner = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    await prisma.subscription.updateMany({ where: { organizationId: org.id }, data: { limitOverrides: { members: 2 } } })
    const response = await api()
      .post(`/api/organizations/${org.id}/invites`)
      .set(bearer(owner.token))
      .send({ rows: [{ email: 'a@test.baesh.dev' }, { email: 'b@test.baesh.dev' }] })
    expect(response.status).toBe(402)
    expect(response.body.details).toMatchObject({ code: 'plan_limit', metric: 'members' })
  })

  it('revoked invites cannot be used', async () => {
    const owner = await createUserWithToken()
    const org = await createOrg(owner.user.id)
    const response = await api().post(`/api/organizations/${org.id}/invites`).set(bearer(owner.token)).send({ rows: [{ email: 'r@test.baesh.dev' }] })
    const { inviteId, inviteUrl } = response.body.results[0]
    expect((await api().delete(`/api/organizations/${org.id}/invites/${inviteId}`).set(bearer(owner.token))).status).toBe(204)
    const register = await api()
      .post('/api/auth/register')
      .send({ name: '취소됨', email: 'r@test.baesh.dev', password: 'abcd1234x', inviteToken: tokenOf(inviteUrl) })
    expect(register.status).toBe(201)
    expect(register.body.invite ?? null).toBeNull()
    expect(register.body.inviteError).toBeTruthy()
  })
})
