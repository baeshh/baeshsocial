import {
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
  ProjectVisibility,
  UserRole,
} from '@prisma/client'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { app } from '../src/app.js'
import { prisma } from '../src/config/prisma.js'
import { resetRateLimits } from '../src/middlewares/rateLimit.js'
import { ensureTrialSubscription } from '../src/services/billing/subscriptions.js'

export { prisma }
export const api = () => request(app)
export const PASSWORD = 'password123'
const HASH = bcrypt.hashSync(PASSWORD, 4)

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/** Empties every application table. Migration history and the plan catalog (seeded once per process) are kept. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'Plan')`
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  }
  resetRateLimits()
}

let counter = 0
export async function createUser(options: { email?: string; name?: string; role?: UserRole } = {}) {
  counter += 1
  return prisma.user.create({
    data: {
      email: options.email ?? `user${counter}-${Date.now()}@test.baesh.dev`,
      name: options.name ?? `테스트${counter}`,
      password: HASH,
      role: options.role ?? UserRole.USER,
    },
  })
}

export async function login(email: string, password = PASSWORD) {
  const response = await api().post('/api/auth/login').send({ email, password })
  if (response.status !== 200) throw new Error(`login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`)
  return response.body.token as string
}

export async function createUserWithToken(options: Parameters<typeof createUser>[0] = {}) {
  const user = await createUser(options)
  return { user, token: await login(user.email) }
}

export async function createOrg(
  ownerId: string,
  options: { name?: string; type?: OrganizationType; approved?: boolean; trial?: boolean } = {},
) {
  const approved = options.approved ?? true
  const organization = await prisma.organization.create({
    data: {
      name: options.name ?? `테스트기관-${Date.now()}`,
      type: options.type ?? OrganizationType.UNIVERSITY,
      contactEmail: 'contact@test.baesh.dev',
      registrationNumber: '123-45-67890',
      verificationStatus: approved ? OrganizationVerificationStatus.APPROVED : OrganizationVerificationStatus.PENDING,
      verifiedAt: approved ? new Date() : null,
      createdById: ownerId,
      members: { create: { userId: ownerId, role: OrganizationRole.OWNER, status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() } },
    },
  })
  if (approved && options.trial !== false) await ensureTrialSubscription(organization.id)
  return organization
}

export async function addMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole = OrganizationRole.MEMBER,
  status: OrganizationMemberStatus = OrganizationMemberStatus.ACTIVE,
) {
  return prisma.organizationMember.create({ data: { organizationId, userId, role, status, joinedAt: new Date() } })
}

export async function createProgram(organizationId: string, options: { managerIds?: string[]; participantIds?: string[]; title?: string } = {}) {
  return prisma.program.create({
    data: {
      organizationId,
      title: options.title ?? '테스트 프로그램',
      managers: { create: (options.managerIds ?? []).map((userId) => ({ userId })) },
      participants: { create: (options.participantIds ?? []).map((userId) => ({ userId })) },
    },
  })
}

export async function createProgramProject(programId: string, ownerId: string, memberIds: string[] = []) {
  counter += 1
  return prisma.project.create({
    data: {
      title: `팀 프로젝트 ${counter}`,
      slug: `test-project-${counter}-${Date.now()}`,
      ownerId,
      programId,
      visibility: ProjectVisibility.TEAM,
      members: { create: memberIds.map((userId) => ({ userId, role: 'member' })) },
    },
  })
}
