import { OrganizationMemberStatus, OrganizationRole, type PrismaClient } from '@prisma/client'

/**
 * Before program participants were separated from organization members, selecting an applicant
 * (and accepting a program-only invite) also made the user an ACTIVE MEMBER of the organization.
 * This finds those memberships so they can be reverted to participant-only access.
 */

/** A membership created within this window of the joining event is treated as created by it. */
const SAME_EVENT_MS = 2 * 60_000
export const CONVERSION_AUDIT_ACTION = 'org.member_convert_to_participant'

export type ConversionSource = 'application_accept' | 'program_invite'

export type ConversionCandidate = {
  memberId: string
  organizationId: string
  organizationName: string
  userId: string
  email: string
  source: ConversionSource
  joinedAt: Date | null
  eventAt: Date
  programIds: string[]
}

export type ConversionSkip = {
  organizationId: string
  organizationName: string
  userId: string
  email: string
  source: ConversionSource
  reason: string
}

type JoinEvent = { organizationId: string; userId: string; at: Date; source: ConversionSource }

export async function findAutoJoinedMembers(
  prisma: PrismaClient,
  options: { organizationId?: string; includeProgramInvites?: boolean } = {},
) {
  const accepted = await prisma.auditLog.findMany({
    where: {
      action: 'program.application_accept',
      outcome: 'success',
      metadata: { path: ['joinedOrganization'], equals: true },
      ...(options.organizationId ? { organizationId: options.organizationId } : { organizationId: { not: null } }),
    },
    select: { organizationId: true, metadata: true, createdAt: true },
  })
  const events: JoinEvent[] = accepted.flatMap((log) => {
    const userId = (log.metadata as { userId?: unknown } | null)?.userId
    return typeof userId === 'string' && log.organizationId
      ? [{ organizationId: log.organizationId, userId, at: log.createdAt, source: 'application_accept' as const }]
      : []
  })

  if (options.includeProgramInvites) {
    const invites = await prisma.organizationInvite.findMany({
      where: {
        status: 'ACCEPTED',
        role: OrganizationRole.MEMBER,
        programId: { not: null },
        acceptedById: { not: null },
        acceptedAt: { not: null },
        ...(options.organizationId ? { organizationId: options.organizationId } : {}),
      },
      select: { organizationId: true, acceptedById: true, acceptedAt: true },
    })
    for (const invite of invites) {
      events.push({ organizationId: invite.organizationId, userId: invite.acceptedById!, at: invite.acceptedAt!, source: 'program_invite' })
    }
  }

  const earliest = new Map<string, JoinEvent>()
  for (const event of events) {
    const key = `${event.organizationId}:${event.userId}`
    const current = earliest.get(key)
    if (!current || event.at < current.at) earliest.set(key, event)
  }
  const pairs = [...earliest.values()]
  if (pairs.length === 0) return { candidates: [] as ConversionCandidate[], skipped: [] as ConversionSkip[] }

  const orgIds = [...new Set(pairs.map((pair) => pair.organizationId))]
  const userIds = [...new Set(pairs.map((pair) => pair.userId))]
  const [memberships, managers, participants, orgInvites] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId: { in: orgIds }, userId: { in: userIds } },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
        joinedAt: true,
        createdAt: true,
        organization: { select: { name: true } },
        user: { select: { email: true } },
      },
    }),
    prisma.programManager.findMany({
      where: { userId: { in: userIds }, program: { organizationId: { in: orgIds } } },
      select: { userId: true, program: { select: { organizationId: true } } },
    }),
    prisma.programParticipant.findMany({
      where: { userId: { in: userIds }, program: { organizationId: { in: orgIds } } },
      select: { userId: true, programId: true, program: { select: { organizationId: true } } },
    }),
    prisma.organizationInvite.findMany({
      where: { organizationId: { in: orgIds }, acceptedById: { in: userIds }, status: 'ACCEPTED', programId: null },
      select: { organizationId: true, acceptedById: true },
    }),
  ])

  const key = (organizationId: string, userId: string) => `${organizationId}:${userId}`
  const membershipByKey = new Map(memberships.map((member) => [key(member.organizationId, member.userId), member]))
  const managerKeys = new Set(managers.map((row) => key(row.program.organizationId, row.userId)))
  const orgInviteKeys = new Set(orgInvites.map((row) => key(row.organizationId, row.acceptedById!)))
  const programsByKey = new Map<string, string[]>()
  for (const row of participants) {
    const k = key(row.program.organizationId, row.userId)
    programsByKey.set(k, [...(programsByKey.get(k) ?? []), row.programId])
  }

  const candidates: ConversionCandidate[] = []
  const skipped: ConversionSkip[] = []
  for (const event of pairs) {
    const k = key(event.organizationId, event.userId)
    const member = membershipByKey.get(k)
    if (!member) continue
    const skip = (reason: string) =>
      skipped.push({
        organizationId: event.organizationId,
        organizationName: member.organization.name,
        userId: event.userId,
        email: member.user.email,
        source: event.source,
        reason,
      })
    if (member.status !== OrganizationMemberStatus.ACTIVE) continue
    if (member.role !== OrganizationRole.MEMBER) skip(`organization role is ${member.role}`)
    else if (member.createdAt.getTime() < event.at.getTime() - SAME_EVENT_MS) skip('membership existed before (own join request or earlier membership)')
    else if (managerKeys.has(k)) skip('manages a program in this organization')
    else if (orgInviteKeys.has(k)) skip('accepted an organization-wide invite')
    else if (!programsByKey.has(k)) skip('no current program participation (review manually)')
    else
      candidates.push({
        memberId: member.id,
        organizationId: event.organizationId,
        organizationName: member.organization.name,
        userId: event.userId,
        email: member.user.email,
        source: event.source,
        joinedAt: member.joinedAt,
        eventAt: event.at,
        programIds: programsByKey.get(k)!,
      })
  }
  return { candidates, skipped }
}

/** Removes each candidate's membership (participant rows stay) and records an audit entry. */
export async function convertAutoJoinedMembers(prisma: PrismaClient, candidates: ConversionCandidate[], actorEmail: string) {
  let converted = 0
  for (const candidate of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      const removed = await tx.organizationMember.deleteMany({
        where: { id: candidate.memberId, role: OrganizationRole.MEMBER, status: OrganizationMemberStatus.ACTIVE },
      })
      if (removed.count === 0) return false
      await tx.auditLog.create({
        data: {
          actorEmail,
          organizationId: candidate.organizationId,
          action: CONVERSION_AUDIT_ACTION,
          targetType: 'user',
          targetId: candidate.userId,
          metadata: {
            source: candidate.source,
            joinedAt: candidate.joinedAt?.toISOString() ?? null,
            joinEventAt: candidate.eventAt.toISOString(),
            programIds: candidate.programIds,
          },
        },
      })
      return true
    })
    if (done) converted += 1
  }
  return converted
}
