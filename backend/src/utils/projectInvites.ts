import { ProjectInviteStatus } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { requireProjectPermission } from './projectPermissions.js'

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const

export function projectInviteLink(inviteId: string) {
  return `/project-invites/${inviteId}`
}

export async function createProjectInviteNotification(params: {
  inviteId: string
  inviteeId: string
  inviterId: string
  projectTitle: string
}) {
  const inviter = await prisma.user.findUnique({
    where: { id: params.inviterId },
    select: { name: true },
  })

  if (!inviter) {
    return
  }

  await prisma.notification.create({
    data: {
      userId: params.inviteeId,
      actorId: params.inviterId,
      title: '프로젝트 초대',
      body: `${inviter.name}님이 「${params.projectTitle}」 프로젝트에 초대했습니다.`,
      type: 'PROJECT_INVITE',
      link: projectInviteLink(params.inviteId),
    },
  })
}

export async function acceptProjectInvite(inviteId: string, userId: string) {
  const invite = await prisma.projectInvite.findUnique({
    where: { id: inviteId },
    include: { project: { select: { title: true, ownerId: true } } },
  })

  if (!invite) {
    throw new Error('INVITE_NOT_FOUND')
  }

  if (invite.inviteeId !== userId) {
    throw new Error('INVITE_FORBIDDEN')
  }

  if (invite.status !== ProjectInviteStatus.PENDING) {
    throw new Error('INVITE_NOT_PENDING')
  }

  if (invite.project.ownerId === userId) {
    throw new Error('INVITE_INVALID')
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.projectMember.upsert({
      where: {
        projectId_userId: { projectId: invite.projectId, userId },
      },
      create: {
        projectId: invite.projectId,
        userId,
        roleId: invite.roleId,
        role: invite.role,
        contribution: invite.contribution,
      },
      update: {
        roleId: invite.roleId,
        role: invite.role,
        contribution: invite.contribution,
      },
      include: {
        user: { select: userPublicSelect },
      },
    })

    await tx.projectInvite.update({
      where: { id: inviteId },
      data: {
        status: ProjectInviteStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    })

    await tx.notification.updateMany({
      where: {
        userId,
        link: projectInviteLink(inviteId),
        read: false,
      },
      data: { read: true },
    })

    return created
  })

  return { member, projectId: invite.projectId }
}

export async function declineProjectInvite(inviteId: string, userId: string) {
  const invite = await prisma.projectInvite.findUnique({ where: { id: inviteId } })

  if (!invite) {
    throw new Error('INVITE_NOT_FOUND')
  }

  if (invite.inviteeId !== userId) {
    throw new Error('INVITE_FORBIDDEN')
  }

  if (invite.status !== ProjectInviteStatus.PENDING) {
    throw new Error('INVITE_NOT_PENDING')
  }

  await prisma.$transaction([
    prisma.projectInvite.update({
      where: { id: inviteId },
      data: {
        status: ProjectInviteStatus.DECLINED,
        respondedAt: new Date(),
      },
    }),
    prisma.notification.updateMany({
      where: {
        userId,
        link: projectInviteLink(inviteId),
        read: false,
      },
      data: { read: true },
    }),
  ])
}

export async function getProjectTeamCandidates(projectId: string, userId: string) {
  await requireProjectPermission(projectId, userId, 'members.invite')

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: { select: { userId: true } },
      invites: {
        where: { status: ProjectInviteStatus.PENDING },
        select: { inviteeId: true },
      },
    },
  })

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND')
  }

  const excluded = new Set<string>([
    project.ownerId,
    ...project.members.map((member) => member.userId),
    ...project.invites.map((invite) => invite.inviteeId),
  ])

  const [followingRows, followerRows] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: userId },
      include: { following: { select: userPublicSelect } },
    }),
    prisma.userFollow.findMany({
      where: { followingId: userId },
      include: { follower: { select: userPublicSelect } },
    }),
  ])

  const followingIds = new Set(followingRows.map((row) => row.followingId))
  const followerIds = new Set(followerRows.map((row) => row.followerId))

  type Candidate = {
    id: string
    name: string
    email: string
    avatarUrl: string | null
    relation: 'following' | 'follower' | 'mutual'
  }

  const map = new Map<string, Candidate>()

  for (const row of followingRows) {
    if (excluded.has(row.following.id)) {
      continue
    }
    const isMutual = followerIds.has(row.following.id)
    map.set(row.following.id, {
      ...row.following,
      relation: isMutual ? 'mutual' : 'following',
    })
  }

  for (const row of followerRows) {
    if (excluded.has(row.follower.id)) {
      continue
    }
    if (map.has(row.follower.id)) {
      continue
    }
    map.set(row.follower.id, {
      ...row.follower,
      relation: followingIds.has(row.follower.id) ? 'mutual' : 'follower',
    })
  }

  const following = [...map.values()].filter((user) => user.relation === 'following')
  const followers = [...map.values()].filter((user) => user.relation === 'follower')
  const mutual = [...map.values()].filter((user) => user.relation === 'mutual')

  return { following, followers, mutual }
}
