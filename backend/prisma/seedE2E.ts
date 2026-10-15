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
 * Projects: a team project of the active move-target program led by member (evidence and review), and the
 * applicant's private personal project where member is an editor without private access (restricted view).
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
  ProjectStatus,
  ProjectTaskStatus,
  ProjectVisibility,
  UserRole,
} from '@prisma/client'
import { prisma } from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { ensureTrialSubscription } from '../src/services/billing/subscriptions.js'
import { DEFAULT_PROJECT_ROLE_TEMPLATES } from '../src/utils/projectPermissions.js'

export const E2E_DOMAIN = '@e2e.baesh.dev'
export const E2E_UNIVERSITY = 'E2E 대학교'
export const E2E_COMPANY = 'E2E 테크'
export const E2E_MOVE_TARGET = 'E2E 이동 대상 프로그램'
export const E2E_JOBS_PROGRAM = 'E2E 공개 모집 프로그램'
export const E2E_PROGRAM_PROJECT = 'E2E 증빙 팀 프로젝트'
export const E2E_PRIVATE_PROJECT = 'E2E 비공개 개인 프로젝트'

const DAY = 86_400_000
const dateOnly = (days: number) => new Date(`${new Date(Date.now() + days * DAY).toISOString().slice(0, 10)}T00:00:00.000Z`)

type SeedProject = {
  title: string
  slug: string
  description?: string
  ownerId: string
  programId?: string
  visibility: ProjectVisibility
  status: ProjectStatus
  progress?: number
  members: Array<{ userId: string; role: 'owner' | 'admin' | 'editor' | 'viewer' }>
  tasks?: Array<{ title: string; status: ProjectTaskStatus; dueDate?: Date }>
}

/** Same default roles as a project created through the API. */
async function createProject({ members, tasks = [], ...data }: SeedProject) {
  const project = await prisma.project.create({
    data: {
      ...data,
      roles: { create: DEFAULT_PROJECT_ROLE_TEMPLATES.map(({ name, slug, description, permissions, isSystem, sortOrder }) => ({ name, slug, description, permissions, isSystem, sortOrder })) },
      tasks: { create: tasks },
    },
    select: { id: true, roles: { select: { id: true, slug: true, name: true } } },
  })
  for (const member of members) {
    const role = project.roles.find((item) => item.slug === member.role)!
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.userId, roleId: role.id, role: role.name } })
  }
  return project
}

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

  const moveTarget = await prisma.program.create({
    data: {
      organizationId: university.id,
      title: E2E_MOVE_TARGET,
      createdById: operator.id,
      managers: { create: [{ userId: operator.id }] },
      participants: { create: [{ userId: member.id, addedById: operator.id }] },
    },
  })
  await createProject({
    title: E2E_PROGRAM_PROJECT,
    slug: 'e2e-program-project',
    ownerId: operator.id,
    programId: moveTarget.id,
    visibility: ProjectVisibility.TEAM,
    status: ProjectStatus.ACTIVE,
    members: [{ userId: member.id, role: 'admin' }],
  })
  await createProject({
    title: E2E_PRIVATE_PROJECT,
    slug: 'e2e-private-project',
    description: '팀장이 허용한 팀원만 내용을 볼 수 있는 개인 프로젝트입니다.',
    ownerId: applicant.id,
    visibility: ProjectVisibility.PRIVATE,
    status: ProjectStatus.ACTIVE,
    progress: 40,
    members: [
      { userId: applicant.id, role: 'owner' },
      { userId: member.id, role: 'editor' },
    ],
    tasks: [
      { title: 'E2E 화면 설계 검토', status: ProjectTaskStatus.DONE },
      { title: 'E2E 로그인 API 연결', status: ProjectTaskStatus.IN_PROGRESS, dueDate: dateOnly(3) },
    ],
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
