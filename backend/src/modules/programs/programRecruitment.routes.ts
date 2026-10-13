import {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  ProgramApplicationStatus,
  ProgramStatus,
  ProgramVisibility,
  type Prisma,
} from '@prisma/client'
import type { Router as ExpressRouter } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { assertOrgCapacity } from '../../services/billing/entitlements.js'
import { notifyUsers, programStaffIds } from '../../services/programs/programProjects.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { assertProgramWritable, requireProgramAccess } from '../../utils/programAccess.js'
import {
  decideProgramApplicationSchema,
  discoverProgramsSchema,
  programApplicationQuerySchema,
  programApplySchema,
} from '../../validators/program.validator.js'
import { recruitmentState, serializeRecruitment, userBriefSelect, type RecruitmentState } from './program.serializers.js'

const DISCOVER_POOL_SIZE = 200
const STATE_ORDER: Record<RecruitmentState, number> = { open: 0, upcoming: 1, selected: 2, closed: 3 }

/**
 * Programs the user may discover: PUBLIC ones, plus ORGANIZATION ones of organizations the user is an
 * active member of. Only approved organizations are listed and archived programs never are.
 */
function discoverableWhere(userId: string): Prisma.ProgramWhereInput {
  return {
    status: { not: ProgramStatus.ARCHIVED },
    organization: { verificationStatus: OrganizationVerificationStatus.APPROVED },
    OR: [
      { visibility: ProgramVisibility.PUBLIC },
      {
        visibility: ProgramVisibility.ORGANIZATION,
        organization: { members: { some: { userId, status: OrganizationMemberStatus.ACTIVE } } },
      },
    ],
  }
}

const discoverInclude = (userId: string) =>
  ({
    organization: { select: { id: true, name: true, type: true } },
    _count: { select: { participants: true } },
    participants: { where: { userId }, select: { id: true } },
    managers: { where: { userId }, select: { id: true } },
    applications: { where: { userId }, select: { status: true, createdAt: true, reviewNote: true, reviewedAt: true } },
  }) satisfies Prisma.ProgramInclude

type DiscoverRow = Prisma.ProgramGetPayload<{ include: ReturnType<typeof discoverInclude> }>

function serializeDiscoverable(program: DiscoverRow) {
  const application = program.applications[0]
  return {
    id: program.id,
    title: program.title,
    description: program.description,
    term: program.term,
    status: program.status.toLowerCase(),
    startDate: program.startDate,
    endDate: program.endDate,
    visibility: program.visibility.toLowerCase(),
    organization: { ...program.organization, type: program.organization.type.toLowerCase() },
    recruitment: serializeRecruitment(program),
    participantCount: program._count.participants,
    myStatus: {
      isParticipant: program.participants.length > 0,
      isManager: program.managers.length > 0,
      application: application
        ? {
            status: application.status.toLowerCase(),
            createdAt: application.createdAt,
            reviewedAt: application.reviewedAt,
            reviewNote: application.status === ProgramApplicationStatus.REJECTED ? application.reviewNote : null,
          }
        : null,
    },
  }
}

async function findDiscoverable(programId: string, userId: string) {
  const program = await prisma.program.findFirst({
    where: { id: programId, ...discoverableWhere(userId) },
    include: discoverInclude(userId),
  })
  if (!program) throw new HttpError(404, '프로그램을 찾을 수 없습니다.')
  return program
}

/** Managers of the program, or the organization's admins when nobody is assigned. */
async function applicationReviewerIds(programId: string, organizationId: string) {
  const managers = await programStaffIds(prisma, programId)
  if (managers.length > 0) return managers
  const admins = await prisma.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } },
    select: { userId: true },
  })
  return admins.map((row) => row.userId)
}

const applicationInclude = {
  user: { select: { ...userBriefSelect, profile: { select: { headline: true } } } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.ProgramApplicationInclude

type ApplicationRow = Prisma.ProgramApplicationGetPayload<{ include: typeof applicationInclude }>

function serializeApplication(application: ApplicationRow) {
  const { profile, ...user } = application.user
  return {
    id: application.id,
    status: application.status.toLowerCase(),
    message: application.message,
    reviewNote: application.reviewNote,
    reviewedAt: application.reviewedAt,
    reviewedBy: application.reviewedBy,
    createdAt: application.createdAt,
    user: { ...user, headline: profile?.headline ?? null },
  }
}

export function registerProgramRecruitmentRoutes(router: ExpressRouter) {
  router.get('/discover', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const query = discoverProgramsSchema.parse(req.query)
      const rows = await prisma.program.findMany({
        where: {
          ...discoverableWhere(authUser.id),
          ...(query.q
            ? {
                AND: [
                  {
                    OR: [
                      { title: { contains: query.q, mode: 'insensitive' } },
                      { description: { contains: query.q, mode: 'insensitive' } },
                      { targetAudience: { contains: query.q, mode: 'insensitive' } },
                      { organization: { name: { contains: query.q, mode: 'insensitive' } } },
                    ],
                  },
                ],
              }
            : {}),
        },
        include: discoverInclude(authUser.id),
        orderBy: { createdAt: 'desc' },
        take: DISCOVER_POOL_SIZE,
      })

      const now = new Date()
      const sorted = rows
        .map((program) => ({ program, state: recruitmentState(program, now) }))
        .sort((a, b) => {
          const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state]
          if (byState !== 0) return byState
          if (a.state === 'open' || a.state === 'upcoming') {
            const key = a.state === 'open' ? 'applyEndAt' : 'applyStartAt'
            return (a.program[key]?.getTime() ?? Infinity) - (b.program[key]?.getTime() ?? Infinity)
          }
          return b.program.createdAt.getTime() - a.program.createdAt.getTime()
        })

      const total = sorted.length
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
      const page = Math.min(query.page, totalPages)
      const slice = sorted.slice((page - 1) * query.pageSize, page * query.pageSize)
      res.status(200).json({
        programs: slice.map(({ program }) => serializeDiscoverable(program)),
        page,
        pageSize: query.pageSize,
        total,
        totalPages,
        openCount: sorted.filter((row) => row.state === 'open').length,
      })
    } catch (error) {
      next(error)
    }
  })

  router.get('/discover/:programId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const program = await findDiscoverable(String(req.params.programId), authUser.id)
      res.status(200).json({ program: serializeDiscoverable(program) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/applications/me', authenticate, async (_req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const applications = await prisma.programApplication.findMany({
        where: { userId: authUser.id },
        orderBy: { createdAt: 'desc' },
        include: {
          program: {
            select: {
              id: true,
              title: true,
              organizationId: true,
              organization: { select: { name: true } },
              participants: { where: { userId: authUser.id }, select: { id: true } },
            },
          },
        },
      })
      res.status(200).json({
        applications: applications.map((application) => ({
          id: application.id,
          status: application.status.toLowerCase(),
          message: application.message,
          reviewNote: application.status === ProgramApplicationStatus.REJECTED ? application.reviewNote : null,
          createdAt: application.createdAt,
          reviewedAt: application.reviewedAt,
          program: {
            id: application.program.id,
            title: application.program.title,
            organizationId: application.program.organizationId,
            organizationName: application.program.organization.name,
            isParticipant: application.program.participants.length > 0,
          },
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:programId/applications', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const input = programApplySchema.parse(req.body ?? {})
      const program = await findDiscoverable(String(req.params.programId), authUser.id)
      const state = recruitmentState(program)
      if (state === 'selected') throw new HttpError(409, '선발이 완료된 프로그램이라 지원을 받지 않습니다.')
      if (state === 'upcoming') throw new HttpError(409, '아직 모집 기간이 아닙니다.')
      if (state === 'closed') throw new HttpError(409, '모집이 마감되었습니다.')
      if (program.participants.length > 0) throw new HttpError(409, '이미 이 프로그램의 참여자입니다.')

      const existing = program.applications[0]
      if (existing?.status === ProgramApplicationStatus.PENDING) throw new HttpError(409, '이미 지원했습니다. 결과를 기다려 주세요.')
      if (existing?.status === ProgramApplicationStatus.ACCEPTED) throw new HttpError(409, '이미 선발되었습니다.')
      if (existing?.status === ProgramApplicationStatus.REJECTED) throw new HttpError(409, '이번 모집에서는 다시 지원할 수 없습니다.')

      const application = await prisma.programApplication.upsert({
        where: { programId_userId: { programId: program.id, userId: authUser.id } },
        create: { programId: program.id, userId: authUser.id, message: input.message ?? null },
        update: {
          status: ProgramApplicationStatus.PENDING,
          message: input.message ?? null,
          reviewNote: null,
          reviewedAt: null,
          reviewedById: null,
          createdAt: new Date(),
        },
      })

      await notifyUsers(
        await applicationReviewerIds(program.id, program.organizationId),
        authUser.id,
        '새 프로그램 지원자가 있습니다',
        `${program.organization.name} · ${program.title}`,
        `/org/${program.organizationId}/programs/${program.id}?tab=applications`,
      )
      res.status(201).json({ application: { id: application.id, status: 'pending' } })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/:programId/applications/me', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { count } = await prisma.programApplication.updateMany({
        where: { programId: String(req.params.programId), userId: authUser.id, status: ProgramApplicationStatus.PENDING },
        data: { status: ProgramApplicationStatus.WITHDRAWN },
      })
      if (count === 0) throw new HttpError(409, '철회할 수 있는 지원 내역이 없습니다.')
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  })

  router.get('/:programId/applications', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
      const query = programApplicationQuerySchema.parse(req.query)
      const [applications, counts] = await Promise.all([
        prisma.programApplication.findMany({
          where: {
            programId: access.program.id,
            ...(query.status === 'all' ? {} : { status: query.status.toUpperCase() as ProgramApplicationStatus }),
          },
          include: applicationInclude,
          orderBy: { createdAt: 'asc' },
          take: 300,
        }),
        prisma.programApplication.groupBy({ by: ['status'], where: { programId: access.program.id }, _count: { _all: true } }),
      ])
      const participantCount = await prisma.programParticipant.count({ where: { programId: access.program.id } })
      res.status(200).json({
        applications: applications.map(serializeApplication),
        counts: Object.fromEntries(counts.map((row) => [row.status.toLowerCase(), row._count._all])),
        capacity: access.program.capacity,
        participantCount,
      })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/:programId/applications/:applicationId', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const access = await requireProgramAccess(String(req.params.programId), authUser.id, 'staff')
      assertProgramWritable(access.program.status)
      const input = decideProgramApplicationSchema.parse(req.body)
      const application = await prisma.programApplication.findFirst({
        where: { id: String(req.params.applicationId), programId: access.program.id },
      })
      if (!application) throw new HttpError(404, '지원서를 찾을 수 없습니다.')
      if (application.status !== ProgramApplicationStatus.PENDING) throw new HttpError(409, '이미 처리된 지원서입니다.')

      const organizationId = access.organization.id
      if (input.decision === 'reject') {
        const updated = await prisma.programApplication.update({
          where: { id: application.id },
          data: { status: ProgramApplicationStatus.REJECTED, reviewNote: input.note ?? null, reviewedById: authUser.id, reviewedAt: new Date() },
          include: applicationInclude,
        })
        await audit(req, res, {
          action: 'program.application_reject',
          organizationId,
          targetType: 'program',
          targetId: access.program.id,
          metadata: { applicationId: application.id, userId: application.userId },
        })
        await notifyUsers(
          [application.userId],
          authUser.id,
          '프로그램 지원 결과가 등록되었습니다',
          `${access.organization.name} · ${access.program.title}`,
          `/programs/${access.program.id}`,
        )
        res.status(200).json({ application: serializeApplication(updated) })
        return
      }

      if (access.program.capacity) {
        const participants = await prisma.programParticipant.count({ where: { programId: access.program.id } })
        if (participants >= access.program.capacity) {
          throw new HttpError(409, `선발 인원(${access.program.capacity}명)이 모두 찼습니다. 설정에서 인원을 늘린 뒤 선발해 주세요.`)
        }
      }
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: application.userId } },
        select: { id: true, status: true },
      })
      if (membership?.status === OrganizationMemberStatus.SUSPENDED) {
        throw new HttpError(409, '조직에서 이용이 정지된 사용자는 선발할 수 없습니다.')
      }
      const joinsOrganization = membership?.status !== OrganizationMemberStatus.ACTIVE
      if (joinsOrganization) await assertOrgCapacity(organizationId, 'members', 1)

      const updated = await prisma.$transaction(async (tx) => {
        if (!membership) {
          await tx.organizationMember.create({
            data: {
              organizationId,
              userId: application.userId,
              role: OrganizationRole.MEMBER,
              status: OrganizationMemberStatus.ACTIVE,
              joinedAt: new Date(),
            },
          })
        } else if (joinsOrganization) {
          await tx.organizationMember.update({
            where: { id: membership.id },
            data: { status: OrganizationMemberStatus.ACTIVE, role: OrganizationRole.MEMBER, joinedAt: new Date() },
          })
        }
        await tx.programParticipant.upsert({
          where: { programId_userId: { programId: access.program.id, userId: application.userId } },
          create: { programId: access.program.id, userId: application.userId, addedById: authUser.id },
          update: {},
        })
        return tx.programApplication.update({
          where: { id: application.id },
          data: { status: ProgramApplicationStatus.ACCEPTED, reviewNote: input.note ?? null, reviewedById: authUser.id, reviewedAt: new Date() },
          include: applicationInclude,
        })
      })

      await audit(req, res, {
        action: 'program.application_accept',
        organizationId,
        targetType: 'program',
        targetId: access.program.id,
        metadata: { applicationId: application.id, userId: application.userId, joinedOrganization: joinsOrganization },
      })
      await notifyUsers(
        [application.userId],
        authUser.id,
        '프로그램에 선발되었습니다',
        `${access.organization.name} · ${access.program.title}`,
        `/org/${organizationId}/programs/${access.program.id}`,
      )
      res.status(200).json({ application: serializeApplication(updated) })
    } catch (error) {
      next(error)
    }
  })
}
