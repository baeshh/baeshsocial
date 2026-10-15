import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'

/**
 * A project can be hidden by anyone it can appear for on a profile: the owner of a personal project, a team
 * member, or someone holding a verified record of it (who may have left the team since).
 */
export async function canSetProfileDisplay(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId, programId: null }, { members: { some: { userId } } }, { verifiedRecords: { some: { userId } } }],
    },
    select: { id: true },
  })
  return Boolean(project)
}

export async function isHiddenFromProfile(userId: string, projectId: string) {
  const row = await prisma.projectDisplayPreference.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { id: true } })
  return Boolean(row)
}

/** Only changes how the project appears on this user's own profile; idempotent in both directions. */
export async function setHiddenFromProfile(userId: string, projectId: string, hidden: boolean) {
  if (!(await canSetProfileDisplay(userId, projectId))) throw new HttpError(404, 'Project not found')
  if (hidden) {
    await prisma.projectDisplayPreference.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId },
      update: {},
    })
  } else {
    await prisma.projectDisplayPreference.deleteMany({ where: { userId, projectId } })
  }
  return { hidden }
}

/** Hidden project ids per user, for queries that load many users at once (talent search). */
export async function hiddenProjectsByUser(userIds: string[]) {
  const rows = userIds.length
    ? await prisma.projectDisplayPreference.findMany({ where: { userId: { in: userIds } }, select: { userId: true, projectId: true } })
    : []
  const byUser = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = byUser.get(row.userId) ?? new Set<string>()
    set.add(row.projectId)
    byUser.set(row.userId, set)
  }
  return byUser
}
