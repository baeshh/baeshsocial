import { EvidenceStatus, ProgramProjectRegistrationStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'

type Db = PrismaClient | Prisma.TransactionClient

export type DeletionBlockerCode =
  | 'program_project'
  | 'program_history'
  | 'pending_registration'
  | 'project_verification'
  | 'verified_record'
  | 'submitted_evidence'
  | 'program_review'

export type DeletionBlocker = { code: DeletionBlockerCode; count: number; message: string }

export type DeletionImpact = {
  /** Team members other than the owner who lose the project and its shared history. */
  otherMembers: number
  tasks: number
  activities: number
  files: number
  links: number
}

export type DeletionCheck = {
  blockers: DeletionBlocker[]
  impact: DeletionImpact
  /** Organization whose program the project is or was linked to, for the audit trail. */
  organizationId: string | null
}

/**
 * Hard delete cascades to every row hanging off the project, including what an institution recorded about
 * it. Anything an institution owns or signed — program membership, link history, project verifications,
 * verified records and their events, submitted evidence and its review trail, program feedback — makes the
 * project non-deletable for everyone; only a purely personal project may be removed.
 */
export async function projectDeletionCheck(db: Db, projectId: string): Promise<DeletionCheck> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      programId: true,
      program: { select: { organizationId: true } },
      _count: { select: { tasks: true, activities: true, files: true, externalLinks: true } },
    },
  })
  if (!project) throw new HttpError(404, 'Project not found')

  const [registrations, verifications, records, evidence, reviews, otherMembers, lastLink] = await Promise.all([
    db.programProjectRegistration.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } }),
    db.projectVerification.count({ where: { projectId } }),
    db.verifiedRecord.count({ where: { projectId } }),
    db.projectEvidence.count({ where: { projectId, status: { not: EvidenceStatus.DRAFT } } }),
    db.projectReview.count({ where: { projectId } }),
    db.projectMember.count({ where: { projectId, userId: { not: project.ownerId } } }),
    db.programProjectRegistration.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { program: { select: { organizationId: true } } },
    }),
  ])
  const registrationCount = (...statuses: ProgramProjectRegistrationStatus[]) =>
    registrations.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0)

  const candidates: DeletionBlocker[] = [
    {
      code: 'program_project',
      count: project.programId ? 1 : 0,
      message: '기관 프로그램 프로젝트는 삭제할 수 없습니다. 기관의 공식 운영 기록으로 보존됩니다.',
    },
    {
      code: 'program_history',
      count: registrationCount(ProgramProjectRegistrationStatus.APPROVED, ProgramProjectRegistrationStatus.REMOVED),
      message: '기관 프로그램에 연결됐던 이력이 있어 삭제할 수 없습니다. 대신 보관할 수 있습니다.',
    },
    {
      code: 'pending_registration',
      count: registrationCount(ProgramProjectRegistrationStatus.PENDING),
      message: '심사 중인 프로그램 연결 요청이 있습니다. 요청을 먼저 철회해 주세요.',
    },
    { code: 'project_verification', count: verifications, message: '기관이 결과를 검증한 프로젝트는 삭제할 수 없습니다.' },
    { code: 'verified_record', count: records, message: '기관 인증 기록이 발급된 프로젝트는 삭제할 수 없습니다.' },
    { code: 'submitted_evidence', count: evidence, message: '기관에 제출된 활동 증빙이 있어 삭제할 수 없습니다.' },
    { code: 'program_review', count: reviews, message: '기관 담당자의 검토 기록이 있어 삭제할 수 없습니다.' },
  ]

  return {
    blockers: candidates.filter((blocker) => blocker.count > 0),
    impact: {
      otherMembers,
      tasks: project._count.tasks,
      activities: project._count.activities,
      files: project._count.files,
      links: project._count.externalLinks,
    },
    organizationId: project.program?.organizationId ?? lastLink?.program.organizationId ?? null,
  }
}

/**
 * Deletes a personal project after re-checking under a row lock. Every institution record needs the project
 * in a program first, and approving a link or moving a project into a program updates this row, so none of
 * them can slip in between the check and the delete.
 */
export async function deletePersonalProject(projectId: string, options: { confirmTeamImpact: boolean }) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`
    const check = await projectDeletionCheck(tx, projectId)
    if (check.blockers.length > 0) {
      throw new HttpError(409, check.blockers[0].message, { code: 'PROJECT_RETAINED', blockers: check.blockers })
    }
    if (check.impact.otherMembers > 0 && !options.confirmTeamImpact) {
      throw new HttpError(
        409,
        `다른 팀원 ${check.impact.otherMembers}명도 이 프로젝트와 작업·활동 기록을 잃게 됩니다. 확인 후 다시 요청해 주세요.`,
        { code: 'TEAM_IMPACT', impact: check.impact },
      )
    }
    await tx.project.delete({ where: { id: projectId } })
    return check
  })
}
