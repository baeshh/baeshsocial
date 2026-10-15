/**
 * Fixture for the Playwright suite (frontend/e2e). Recreates a small, known world on every run:
 *
 *   operator  — owner of an approved university and manager of an approved company (workspace switching)
 *   applicant — personal account that applies, gets an offer and confirms it
 *   outsider  — no membership anywhere (permission checks)
 *   member    — plain MEMBER of the university: may browse, may not create or edit programs
 *
 * Jobs: one open public program of the university (status DRAFT, so it takes no trial program slot) and three
 * posted opportunities by the operator — an internship with an external link, an education programme taken
 * inside BAESH and a closed job. The applicant's profile lists React, which the internship asks for.
 *
 * Every account uses the @e2e.baesh.dev domain. The script refuses to run unless the database name contains
 * "e2e" or "test", so it can never touch development, staging or production data.
 */
import bcrypt from 'bcryptjs'
import {
  ApplicationFieldType,
  OpportunityType,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
  ProgramAudience,
  ProgramCategory,
  ProgramDeliveryMode,
  ProgramRecruitmentMode,
  ProgramStatus,
  ProgramVisibility,
  UserRole,
} from '@prisma/client'
import { prisma } from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { ensureTrialSubscription } from '../src/services/billing/subscriptions.js'

export const E2E_DOMAIN = '@e2e.baesh.dev'
export const E2E_UNIVERSITY = 'E2E 대학교'
export const E2E_COMPANY = 'E2E 테크'
export const E2E_MOVE_TARGET = 'E2E 이동 대상 프로그램'
export const E2E_JOBS_PROGRAM = 'E2E 공개 모집 프로그램'

const DAY = 86_400_000
const dateOnly = (days: number) => new Date(`${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T00:00:00.000Z`)

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1)
if (env.NODE_ENV === 'production' || env.APP_ENV !== 'local' || !/e2e|test/i.test(databaseName)) {
  console.error(`Refusing to seed E2E fixtures into "${databaseName}" (needs a local database whose name contains e2e or test).`)
  process.exit(1)
}

async function clean() {
  await prisma.organization.deleteMany({ where: { name: { in: [E2E_UNIVERSITY, E2E_COMPANY] } } })
  const users = await prisma.user.findMany({ where: { email: { endsWith: E2E_DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  await prisma.opportunity.deleteMany({ where: { createdBy: { in: ids } } })
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

async function main() {
  await clean()
  const password = await bcrypt.hash(process.env.E2E_PASSWORD || 'password123', 6)
  const user = (local: string, name: string, role: UserRole = UserRole.USER) =>
    prisma.user.create({ data: { email: `${local}${E2E_DOMAIN}`, name, password, role }, select: { id: true } })

  const operator = await user('operator', '이운영', UserRole.INSTITUTION)
  const applicant = await user('applicant', '박지원')
  await prisma.profile.create({ data: { userId: applicant.id, skills: ['React'] } })
  await user('outsider', '최외부')
  const member = await user('member', '김구성')

  const joined = { status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() }
  const university = await prisma.organization.create({
    data: {
      name: E2E_UNIVERSITY,
      type: OrganizationType.UNIVERSITY,
      verificationStatus: OrganizationVerificationStatus.APPROVED,
      verifiedAt: new Date(),
      createdById: operator.id,
      members: {
        create: [
          { userId: operator.id, role: OrganizationRole.OWNER, ...joined },
          { userId: member.id, role: OrganizationRole.MEMBER, ...joined },
        ],
      },
    },
  })
  const company = await prisma.organization.create({
    data: {
      name: E2E_COMPANY,
      type: OrganizationType.COMPANY,
      verificationStatus: OrganizationVerificationStatus.APPROVED,
      verifiedAt: new Date(),
      createdById: operator.id,
      members: { create: [{ userId: operator.id, role: OrganizationRole.MANAGER, ...joined }] },
    },
  })
  await ensureTrialSubscription(university.id)
  await ensureTrialSubscription(company.id)

  await prisma.program.create({
    data: {
      organizationId: university.id,
      title: E2E_MOVE_TARGET,
      createdById: operator.id,
      managers: { create: [{ userId: operator.id }] },
    },
  })
  await prisma.program.create({
    data: {
      organizationId: university.id,
      title: E2E_JOBS_PROGRAM,
      description: 'Jobs 화면에서 찾아 지원하는 E2E용 공개 프로그램입니다.',
      status: ProgramStatus.DRAFT,
      visibility: ProgramVisibility.PUBLIC,
      recruitmentMode: ProgramRecruitmentMode.OPEN,
      publishedAt: new Date(),
      applyEndAt: new Date(Date.now() + 14 * DAY),
      category: ProgramCategory.EDUCATION,
      deliveryMode: ProgramDeliveryMode.ONLINE,
      audiences: [ProgramAudience.UNDERGRADUATE],
      capacity: 20,
      createdById: operator.id,
      managers: { create: [{ userId: operator.id }] },
      applicationFields: { create: [{ position: 0, type: ApplicationFieldType.LONG_TEXT, label: '지원 동기', required: true }] },
    },
  })
  const posting = { createdBy: operator.id }
  await prisma.opportunity.createMany({
    data: [
      {
        ...posting,
        title: 'E2E 프론트엔드 인턴십',
        type: OpportunityType.INTERNSHIP,
        organization: 'E2E 테크',
        description: 'React와 TypeScript로 사내 서비스를 함께 만드는 인턴십입니다.',
        skills: ['React', 'TypeScript'],
        location: '서울',
        deadline: dateOnly(20),
        applyUrl: 'https://example.com/apply/frontend-intern',
      },
      {
        ...posting,
        title: 'E2E 데이터 분석 교육',
        type: OpportunityType.EDUCATION,
        organization: 'E2E 대학교',
        description: 'Python으로 데이터를 다루는 6주 교육 과정입니다. BAESH에서 바로 신청합니다.',
        skills: ['Python'],
        isRemote: true,
        deadline: dateOnly(10),
      },
      {
        ...posting,
        title: 'E2E 마감된 채용',
        type: OpportunityType.JOB,
        organization: 'E2E 테크',
        description: '마감일이 지난 백엔드 개발자 채용 공고입니다.',
        skills: ['Java'],
        location: '판교',
        deadline: dateOnly(-3),
        applyUrl: 'https://example.com/apply/backend',
      },
    ],
  })
  console.log(`E2E fixtures ready in ${databaseName}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
