import { createHash, randomBytes } from 'node:crypto'
import {
  OrganizationInviteStatus,
  OrganizationMemberStatus,
  OrganizationRole,
  type Organization,
  type OrganizationMember,
} from '@prisma/client'
import type { Request, Response } from 'express'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { canManageMember, hasOrgRole, toApiOrgRole } from '../../utils/organizations.js'
import { audit } from '../audit/audit.js'
import { assertOrgCapacity } from '../billing/entitlements.js'
import { sendMail } from '../mail/mail.js'

const DAY = 24 * 60 * 60 * 1000

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
export const inviteUrl = (token: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}/invite/${token}`

export type InviteRowInput = {
  email: string
  name?: string | null
  role?: OrganizationRole
  studentNo?: string | null
  department?: string | null
}

export type InviteRowResult = {
  email: string
  status: 'invited' | 'reinvited' | 'already_member' | 'suspended' | 'invalid'
  inviteId?: string
  inviteUrl?: string
  existingAccount?: boolean
  delivery?: 'sent' | 'logged' | 'failed'
  reason?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function inviteMail(organization: Pick<Organization, 'name'>, programTitle: string | null, url: string) {
  return {
    subject: `[BAESH] ${organization.name} 초대`,
    text: [
      `${organization.name}에서 BAESH로 초대했습니다.${programTitle ? ` (프로그램: ${programTitle})` : ''}`,
      '',
      '아래 링크에서 초대를 수락하면 프로젝트 활동과 증빙을 기록할 수 있습니다.',
      url,
      '',
      `이 링크는 ${env.INVITE_TTL_DAYS}일 동안 유효하며, 초대받은 이메일 주소의 계정으로만 수락할 수 있습니다.`,
    ].join('\n'),
  }
}

/**
 * Creates (or re-issues) invitations in bulk. The inviter can only grant roles below their own,
 * and program invites require that the program belongs to the same organization.
 */
export async function createInvites(params: {
  organization: Organization
  inviter: { id: string; membership: OrganizationMember }
  rows: InviteRowInput[]
  programId?: string | null
  defaultRole?: OrganizationRole
}) {
  const { organization, inviter } = params
  const program = params.programId
    ? await prisma.program.findFirst({ where: { id: params.programId, organizationId: organization.id }, select: { id: true, title: true } })
    : null
  if (params.programId && !program) throw new HttpError(404, '프로그램을 찾을 수 없습니다.')

  const seen = new Set<string>()
  const results: InviteRowResult[] = []
  const valid: (InviteRowInput & { email: string; role: OrganizationRole })[] = []
  for (const row of params.rows) {
    const email = row.email.trim().toLowerCase()
    const role = row.role ?? params.defaultRole ?? OrganizationRole.MEMBER
    if (!EMAIL_RE.test(email)) {
      results.push({ email, status: 'invalid', reason: '이메일 형식이 올바르지 않습니다.' })
      continue
    }
    if (seen.has(email)) {
      results.push({ email, status: 'invalid', reason: '파일 안에서 중복된 이메일입니다.' })
      continue
    }
    seen.add(email)
    if (role === OrganizationRole.OWNER || !canManageMember(inviter.membership.role, role)) {
      results.push({ email, status: 'invalid', reason: `${toApiOrgRole(role)} 역할은 초대할 수 없습니다.` })
      continue
    }
    valid.push({ ...row, email, role })
  }

  const users = await prisma.user.findMany({
    where: { email: { in: valid.map((row) => row.email) } },
    select: {
      id: true,
      email: true,
      organizationMemberships: { where: { organizationId: organization.id }, select: { status: true } },
    },
  })
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]))

  const toInvite: typeof valid = []
  for (const row of valid) {
    const status = userByEmail.get(row.email)?.organizationMemberships[0]?.status
    if (status === OrganizationMemberStatus.ACTIVE && !program) {
      results.push({ email: row.email, status: 'already_member', existingAccount: true })
    } else if (status === OrganizationMemberStatus.SUSPENDED) {
      results.push({ email: row.email, status: 'suspended', existingAccount: true, reason: '이용 정지된 구성원입니다. 먼저 정지를 해제해 주세요.' })
    } else {
      toInvite.push(row)
    }
  }

  const newMembers = toInvite.filter(
    (row) => userByEmail.get(row.email)?.organizationMemberships[0]?.status !== OrganizationMemberStatus.ACTIVE,
  ).length
  if (newMembers > 0) await assertOrgCapacity(organization.id, 'members', newMembers)

  const batchId = randomBytes(6).toString('hex')
  const expiresAt = new Date(Date.now() + env.INVITE_TTL_DAYS * DAY)
  for (const row of toInvite) {
    const token = newToken()
    const existing = await prisma.organizationInvite.findFirst({
      where: { organizationId: organization.id, email: row.email, status: OrganizationInviteStatus.PENDING },
      select: { id: true },
    })
    const data = {
      name: row.name ?? null,
      role: row.role,
      programId: program?.id ?? null,
      studentNo: row.studentNo ?? null,
      department: row.department ?? null,
      tokenHash: hashInviteToken(token),
      batchId,
      invitedById: inviter.id,
      expiresAt,
      lastSentAt: new Date(),
    }
    const invite = existing
      ? await prisma.organizationInvite.update({ where: { id: existing.id }, data: { ...data, sendCount: { increment: 1 } } })
      : await prisma.organizationInvite.create({ data: { ...data, organizationId: organization.id, email: row.email, sendCount: 1 } })

    const url = inviteUrl(token)
    let delivery: InviteRowResult['delivery'] = 'logged'
    try {
      delivery = await sendMail({ to: row.email, ...inviteMail(organization, program?.title ?? null, url) })
    } catch (error) {
      delivery = 'failed'
      console.error('[invite] mail failed', error instanceof Error ? error.message : error)
    }
    const user = userByEmail.get(row.email)
    if (user) {
      await prisma.notification
        .create({
          data: {
            userId: user.id,
            actorId: inviter.id,
            type: 'SYSTEM',
            title: `${organization.name} 초대`,
            body: program ? `${program.title} 프로그램에 초대되었습니다.` : '조직에 초대되었습니다.',
            link: `/invite/${token}`,
          },
        })
        .catch(() => undefined)
    }
    results.push({
      email: row.email,
      status: existing ? 'reinvited' : 'invited',
      inviteId: invite.id,
      inviteUrl: url,
      existingAccount: Boolean(user),
      delivery,
    })
  }

  return { batchId, results, expiresAt }
}

/** Re-issues a fresh link for a pending (or expired) invite. */
export async function resendInvite(organization: Organization, inviteId: string) {
  const invite = await prisma.organizationInvite.findFirst({
    where: {
      id: inviteId,
      organizationId: organization.id,
      status: { in: [OrganizationInviteStatus.PENDING, OrganizationInviteStatus.EXPIRED] },
    },
    include: { program: { select: { title: true } } },
  })
  if (!invite) throw new HttpError(404, '초대를 찾을 수 없습니다.')
  const token = newToken()
  await prisma.organizationInvite.update({
    where: { id: invite.id },
    data: {
      tokenHash: hashInviteToken(token),
      status: OrganizationInviteStatus.PENDING,
      expiresAt: new Date(Date.now() + env.INVITE_TTL_DAYS * DAY),
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
  })
  const url = inviteUrl(token)
  let delivery: InviteRowResult['delivery'] = 'logged'
  try {
    delivery = await sendMail({ to: invite.email, ...inviteMail(organization, invite.program?.title ?? null, url) })
  } catch {
    delivery = 'failed'
  }
  return { inviteUrl: url, delivery }
}

async function findInviteByToken(token: string) {
  const invite = await prisma.organizationInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: {
      organization: { select: { id: true, name: true, type: true, verificationStatus: true } },
      program: { select: { id: true, title: true, organizationId: true } },
      invitedBy: { select: { name: true } },
    },
  })
  if (!invite) throw new HttpError(404, '초대 링크가 올바르지 않거나 이미 다시 발급되었습니다.')
  if (invite.status === OrganizationInviteStatus.PENDING && invite.expiresAt <= new Date()) {
    await prisma.organizationInvite.update({ where: { id: invite.id }, data: { status: OrganizationInviteStatus.EXPIRED } })
    invite.status = OrganizationInviteStatus.EXPIRED
  }
  return invite
}

const maskEmail = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_m, first: string, rest: string, domain: string) => `${first}${'*'.repeat(Math.min(6, rest.length))}${domain}`)

export async function previewInvite(token: string) {
  const invite = await findInviteByToken(token)
  return {
    organization: { id: invite.organization.id, name: invite.organization.name, type: invite.organization.type.toLowerCase() },
    program: invite.program ? { id: invite.program.id, title: invite.program.title } : null,
    role: toApiOrgRole(invite.role),
    email: maskEmail(invite.email),
    invitedBy: invite.invitedBy?.name ?? null,
    status: invite.status.toLowerCase(),
    expiresAt: invite.expiresAt,
  }
}

/**
 * Accepts an invite for the signed-in user. The invite is bound to its email address, so a leaked
 * link cannot be used by a different account.
 */
export async function acceptInviteToken(
  token: string,
  user: { id: string; email: string; name: string },
  req: Request,
  res: Response,
) {
  const invite = await findInviteByToken(token)
  if (invite.status !== OrganizationInviteStatus.PENDING) {
    throw new HttpError(410, invite.status === OrganizationInviteStatus.EXPIRED ? '만료된 초대입니다. 담당자에게 재발송을 요청해 주세요.' : '이미 사용되었거나 취소된 초대입니다.')
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    await audit(req, res, {
      action: 'org.invite_accept',
      outcome: 'denied',
      organizationId: invite.organizationId,
      targetType: 'invite',
      targetId: invite.id,
      metadata: { reason: 'email_mismatch' },
    })
    throw new HttpError(403, `이 초대는 ${maskEmail(invite.email)} 계정으로만 수락할 수 있습니다.`)
  }
  if (invite.organization.verificationStatus !== 'APPROVED') throw new HttpError(409, '아직 인증되지 않은 조직입니다.')

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
  })
  if (membership?.status === OrganizationMemberStatus.SUSPENDED) throw new HttpError(403, '이 조직에서 이용이 정지된 계정입니다.')
  if (membership?.status !== OrganizationMemberStatus.ACTIVE) await assertOrgCapacity(invite.organizationId, 'members', 1)

  const role =
    membership?.status === OrganizationMemberStatus.ACTIVE && hasOrgRole(membership.role, invite.role) ? membership.role : invite.role

  await prisma.$transaction(async (tx) => {
    await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
      create: {
        organizationId: invite.organizationId,
        userId: user.id,
        role,
        status: OrganizationMemberStatus.ACTIVE,
        joinedAt: new Date(),
        title: null,
      },
      update: { role, status: OrganizationMemberStatus.ACTIVE, joinedAt: membership?.joinedAt ?? new Date() },
    })
    if (invite.program) {
      if (hasOrgRole(role, OrganizationRole.MANAGER) && invite.role !== OrganizationRole.MEMBER) {
        await tx.programManager.upsert({
          where: { programId_userId: { programId: invite.program.id, userId: user.id } },
          create: { programId: invite.program.id, userId: user.id },
          update: {},
        })
      } else {
        await tx.programParticipant.upsert({
          where: { programId_userId: { programId: invite.program.id, userId: user.id } },
          create: {
            programId: invite.program.id,
            userId: user.id,
            studentNo: invite.studentNo,
            department: invite.department,
            addedById: invite.invitedById,
          },
          update: {
            ...(invite.studentNo ? { studentNo: invite.studentNo } : {}),
            ...(invite.department ? { department: invite.department } : {}),
          },
        })
      }
    }
    const updated = await tx.organizationInvite.updateMany({
      where: { id: invite.id, status: OrganizationInviteStatus.PENDING },
      data: { status: OrganizationInviteStatus.ACCEPTED, acceptedById: user.id, acceptedAt: new Date() },
    })
    if (updated.count === 0) throw new HttpError(409, '이미 처리된 초대입니다.')
  })

  res.locals.user ??= { id: user.id, email: user.email, name: user.name }
  await audit(req, res, {
    action: 'org.invite_accept',
    organizationId: invite.organizationId,
    targetType: 'invite',
    targetId: invite.id,
    metadata: { role, programId: invite.program?.id ?? null },
  })
  if (invite.invitedById) {
    await prisma.notification
      .create({
        data: {
          userId: invite.invitedById,
          actorId: user.id,
          type: 'SYSTEM',
          title: '초대 수락',
          body: `${user.name}님이 ${invite.organization.name}${invite.program ? ` · ${invite.program.title}` : ''} 초대를 수락했습니다.`,
          link: invite.program ? `/org/${invite.organizationId}/programs/${invite.program.id}` : `/org/${invite.organizationId}?tab=members`,
        },
      })
      .catch(() => undefined)
  }
  return {
    organizationId: invite.organizationId,
    organizationName: invite.organization.name,
    programId: invite.program?.id ?? null,
    role: toApiOrgRole(role),
  }
}
