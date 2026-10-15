/**
 * Fixture for the Playwright suite (frontend/e2e). Recreates a small, known world on every run:
 *
 *   operator  — owner of an approved university and manager of an approved company (workspace switching)
 *   applicant — personal account that applies, gets an offer and confirms it
 *   outsider  — no membership anywhere (permission checks)
 *   member    — plain MEMBER of the university: may browse, may not create or edit programs
 *
 * Every account uses the @e2e.baesh.dev domain. The script refuses to run unless the database name contains
 * "e2e" or "test", so it can never touch development, staging or production data.
 */
import bcrypt from 'bcryptjs'
import { OrganizationMemberStatus, OrganizationRole, OrganizationType, OrganizationVerificationStatus, UserRole } from '@prisma/client'
import { prisma } from '../src/config/prisma.js'
import { env } from '../src/config/env.js'
import { ensureTrialSubscription } from '../src/services/billing/subscriptions.js'

export const E2E_DOMAIN = '@e2e.baesh.dev'
export const E2E_UNIVERSITY = 'E2E 대학교'
export const E2E_COMPANY = 'E2E 테크'
export const E2E_MOVE_TARGET = 'E2E 이동 대상 프로그램'

const databaseName = new URL(env.DATABASE_URL).pathname.slice(1)
if (env.NODE_ENV === 'production' || env.APP_ENV !== 'local' || !/e2e|test/i.test(databaseName)) {
  console.error(`Refusing to seed E2E fixtures into "${databaseName}" (needs a local database whose name contains e2e or test).`)
  process.exit(1)
}

async function clean() {
  await prisma.organization.deleteMany({ where: { name: { in: [E2E_UNIVERSITY, E2E_COMPANY] } } })
  const users = await prisma.user.findMany({ where: { email: { endsWith: E2E_DOMAIN } }, select: { id: true } })
  const ids = users.map((user) => user.id)
  await prisma.project.deleteMany({ where: { ownerId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

async function main() {
  await clean()
  const password = await bcrypt.hash(process.env.E2E_PASSWORD || 'password123', 6)
  const user = (local: string, name: string, role: UserRole = UserRole.USER) =>
    prisma.user.create({ data: { email: `${local}${E2E_DOMAIN}`, name, password, role }, select: { id: true } })

  const operator = await user('operator', '이운영', UserRole.INSTITUTION)
  await user('applicant', '박지원')
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
  console.log(`E2E fixtures ready in ${databaseName}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
