import {
  EvidenceStatus,
  OrganizationInviteStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  ReportStatus,
} from '@prisma/client'
import { Router } from 'express'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { orgEntitlement } from '../../services/billing/entitlements.js'

export const organizationOnboardingRouter = Router({ mergeParams: true })

const STAFF_ROLES = [OrganizationRole.OWNER, OrganizationRole.ADMIN, OrganizationRole.MANAGER]

/** Launch checklist from org registration to the first verified record and report, computed live. */
organizationOnboardingRouter.get(
  '/',
  authenticate,
  requireOrgAccess({ minRole: OrganizationRole.MANAGER }),
  async (_req, res, next) => {
    try {
      const { organization } = res.locals.orgAccess as OrgAccess
      const orgId = organization.id
      const programScope = { program: { organizationId: orgId } }
      const [entitlement, staff, staffInvites, programs, participants, studentInvites, staffedProjects, submitted, approved, reports] =
        await Promise.all([
          orgEntitlement(orgId),
          prisma.organizationMember.count({ where: { organizationId: orgId, status: OrganizationMemberStatus.ACTIVE, role: { in: STAFF_ROLES } } }),
          prisma.organizationInvite.count({
            where: { organizationId: orgId, status: OrganizationInviteStatus.PENDING, role: { in: STAFF_ROLES } },
          }),
          prisma.program.count({ where: { organizationId: orgId } }),
          prisma.programParticipant.count({ where: programScope }),
          prisma.organizationInvite.count({
            where: { organizationId: orgId, status: OrganizationInviteStatus.PENDING, role: OrganizationRole.MEMBER },
          }),
          prisma.project.count({ where: { ...programScope, members: { some: {} } } }),
          prisma.projectEvidence.count({ where: { project: programScope, status: { not: EvidenceStatus.DRAFT } } }),
          prisma.projectEvidence.count({ where: { project: programScope, status: EvidenceStatus.APPROVED } }),
          prisma.generatedReport.count({ where: { organizationId: orgId, status: ReportStatus.READY } }),
        ])

      const steps = [
        {
          key: 'verified',
          title: '기관 인증 완료',
          description: 'BAESH 운영팀이 기관 서류를 확인하면 관리 기능이 열립니다.',
          done: organization.verificationStatus === OrganizationVerificationStatus.APPROVED,
          tab: 'verification',
        },
        {
          key: 'plan',
          title: '요금제·이용 기간 확인',
          description: '계약 또는 체험 기간이 적용되어 있어야 새 프로그램을 만들 수 있습니다.',
          done: entitlement.canCreate,
          tab: 'billing',
        },
        {
          key: 'staff',
          title: '담당자 초대',
          description: '프로그램을 운영할 교수·담당자를 매니저로 초대합니다.',
          done: staff > 1,
          count: staff,
          pending: staffInvites,
          tab: 'invites',
        },
        { key: 'program', title: '프로그램 생성', description: '학기·사업 단위 프로그램을 만듭니다.', done: programs > 0, count: programs, tab: 'programs' },
        {
          key: 'students',
          title: '학생 일괄 등록',
          description: 'CSV로 학생을 초대하면 수락 즉시 프로그램 참여자로 등록됩니다.',
          done: participants > 0,
          count: participants,
          pending: studentInvites,
          tab: 'invites',
        },
        {
          key: 'projects',
          title: '프로젝트·팀 배정',
          description: '프로그램 안에 팀 프로젝트를 만들고 학생을 배정합니다.',
          done: staffedProjects > 0,
          count: staffedProjects,
          tab: 'programs',
        },
        { key: 'evidence', title: '첫 활동 증빙 제출', description: '학생이 사진·영상·PDF로 활동을 기록합니다.', done: submitted > 0, count: submitted, tab: 'programs' },
        { key: 'approval', title: '첫 증빙 승인', description: '담당자가 승인하면 학생 프로필에 검증 기록이 생깁니다.', done: approved > 0, count: approved, tab: 'programs' },
        { key: 'report', title: '첫 결과보고서 발급', description: '실제 데이터로 계산한 운영 결과보고서를 PDF로 받습니다.', done: reports > 0, count: reports, tab: 'reports' },
      ]
      const completed = steps.filter((step) => step.done).length
      res.status(200).json({ steps, completed, total: steps.length, nextStep: steps.find((step) => !step.done)?.key ?? null })
    } catch (error) {
      next(error)
    }
  },
)
