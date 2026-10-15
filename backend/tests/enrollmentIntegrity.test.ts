import { OpportunityType, UserRole } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { isDeadlinePassed, serviceToday } from '../src/utils/serviceDate.js'
import { api, bearer, createUserWithToken, prisma, resetDb } from './helpers.js'

type Actor = Awaited<ReturnType<typeof createUserWithToken>>

let manager: Actor
let otherManager: Actor

/** Midnight UTC of the Korean calendar date `offset` days from today, which is how a `YYYY-MM-DD` deadline is stored. */
const seoulDate = (offset: number) => {
  const today = new Date(`${serviceToday()}T00:00:00Z`)
  return new Date(today.getTime() + offset * 86_400_000)
}

const program = (data: Partial<Parameters<typeof prisma.opportunity.create>[0]['data']> = {}) =>
  prisma.opportunity.create({
    data: {
      title: '부트캠프',
      type: OpportunityType.EDUCATION,
      organization: '테스트기관',
      description: '교육 프로그램',
      createdBy: manager.user.id,
      ...data,
    },
  })

const enroll = (actor: Actor, opportunityId: string) => api().post(`/api/opportunities/${opportunityId}/enroll`).set(bearer(actor.token))
const withdraw = (actor: Actor, opportunityId: string) => api().delete(`/api/opportunities/${opportunityId}/enroll`).set(bearer(actor.token))
const decide = (actor: Actor, enrollmentId: string, status: string) =>
  api().patch(`/api/opportunities/enrollments/${enrollmentId}`).set(bearer(actor.token)).send({ status })
const record = (enrollmentId: string) =>
  prisma.opportunityEnrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { certificate: true } })

beforeAll(async () => {
  await resetDb()
  manager = await createUserWithToken({ name: '기관 담당자', role: UserRole.INSTITUTION })
  otherManager = await createUserWithToken({ name: '다른 기관', role: UserRole.INSTITUTION })
})

describe('deadline policy', () => {
  it('keeps a date-only deadline open through the whole day in Korea', () => {
    const deadline = new Date('2026-10-15T00:00:00Z')
    expect(isDeadlinePassed(deadline, new Date('2026-10-14T15:00:00Z'))).toBe(false) // 10/15 00:00 KST
    expect(isDeadlinePassed(deadline, new Date('2026-10-15T14:59:59Z'))).toBe(false) // 10/15 23:59:59 KST
    expect(isDeadlinePassed(deadline, new Date('2026-10-15T15:00:00Z'))).toBe(true) // 10/16 00:00 KST
    expect(isDeadlinePassed(null, new Date('2030-01-01T00:00:00Z'))).toBe(false)
  })

  it('accepts sign-ups on the deadline day and rejects them after it', async () => {
    const applicant = await createUserWithToken()
    const today = await program({ title: '오늘 마감', deadline: seoulDate(0) })
    const yesterday = await program({ title: '어제 마감', deadline: seoulDate(-1) })
    const always = await program({ title: '상시 모집', deadline: null })

    expect((await enroll(applicant, today.id)).status).toBe(201)
    expect((await enroll(applicant, always.id)).status).toBe(201)
    const late = await enroll(applicant, yesterday.id)
    expect(late.status).toBe(409)
    expect(late.body.message).toBe('모집이 마감되었습니다.')
    expect(await prisma.opportunityEnrollment.count({ where: { opportunityId: yesterday.id } })).toBe(0)
  })

  it('lists the same postings as open that still take sign-ups', async () => {
    const viewer = await createUserWithToken()
    const response = await api().get('/api/opportunities?openOnly=true&pageSize=50').set(bearer(viewer.token))
    const titles = response.body.opportunities.map((row: { title: string }) => row.title)
    expect(titles).toEqual(expect.arrayContaining(['오늘 마감', '상시 모집']))
    expect(titles).not.toContain('어제 마감')
  })

  it('still lets a pending applicant cancel after the deadline but not sign up again', async () => {
    const applicant = await createUserWithToken()
    const closing = await program({ title: '마감 후 취소', deadline: seoulDate(0) })
    await enroll(applicant, closing.id)
    await prisma.opportunity.update({ where: { id: closing.id }, data: { deadline: seoulDate(-1) } })

    expect((await withdraw(applicant, closing.id)).body.enrollment.status).toBe('WITHDRAWN')
    expect((await enroll(applicant, closing.id)).status).toBe(409)
  })
})

describe('sign-up status rules', () => {
  it('creates a sign-up once and returns the pending one unchanged on repeat', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const first = await enroll(applicant, opportunity.id)
    expect(first.status).toBe(201)
    expect(first.body.enrollment).toMatchObject({ status: 'APPLIED', opportunity: { id: opportunity.id } })

    const again = await enroll(applicant, opportunity.id)
    expect(again.status).toBe(200)
    expect(again.body.enrollment.id).toBe(first.body.enrollment.id)
    expect(again.body.enrollment.appliedAt).toBe(first.body.enrollment.appliedAt)
  })

  it('refuses posting types that have no BAESH sign-up', async () => {
    const applicant = await createUserWithToken()
    const job = await program({ type: OpportunityType.JOB })
    expect((await enroll(applicant, job.id)).status).toBe(400)
  })

  it('lets applicants sign up again after withdrawing or not being selected', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body

    expect((await withdraw(applicant, opportunity.id)).body.enrollment.status).toBe('WITHDRAWN')
    const reapplied = await enroll(applicant, opportunity.id)
    expect(reapplied.status).toBe(201)
    expect(reapplied.body.enrollment).toMatchObject({ id: enrollment.id, status: 'APPLIED' })

    expect((await decide(manager, enrollment.id, 'rejected')).body.enrollment.status).toBe('REJECTED')
    expect((await withdraw(applicant, opportunity.id)).status).toBe(409)
    expect((await enroll(applicant, opportunity.id)).body.enrollment.status).toBe('APPLIED')
  })

  it('never resets a participation by signing up again', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    await decide(manager, enrollment.id, 'enrolled')
    const before = await record(enrollment.id)

    const response = await enroll(applicant, opportunity.id)
    expect(response.status).toBe(409)
    expect(await record(enrollment.id)).toEqual(before)
    expect(before).toMatchObject({ status: 'ENROLLED', approvedById: manager.user.id })
    expect(before.enrolledAt).toBeInstanceOf(Date)
  })

  it('keeps the completion, certificate and approver of a completed participant', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    await decide(manager, enrollment.id, 'enrolled')
    const completed = await decide(manager, enrollment.id, 'completed')
    expect(completed.status).toBe(200)
    const before = await record(enrollment.id)
    expect(before).toMatchObject({ status: 'COMPLETED', approvedById: manager.user.id, certificate: { verified: true, source: 'PROGRAM' } })
    expect(before.completedAt).toBeInstanceOf(Date)

    const reapply = await enroll(applicant, opportunity.id)
    expect(reapply.status).toBe(409)
    expect(reapply.body.message).toBe('이미 수료한 프로그램은 다시 신청할 수 없습니다.')
    expect((await withdraw(applicant, opportunity.id)).status).toBe(400)
    for (const status of ['enrolled', 'rejected', 'withdrawn']) {
      expect((await decide(manager, enrollment.id, status)).status).toBe(409)
    }
    expect((await decide(manager, enrollment.id, 'completed')).status).toBe(200)

    expect(await record(enrollment.id)).toEqual(before)
    const certificates = await prisma.certificate.findMany({ where: { profile: { userId: applicant.user.id } } })
    expect(certificates).toEqual([before.certificate])
  })

  it('keeps the first approver and approval time when an approval is repeated', async () => {
    const applicant = await createUserWithToken()
    const admin = await createUserWithToken({ role: UserRole.ADMIN })
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    await decide(manager, enrollment.id, 'enrolled')
    const approved = await record(enrollment.id)

    expect((await decide(admin, enrollment.id, 'enrolled')).status).toBe(200)
    await decide(admin, enrollment.id, 'completed')
    const completed = await record(enrollment.id)
    expect(completed.enrolledAt).toEqual(approved.enrolledAt)
    expect(completed.approvedById).toBe(manager.user.id)
  })

  it('issues a certificate to every participant who completes the same program', async () => {
    const opportunity = await program({ title: '다수 수료' })
    const applicants = await Promise.all([createUserWithToken(), createUserWithToken(), createUserWithToken()])
    for (const applicant of applicants) {
      const { enrollment } = (await enroll(applicant, opportunity.id)).body
      expect((await decide(manager, enrollment.id, 'completed')).status).toBe(200)
    }
    const enrollments = await prisma.opportunityEnrollment.findMany({ where: { opportunityId: opportunity.id }, include: { certificate: { include: { profile: true } } } })
    expect(enrollments).toHaveLength(3)
    for (const row of enrollments) {
      expect(row).toMatchObject({ status: 'COMPLETED', certificate: { verified: true, title: '다수 수료', profile: { userId: row.userId } } })
    }
  })

  it('only lets the posting institution or an admin decide', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    expect((await decide(otherManager, enrollment.id, 'enrolled')).status).toBe(403)
    expect((await decide(applicant, enrollment.id, 'completed')).status).toBe(403)
    expect((await record(enrollment.id)).status).toBe('APPLIED')
  })
})

describe('concurrent requests', () => {
  it('creates a single sign-up from simultaneous requests', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const responses = await Promise.all(Array.from({ length: 6 }, () => enroll(applicant, opportunity.id)))

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 200, 201])
    expect(new Set(responses.map((response) => response.body.enrollment.id)).size).toBe(1)
    expect(await prisma.opportunityEnrollment.count({ where: { opportunityId: opportunity.id } })).toBe(1)
  })

  it('reopens a withdrawn sign-up once from simultaneous requests', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    await enroll(applicant, opportunity.id)
    await withdraw(applicant, opportunity.id)
    const responses = await Promise.all(Array.from({ length: 6 }, () => enroll(applicant, opportunity.id)))

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1)
    expect(responses.every((response) => response.body.enrollment?.status === 'APPLIED')).toBe(true)
  })

  it('completes once and issues one certificate from simultaneous completions', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    const responses = await Promise.all(Array.from({ length: 4 }, () => decide(manager, enrollment.id, 'completed')))

    const settled = await record(enrollment.id)
    for (const response of responses) {
      if (response.status === 200) expect(response.body.enrollment).toMatchObject({ status: 'COMPLETED', certificateId: settled.certificateId })
      else expect(response.status).toBe(409)
    }
    expect(responses.some((response) => response.status === 200)).toBe(true)
    expect(await prisma.certificate.count({ where: { profile: { userId: applicant.user.id } } })).toBe(1)
  })

  it('does not let a completion and a cancellation both win', async () => {
    const applicant = await createUserWithToken()
    const opportunity = await program()
    const { enrollment } = (await enroll(applicant, opportunity.id)).body
    await Promise.all([decide(manager, enrollment.id, 'completed'), withdraw(applicant, opportunity.id)])

    const settled = await record(enrollment.id)
    if (settled.status === 'COMPLETED') expect(settled.certificate?.verified).toBe(true)
    else expect(settled).toMatchObject({ status: 'WITHDRAWN', certificateId: null, completedAt: null })
  })
})
