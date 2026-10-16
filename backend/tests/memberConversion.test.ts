import { OrganizationRole } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONVERSION_AUDIT_ACTION,
  convertAutoJoinedMembers,
  findAutoJoinedMembers,
} from '../src/services/onboarding/memberConversion.js'
import { addMember, api, bearer, createOrg, createProgram, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

let orgId: string
let programId: string
let selected: Actor
let requestedEarlier: Actor
let noLongerParticipant: Actor
let promoted: Actor
let invited: Actor
let ownMember: Actor

const acceptLog = (userId: string, joinedOrganization: boolean) =>
  prisma.auditLog.create({
    data: {
      organizationId: orgId,
      action: 'program.application_accept',
      targetType: 'program',
      targetId: programId,
      metadata: { applicationId: `app-${userId}`, userId, joinedOrganization },
    },
  })

beforeAll(async () => {
  await resetDb()
  const admin = await createUserWithToken({ name: '기관 관리자' })
  ;[selected, requestedEarlier, noLongerParticipant, promoted, invited, ownMember] = await Promise.all(
    ['선발 지원자', '가입 신청자', '참여 종료자', '담당자 승격', '초대 수락자', '기존 구성원'].map((name) => createUserWithToken({ name })),
  )
  orgId = (await createOrg(admin.user.id, { name: '변환 테스트 대학' })).id
  programId = (
    await createProgram(orgId, {
      participantIds: [selected.user.id, requestedEarlier.user.id, promoted.user.id, invited.user.id, ownMember.user.id],
    })
  ).id

  await addMember(orgId, selected.user.id)
  await acceptLog(selected.user.id, true)

  await prisma.organizationMember.create({
    data: { organizationId: orgId, userId: requestedEarlier.user.id, status: 'ACTIVE', createdAt: new Date(Date.now() - 86_400_000) },
  })
  await acceptLog(requestedEarlier.user.id, true)

  await addMember(orgId, noLongerParticipant.user.id)
  await acceptLog(noLongerParticipant.user.id, true)

  await addMember(orgId, promoted.user.id, OrganizationRole.MANAGER)
  await acceptLog(promoted.user.id, true)

  await addMember(orgId, invited.user.id)
  await prisma.organizationInvite.create({
    data: {
      organizationId: orgId,
      email: invited.user.email,
      programId,
      tokenHash: `hash-${invited.user.id}`,
      status: 'ACCEPTED',
      acceptedById: invited.user.id,
      acceptedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  })

  await addMember(orgId, ownMember.user.id)
  await acceptLog(ownMember.user.id, false)
})

describe('auto-joined member conversion', () => {
  it('selects only memberships created by selection, keeping everyone with another reason to be a member', async () => {
    const { candidates, skipped } = await findAutoJoinedMembers(prisma, { organizationId: orgId })
    expect(candidates.map((row) => row.userId)).toEqual([selected.user.id])
    expect(candidates[0]).toMatchObject({ source: 'application_accept', programIds: [programId] })

    const reasons = Object.fromEntries(skipped.map((row) => [row.userId, row.reason]))
    expect(reasons[requestedEarlier.user.id]).toMatch(/existed before/)
    expect(reasons[noLongerParticipant.user.id]).toMatch(/no current program participation/)
    expect(reasons[promoted.user.id]).toMatch(/MANAGER/)
    expect(reasons[ownMember.user.id]).toBeUndefined()
    expect(reasons[invited.user.id]).toBeUndefined()
  })

  it('includes program-invite joins only when asked', async () => {
    const { candidates } = await findAutoJoinedMembers(prisma, { organizationId: orgId, includeProgramInvites: true })
    expect(candidates.map((row) => row.userId).sort()).toEqual([selected.user.id, invited.user.id].sort())
  })

  it('removes the membership, keeps program access and is idempotent', async () => {
    const { candidates } = await findAutoJoinedMembers(prisma, { organizationId: orgId })
    expect(await convertAutoJoinedMembers(prisma, candidates, 'system:test')).toBe(1)

    expect(await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: selected.user.id } } })).toBeNull()
    expect(await prisma.programParticipant.count({ where: { programId, userId: selected.user.id } })).toBe(1)
    const log = await prisma.auditLog.findFirst({ where: { action: CONVERSION_AUDIT_ACTION, targetId: selected.user.id } })
    expect(log).toMatchObject({ organizationId: orgId, actorEmail: 'system:test' })

    const program = await api().get(`/api/programs/${programId}`).set(bearer(selected.token))
    expect(program.status).toBe(200)
    expect(program.body.myAccess).toMatchObject({ isParticipant: true, orgRole: null })
    expect((await api().get(`/api/organizations/${orgId}/programs`).set(bearer(selected.token))).status).toBe(403)

    expect(await convertAutoJoinedMembers(prisma, candidates, 'system:test')).toBe(0)
    expect((await findAutoJoinedMembers(prisma, { organizationId: orgId })).candidates).toHaveLength(0)
  })
})
