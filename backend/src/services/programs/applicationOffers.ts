import { OrganizationMemberStatus, ProgramApplicationStatus, ProgramStatus, type Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { lockProgramSeats } from '../../utils/programAccess.js'
import { notifyUsers } from './programProjects.js'

export const DEFAULT_RESPONSE_DAYS = 3
const DAY = 86_400_000

export const offerDeadline = (now: Date, days = DEFAULT_RESPONSE_DAYS) => new Date(now.getTime() + days * DAY)

/** ACCEPTED applications whose response window is still open; they hold a seat. */
export const liveOfferWhere = (now: Date): Prisma.ProgramApplicationWhereInput => ({
  status: ProgramApplicationStatus.ACCEPTED,
  OR: [{ offerExpiresAt: null }, { offerExpiresAt: { gt: now } }],
})

/** Seats in use: registered participants plus open offers. Call while holding the program seat lock. */
export async function heldSeats(tx: Prisma.TransactionClient, programId: string, now: Date) {
  const [participants, offers] = await Promise.all([
    tx.programParticipant.count({ where: { programId } }),
    tx.programApplication.count({ where: { programId, ...liveOfferWhere(now) } }),
  ])
  return participants + offers
}

type Offered = { applicationId: string; userId: string; offerExpiresAt: Date }

/**
 * Lapses expired offers, then offers free seats to waitlisted applicants in waitlist order
 * (suspended organization members are skipped). Runs under the program seat lock.
 */
export async function refillProgram(programId: string, actorId: string | null, now = new Date()) {
  const result = await prisma.$transaction(async (tx) => {
    await lockProgramSeats(tx, programId)
    const program = await tx.program.findUniqueOrThrow({
      where: { id: programId },
      select: { id: true, title: true, capacity: true, status: true, organizationId: true, organization: { select: { name: true } } },
    })
    const lapsing = await tx.programApplication.findMany({
      where: { programId, status: ProgramApplicationStatus.ACCEPTED, offerExpiresAt: { lte: now } },
      select: { id: true, userId: true },
    })
    if (lapsing.length) {
      await tx.programApplication.updateMany({
        where: { id: { in: lapsing.map((row) => row.id) }, status: ProgramApplicationStatus.ACCEPTED },
        data: { status: ProgramApplicationStatus.DECLINED, respondedAt: null },
      })
    }

    const offered: Offered[] = []
    if (program.capacity && program.status !== ProgramStatus.ARCHIVED && program.status !== ProgramStatus.COMPLETED) {
      let free = program.capacity - (await heldSeats(tx, programId, now))
      if (free > 0) {
        const waitlist = await tx.programApplication.findMany({
          where: { programId, status: ProgramApplicationStatus.WAITLISTED },
          orderBy: [{ waitlistedAt: 'asc' }, { submittedAt: 'asc' }],
          select: { id: true, userId: true },
        })
        const suspended = new Set(
          (
            await tx.organizationMember.findMany({
              where: { organizationId: program.organizationId, userId: { in: waitlist.map((row) => row.userId) }, status: OrganizationMemberStatus.SUSPENDED },
              select: { userId: true },
            })
          ).map((row) => row.userId),
        )
        for (const row of waitlist) {
          if (free <= 0) break
          if (suspended.has(row.userId)) continue
          const offerExpiresAt = offerDeadline(now)
          const claimed = await tx.programApplication.updateMany({
            where: { id: row.id, status: ProgramApplicationStatus.WAITLISTED },
            data: { status: ProgramApplicationStatus.ACCEPTED, offerExpiresAt, reviewedAt: now, ...(actorId ? { reviewedById: actorId } : {}) },
          })
          if (claimed.count === 1) {
            offered.push({ applicationId: row.id, userId: row.userId, offerExpiresAt })
            free -= 1
          }
        }
      }
    }
    return { program, lapsed: lapsing, offered }
  })

  const label = `${result.program.organization.name} · ${result.program.title}`
  for (const offer of result.offered) {
    await notifyUsers(
      [offer.userId],
      actorId,
      '대기 중이던 프로그램에 합격했습니다',
      `${label} · ${offer.offerExpiresAt.toLocaleDateString('ko-KR')}까지 참여 여부를 알려 주세요`,
      '/opportunities?tab=my',
    )
  }
  await notifyUsers(result.lapsed.map((row) => row.userId), null, '응답 기한이 지나 합격이 취소되었습니다', label, '/opportunities?tab=my')
  return { lapsed: result.lapsed.length, offered: result.offered.length }
}

/** Hourly: lapse expired offers everywhere and pass the seats to waitlisted applicants. */
export async function expireProgramOffers(now = new Date()) {
  const programs = await prisma.programApplication.findMany({
    where: { status: ProgramApplicationStatus.ACCEPTED, offerExpiresAt: { lte: now } },
    distinct: ['programId'],
    select: { programId: true },
  })
  const totals = { programs: programs.length, lapsed: 0, offered: 0 }
  for (const { programId } of programs) {
    const result = await refillProgram(programId, null, now)
    totals.lapsed += result.lapsed
    totals.offered += result.offered
  }
  return totals
}
