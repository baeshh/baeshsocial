import {
  EvidenceStatus,
  ProgramStatus,
  ProjectActivityType,
  ProjectVerificationStatus,
  VerifiedRecordKind,
  VerifiedRecordStatus,
  type Prisma,
} from '@prisma/client'
import type { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { notifyUsers } from '../../services/programs/programProjects.js'
import { captureProgramProjectRecord } from '../../services/records/programProjectRecords.js'
import {
  ContributionError,
  hashSnapshot,
  issueContributionRecord,
  readContributionSnapshot,
  revokeRecordById,
  trustedRecordWhere,
  type ProjectVerificationSnapshot,
} from '../../services/verification/verifiedRecords.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { requireProgramAccess } from '../../utils/programAccess.js'
import { resolveUserProjectPermissions } from '../../utils/projectPermissions.js'
import { revokeVerificationSchema, verifyMembersSchema, verifyProjectSchema } from '../../validators/program.validator.js'
import { teamRoleOf, userBriefSelect } from './program.serializers.js'

type MemberInput = { userId: string; role: string; contribution: string; startDate?: Date | null; endDate?: Date | null }

async function loadContext(programId: string, projectId: string, userId: string) {
  const access = await requireProgramAccess(programId, userId)
  const project = await prisma.project.findFirst({
    where: { id: projectId, programId: access.program.id },
    select: {
      id: true,
      title: true,
      teamName: true,
      startDate: true,
      endDate: true,
      members: {
        orderBy: { joinedAt: 'asc' },
        select: { userId: true, role: true, joinedAt: true, projectRole: { select: { slug: true } }, user: { select: userBriefSelect } },
      },
    },
  })
  if (!project) throw new HttpError(404, '이 프로그램에 속한 프로젝트를 찾을 수 없습니다.')
  const resolved = await resolveUserProjectPermissions(project.id, userId)
  const isTeamMember = project.members.some((m) => m.userId === userId) && resolved.permissions.includes('project.view')
  if (!access.isStaff && !isTeamMember) throw new HttpError(404, '이 프로그램에 속한 프로젝트를 찾을 수 없습니다.')
  return { access, project, isTeamMember }
}

function assertCanVerify(context: Awaited<ReturnType<typeof loadContext>>, actorId: string) {
  if (!context.access.isStaff) throw new HttpError(403, '프로그램 담당자만 성과를 인증할 수 있습니다.')
  if (context.project.members.some((m) => m.userId === actorId)) {
    throw new HttpError(403, '본인이 참여한 프로젝트는 인증할 수 없습니다.')
  }
  if (context.access.program.status === ProgramStatus.ARCHIVED) {
    throw new HttpError(409, '보관된 프로그램의 프로젝트는 인증할 수 없습니다.')
  }
}

function assertMembersOnTeam(context: Awaited<ReturnType<typeof loadContext>>, members: MemberInput[]) {
  const onTeam = new Set(context.project.members.map((m) => m.userId))
  const unique = new Set<string>()
  for (const member of members) {
    if (!onTeam.has(member.userId)) throw new HttpError(400, '현재 팀원만 인증할 수 있습니다.')
    if (unique.has(member.userId)) throw new HttpError(400, '같은 팀원이 중복으로 포함되어 있습니다.')
    unique.add(member.userId)
  }
}

async function issueMembers(
  tx: Prisma.TransactionClient,
  verificationId: string,
  members: MemberInput[],
  approverId: string,
  approvedAt: Date,
) {
  try {
    for (const member of members) {
      await issueContributionRecord(tx, {
        projectVerificationId: verificationId,
        userId: member.userId,
        role: member.role,
        contribution: member.contribution,
        startDate: member.startDate ?? null,
        endDate: member.endDate ?? null,
        approverId,
        approvedAt,
      })
    }
  } catch (error) {
    if (error instanceof ContributionError) throw new HttpError(400, error.message)
    throw error
  }
}

export function registerProjectVerificationRoutes(router: Router) {
  router.get('/:programId/projects/:projectId/verification', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const { access, project } = await loadContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      const [verifications, approvedByAuthor] = await Promise.all([
        prisma.projectVerification.findMany({
          where: { projectId: project.id },
          orderBy: { verifiedAt: 'desc' },
          include: {
            verifiedBy: { select: { id: true, name: true } },
            revokedBy: { select: { id: true, name: true } },
            program: { select: { id: true, title: true } },
            records: {
              where: { kind: VerifiedRecordKind.CONTRIBUTION },
              select: {
                id: true,
                userId: true,
                role: true,
                status: true,
                snapshot: true,
                revokeReason: true,
                revokedAt: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        }),
        prisma.projectEvidence.groupBy({
          by: ['authorId'],
          where: { projectId: project.id, status: EvidenceStatus.APPROVED, verifiedRecord: { is: trustedRecordWhere } },
          _count: { _all: true },
        }),
      ])
      const approvedCount = new Map(approvedByAuthor.map((row) => [row.authorId, row._count._all]))
      const live = verifications.find((row) => row.status === ProjectVerificationStatus.VERIFIED) ?? null
      const verifiedUserIds = new Set(
        live?.records.filter((r) => r.status === VerifiedRecordStatus.VERIFIED).map((r) => r.userId) ?? [],
      )

      res.status(200).json({
        current: live ? live.id : null,
        verifications: verifications.map((row) => ({
          id: row.id,
          status: row.status.toLowerCase(),
          outcomeSummary: row.outcomeSummary,
          program: row.program,
          verifiedBy: row.verifiedBy,
          verifiedAt: row.verifiedAt,
          revokedBy: row.revokedBy,
          revokedAt: row.revokedAt,
          revokeReason: row.revokeReason,
          members: row.records.map((record) => {
            const snapshot = readContributionSnapshot(record.snapshot)
            return {
              recordId: record.id,
              user: record.user,
              role: record.role,
              status: record.status.toLowerCase(),
              contribution: snapshot?.contribution ?? null,
              period: snapshot?.period ?? null,
              evidenceCount: snapshot?.approvedEvidence.length ?? 0,
              revokeReason: record.revokeReason,
              revokedAt: record.revokedAt,
            }
          }),
        })),
        candidates: project.members.map((member) => ({
          ...member.user,
          userId: member.userId,
          role: member.role,
          teamRole: teamRoleOf(member.projectRole?.slug),
          joinedAt: member.joinedAt,
          approvedEvidence: approvedCount.get(member.userId) ?? 0,
          verified: verifiedUserIds.has(member.userId),
        })),
        approvedEvidenceTotal: [...approvedCount.values()].reduce((sum, n) => sum + n, 0),
        canVerify: access.isStaff && !project.members.some((m) => m.userId === authUser.id) && access.program.status !== ProgramStatus.ARCHIVED,
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Signs off the project outcome and issues each listed member's role/contribution record.
   * Registration approval alone never gets here: the project needs approved evidence, and every
   * member being verified needs approved evidence of their own.
   */
  router.post('/:programId/projects/:projectId/verification', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const context = await loadContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      assertCanVerify(context, authUser.id)
      const input = verifyProjectSchema.parse(req.body)
      assertMembersOnTeam(context, input.members)
      const { access, project } = context

      const approvedEvidenceCount = await prisma.projectEvidence.count({
        where: { projectId: project.id, status: EvidenceStatus.APPROVED, verifiedRecord: { is: trustedRecordWhere } },
      })
      if (approvedEvidenceCount === 0) {
        throw new HttpError(400, '승인된 활동 증빙이 없는 프로젝트는 성과를 인증할 수 없습니다. 등록 승인과 성과 인증은 별개입니다.')
      }

      const approver = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id }, select: { id: true, name: true } })
      const approvedAt = new Date()
      const memberNames = new Map(project.members.map((m) => [m.userId, m.user.name]))
      const snapshot: ProjectVerificationSnapshot = {
        v: 1,
        project: {
          id: project.id,
          title: project.title,
          teamName: project.teamName,
          startDate: project.startDate?.toISOString() ?? null,
          endDate: project.endDate?.toISOString() ?? null,
        },
        program: { id: access.program.id, title: access.program.title, term: access.program.term },
        organization: { id: access.organization.id, name: access.organization.name },
        outcomeSummary: input.outcomeSummary,
        approvedEvidenceCount,
        members: input.members.map((m) => ({ id: m.userId, name: memberNames.get(m.userId) ?? '', role: m.role })),
        approvedBy: approver,
        approvedAt: approvedAt.toISOString(),
      }

      const verification = await prisma.$transaction(async (tx) => {
        const created = await tx.projectVerification
          .create({
            data: {
              projectId: project.id,
              programId: access.program.id,
              organizationId: access.organization.id,
              outcomeSummary: input.outcomeSummary,
              verifiedById: authUser.id,
              verifiedAt: approvedAt,
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              contentHash: hashSnapshot(snapshot),
            },
          })
          .catch((error: { code?: string }) => {
            if (error.code === 'P2002') throw new HttpError(409, '이미 인증된 프로젝트입니다. 팀원 추가 인증을 이용해 주세요.')
            throw error
          })
        await issueMembers(tx, created.id, input.members, authUser.id, approvedAt)
        await tx.projectActivity.create({
          data: {
            projectId: project.id,
            userId: authUser.id,
            type: ProjectActivityType.MILESTONE,
            title: 'Project verified',
            description: `${access.organization.name}이(가) 프로젝트 성과와 팀원 ${input.members.length}명의 기여를 공식 인증했습니다.`,
          },
        })
        await captureProgramProjectRecord(tx, { programId: access.program.id, projectId: project.id, trigger: 'project.verified', actorId: authUser.id })
        return created
      })

      await audit(req, res, {
        action: 'project.verify',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: project.id,
        metadata: { programId: access.program.id, verificationId: verification.id, members: input.members.map((m) => m.userId) },
      })
      await notifyUsers(
        input.members.map((m) => m.userId),
        authUser.id,
        '프로젝트 성과가 기관 공식 인증되었습니다',
        `${access.organization.name} · ${project.title} — 프로필에 인증 기록이 추가되었습니다.`,
        `/projects/${project.id}?tab=reviews`,
      )
      res.status(201).json({ verificationId: verification.id })
    } catch (error) {
      next(error)
    }
  })

  router.post('/:programId/projects/:projectId/verify-members', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const context = await loadContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      assertCanVerify(context, authUser.id)
      const input = verifyMembersSchema.parse(req.body)
      assertMembersOnTeam(context, input.members)
      const { access, project } = context

      const live = await prisma.projectVerification.findFirst({
        where: { projectId: project.id, status: ProjectVerificationStatus.VERIFIED },
        select: { id: true, programId: true, records: { where: { status: VerifiedRecordStatus.VERIFIED }, select: { userId: true } } },
      })
      if (!live) throw new HttpError(409, '먼저 프로젝트 성과를 인증해 주세요.')
      const already = new Set(live.records.map((r) => r.userId))
      if (input.members.some((m) => already.has(m.userId))) {
        throw new HttpError(409, '이미 인증된 팀원이 포함되어 있습니다. 수정하려면 해당 팀원의 인증을 취소한 뒤 다시 인증해 주세요.')
      }

      await prisma.$transaction(async (tx) => {
        // (projectVerificationId, userId) is unique, so a revoked record steps aside for its replacement.
        await tx.verifiedRecord.updateMany({
          where: {
            projectVerificationId: live.id,
            userId: { in: input.members.map((m) => m.userId) },
            status: VerifiedRecordStatus.REVOKED,
          },
          data: { projectVerificationId: null },
        })
        await issueMembers(tx, live.id, input.members, authUser.id, new Date())
        await captureProgramProjectRecord(tx, { programId: live.programId, projectId: project.id, trigger: 'members.verified', actorId: authUser.id })
      })

      await audit(req, res, {
        action: 'project.verify_members',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: project.id,
        metadata: { programId: access.program.id, verificationId: live.id, members: input.members.map((m) => m.userId) },
      })
      await notifyUsers(
        input.members.map((m) => m.userId),
        authUser.id,
        '프로젝트 기여가 기관 공식 인증되었습니다',
        `${access.organization.name} · ${project.title}`,
        `/projects/${project.id}?tab=reviews`,
      )
      res.status(201).json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  /** Revokes one member's contribution record, or the whole project verification with all its records. */
  router.post('/:programId/projects/:projectId/revoke-verification', authenticate, async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload
      const context = await loadContext(String(req.params.programId), String(req.params.projectId), authUser.id)
      if (!context.access.isStaff) throw new HttpError(403, '프로그램 담당자만 인증을 취소할 수 있습니다.')
      const { reason, userId } = revokeVerificationSchema.parse(req.body)
      const { access, project } = context

      const live = await prisma.projectVerification.findFirst({
        where: { projectId: project.id, status: ProjectVerificationStatus.VERIFIED },
        select: {
          id: true,
          programId: true,
          records: { where: { status: VerifiedRecordStatus.VERIFIED }, select: { id: true, userId: true } },
        },
      })
      if (!live) throw new HttpError(409, '인증된 상태가 아닙니다.')
      const targets = userId ? live.records.filter((r) => r.userId === userId) : live.records
      if (userId && targets.length === 0) throw new HttpError(404, '이 팀원의 인증 기록이 없습니다.')

      await prisma.$transaction(async (tx) => {
        for (const record of targets) await revokeRecordById(tx, { recordId: record.id, actorId: authUser.id, reason })
        if (!userId) {
          await tx.projectVerification.update({
            where: { id: live.id },
            data: { status: ProjectVerificationStatus.REVOKED, revokedAt: new Date(), revokedById: authUser.id, revokeReason: reason },
          })
        }
        await tx.projectActivity.create({
          data: {
            projectId: project.id,
            userId: authUser.id,
            type: ProjectActivityType.UPDATE,
            title: userId ? 'Member verification revoked' : 'Project verification revoked',
            description: `${userId ? '팀원 기여 인증' : '프로젝트 성과 인증'}이 취소되었습니다. 사유: ${reason}`,
          },
        })
        await captureProgramProjectRecord(tx, {
          programId: live.programId,
          projectId: project.id,
          trigger: userId ? 'member_verification.revoked' : 'verification.revoked',
          actorId: authUser.id,
          reason,
        })
      })

      await audit(req, res, {
        action: userId ? 'project.revoke_member_verification' : 'project.revoke_verification',
        organizationId: access.organization.id,
        targetType: 'project',
        targetId: project.id,
        metadata: { programId: access.program.id, verificationId: live.id, userId: userId ?? null, reason },
      })
      await notifyUsers(
        targets.map((r) => r.userId),
        authUser.id,
        '프로젝트 인증이 취소되었습니다',
        `${access.organization.name} · ${project.title} — 사유: ${reason}`,
        `/projects/${project.id}?tab=reviews`,
      )
      res.status(200).json({ ok: true, revoked: targets.length })
    } catch (error) {
      next(error)
    }
  })
}
