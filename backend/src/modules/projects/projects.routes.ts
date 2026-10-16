import {
  Prisma,
  ProjectActivityType,
  ProjectStatus,
  ProjectTaskStatus,
  ProjectVisibility,
} from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Router, type RequestHandler, type Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { limits } from '../../middlewares/rateLimit.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import {
  projectActivitySchema,
  projectFileSchema,
  projectFileUploadSchema,
  projectInviteSchema,
  projectLinkSchema,
  projectListQuerySchema,
  projectMemberSchema,
  projectSchema,
  projectTaskSchema,
  updateProjectLinkSchema,
  updateProjectSchema,
  updateProjectTaskSchema,
} from '../../validators/project.validator.js'
import {
  analyzeExternalLink,
  MAX_LINKS_PER_PROJECT,
  projectLinkSelect,
  type ProjectLinkRecord,
  serializeLink,
  sortLinks,
} from '../../utils/externalLinks.js'
import { decodeCursor, keysetAfter, keysetOrder, toPage } from '../../utils/pagination.js'
import {
  acceptProjectInvite,
  createProjectInviteNotification,
  declineProjectInvite,
  getProjectTeamCandidates,
} from '../../utils/projectInvites.js'
import {
  DEFAULT_OWNER_CONTRIBUTION,
  DEFAULT_PROJECT_ROLE_TEMPLATES,
  requireProjectPermission,
  resolveUserProjectPermissions,
} from '../../utils/projectPermissions.js'
import { assertProgramWritable, programStaffWhere } from '../../utils/programAccess.js'
import { getProjectRoleById } from '../../utils/projectRoles.js'
import { HttpError } from '../../utils/httpError.js'
import { audit } from '../../services/audit/audit.js'
import { assertProgramInvitee, isLeaderSlug } from '../../services/programs/programProjects.js'
import { deletePersonalProject, projectDeletionCheck } from '../../services/projects/projectDeletion.js'
import { canSetProfileDisplay, isHiddenFromProfile, setHiddenFromProfile } from '../../services/projects/profileDisplay.js'
import { projectFileSelect, removeStoredObjects, storeProjectFiles } from '../../services/projects/projectFiles.js'
import { UPLOAD_LIMITS } from '../../services/storage/fileValidation.js'
import { opensInline, PROJECT_FILE_LIMITS } from '../../services/storage/projectFileValidation.js'
import { storage } from '../../services/storage/storage.js'
import { refreshCandidateResultsSafely } from '../matching/resultPrivacy.js'
import { registerProjectRoleRoutes } from './projectRoles.routes.js'
import { ProjectInviteStatus } from '@prisma/client'

export const projectsRouter = Router()

registerProjectRoleRoutes(projectsRouter)

const deleteProjectSchema = z.object({
  password: z.string().min(1),
  /** Required once other members are on the team: they lose the project too. */
  confirmTeamImpact: z.boolean().default(false),
})

const projectInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  },
  program: {
    select: {
      id: true,
      title: true,
      status: true,
      allowPublicProjects: true,
      allowStudentTeams: true,
      organization: { select: { id: true, name: true, type: true } },
    },
  },
  roles: {
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      projectId: true,
      name: true,
      slug: true,
      description: true,
      permissions: true,
      isSystem: true,
      sortOrder: true,
    },
  },
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
      projectRole: {
        select: {
          id: true,
          name: true,
          slug: true,
          permissions: true,
        },
      },
    },
    orderBy: {
      joinedAt: 'asc',
    },
  },
  tasks: {
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
  activities: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
  },
  files: {
    select: projectFileSelect,
    orderBy: {
      createdAt: 'desc',
    },
  },
  externalLinks: { select: projectLinkSelect },
} as const

function withSerializedLinks<T extends { externalLinks: ProjectLinkRecord[] }>(project: T) {
  return { ...project, externalLinks: sortLinks(project.externalLinks).map(serializeLink) }
}

const statusMap = {
  planning: ProjectStatus.PLANNING,
  active: ProjectStatus.ACTIVE,
  completed: ProjectStatus.COMPLETED,
  archived: ProjectStatus.ARCHIVED,
}

const visibilityMap = {
  private: ProjectVisibility.PRIVATE,
  team: ProjectVisibility.TEAM,
  public: ProjectVisibility.PUBLIC,
}

const taskStatusMap = {
  todo: ProjectTaskStatus.TODO,
  in_progress: ProjectTaskStatus.IN_PROGRESS,
  done: ProjectTaskStatus.DONE,
  blocked: ProjectTaskStatus.BLOCKED,
}

const activityTypeMap = {
  update: ProjectActivityType.UPDATE,
  task: ProjectActivityType.TASK,
  file: ProjectActivityType.FILE,
  milestone: ProjectActivityType.MILESTONE,
  insight: ProjectActivityType.INSIGHT,
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function createUniqueSlug(title: string) {
  const baseSlug = slugify(title) || 'project'
  let slug = baseSlug
  let index = 1

  while (await prisma.project.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${index}`
    index += 1
  }

  return slug
}

function toOptionalDate(value?: string | null) {
  return value ? new Date(value) : null
}

function buildProjectData(input: ReturnType<typeof projectSchema.parse>) {
  return {
    title: input.title,
    description: input.description,
    objective: input.objective,
    readme: input.readme,
    status: statusMap[input.status],
    progress: input.progress,
    visibility: visibilityMap[input.visibility],
    skills: input.skills,
  }
}

function buildProjectUpdateData(input: ReturnType<typeof updateProjectSchema.parse>) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.objective !== undefined ? { objective: input.objective } : {}),
    ...(input.readme !== undefined ? { readme: input.readme } : {}),
    ...(input.status !== undefined ? { status: statusMap[input.status] } : {}),
    ...(input.progress !== undefined ? { progress: input.progress } : {}),
    ...(input.visibility !== undefined ? { visibility: visibilityMap[input.visibility] } : {}),
    ...(input.skills !== undefined ? { skills: input.skills } : {}),
  }
}

/** PUBLIC program projects are open to every signed-in user only while the program allows public projects. */
const publicProjectWhere: Prisma.ProjectWhereInput = {
  visibility: ProjectVisibility.PUBLIC,
  OR: [{ programId: null }, { program: { allowPublicProjects: true } }],
}

async function findAccessibleProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [
        publicProjectWhere,
        { ownerId: userId, programId: null },
        { members: { some: { userId } } },
        { program: programStaffWhere(userId) },
      ],
    },
    include: projectInclude,
  })
  if (!project) return null

  const access = await resolveUserProjectPermissions(projectId, userId)
  const isPublic =
    project.visibility === ProjectVisibility.PUBLIC && (!project.programId || Boolean(project.program?.allowPublicProjects))
  if (project.programId && !access.permissions.includes('project.view') && !access.restricted && !isPublic) return null

  return project
}

async function assertVisibilityAllowed(projectId: string, visibility: keyof typeof visibilityMap) {
  if (visibility !== 'public') return
  const target = await prisma.project.findUnique({
    where: { id: projectId },
    select: { programId: true, program: { select: { allowPublicProjects: true } } },
  })
  if (target?.programId && !target.program?.allowPublicProjects) {
    throw new HttpError(400, '이 기관 프로그램은 프로젝트 전체 공개를 허용하지 않습니다.')
  }
}

async function requireProjectAccess(projectId: string, userId: string) {
  const project = await findAccessibleProject(projectId, userId)

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND')
  }

  return project
}

function handleProjectError(error: unknown, res: Response) {
  if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
    res.status(404).json({ message: 'Project not found' })
    return true
  }

  if (error instanceof Error && error.message === 'PROJECT_FORBIDDEN') {
    res.status(403).json({ message: '이 작업을 수행할 권한이 없습니다.' })
    return true
  }

  if (error instanceof Error && error.message === 'INVITE_NOT_FOUND') {
    res.status(404).json({ message: '초대를 찾을 수 없습니다.' })
    return true
  }

  if (error instanceof Error && error.message === 'INVITE_FORBIDDEN') {
    res.status(403).json({ message: '이 초대에 응답할 권한이 없습니다.' })
    return true
  }

  if (error instanceof Error && error.message === 'INVITE_NOT_PENDING') {
    res.status(400).json({ message: '이미 처리된 초대입니다.' })
    return true
  }

  return false
}

const inviteInclude = {
  invitee: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  },
} as const

/** List cards and pickers only need summary fields; full tasks/files/members load on the detail route. */
projectsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const query = projectListQuerySchema.parse(req.query)
    const sortField = query.sort === 'created' ? 'createdAt' : 'updatedAt'
    const mine: Prisma.ProjectWhereInput = {
      AND: [
        { OR: [{ ownerId: authUser.id, programId: null }, { members: { some: { userId: authUser.id } } }] },
        ...(query.kind ? [{ programId: query.kind === 'program' ? { not: null } : null }] : []),
        ...(query.q
          ? [
              {
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' as const } },
                  { description: { contains: query.q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    }
    const rows = await prisma.project.findMany({
      where: {
        AND: [
          mine,
          ...(query.status ? [{ status: statusMap[query.status] }] : []),
          keysetAfter(sortField, decodeCursor(query.cursor)) as Prisma.ProjectWhereInput,
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        status: true,
        progress: true,
        visibility: true,
        skills: true,
        ownerId: true,
        programId: true,
        teamName: true,
        createdAt: true,
        updatedAt: true,
        program: { select: { id: true, title: true, organization: { select: { id: true, name: true } } } },
        members: { where: { userId: authUser.id }, select: { role: true, projectRole: { select: { name: true } } } },
        _count: { select: { tasks: true, activities: true, files: true, members: true, externalLinks: true } },
      },
      orderBy: keysetOrder(sortField) as Prisma.ProjectOrderByWithRelationInput[],
      take: query.limit + 1,
    })
    const page = toPage(rows, query.limit, (row) => ({ v: row[sortField], id: row.id }))
    const access = new Map(
      await Promise.all(
        page.items.map(async (row) => [row.id, await resolveUserProjectPermissions(row.id, authUser.id)] as const),
      ),
    )
    const taskViewable = page.items.filter((row) => access.get(row.id)?.permissions.includes('tasks.view')).map((row) => row.id)
    // The open task due soonest (undated ones last) per project, only where the viewer may see tasks.
    const nextTasks = taskViewable.length
      ? await prisma.projectTask.findMany({
          where: {
            projectId: { in: taskViewable },
            status: { in: [ProjectTaskStatus.TODO, ProjectTaskStatus.IN_PROGRESS, ProjectTaskStatus.BLOCKED] },
          },
          distinct: ['projectId'],
          orderBy: [{ projectId: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          select: { id: true, projectId: true, title: true, status: true, dueDate: true },
        })
      : []
    const nextTaskByProject = new Map(nextTasks.map(({ projectId, ...task }) => [projectId, task]))
    const doneCounts = page.items.length
      ? await prisma.projectTask.groupBy({
          by: ['projectId'],
          where: { projectId: { in: page.items.map((row) => row.id) }, status: ProjectTaskStatus.DONE },
          _count: { _all: true },
        })
      : []
    const doneByProject = new Map(doneCounts.map((row) => [row.projectId, row._count._all]))
    const hiddenRows = page.items.length
      ? await prisma.projectDisplayPreference.findMany({
          where: { userId: authUser.id, projectId: { in: page.items.map((row) => row.id) } },
          select: { projectId: true },
        })
      : []
    const hiddenFromProfile = new Set(hiddenRows.map((row) => row.projectId))
    // Totals across every page, so a "N active projects" summary does not depend on the page size.
    let statusCounts: Record<ProjectStatus, number> | undefined
    // Counts ignore the status filter so every status tab can show how many projects it holds.
    if (!query.cursor) {
      const grouped = await prisma.project.groupBy({ by: ['status'], where: mine, _count: { _all: true } })
      statusCounts = { PLANNING: 0, ACTIVE: 0, COMPLETED: 0, ARCHIVED: 0 }
      for (const row of grouped) statusCounts[row.status] = row._count._all
    }

    res.status(200).json({
      projects: page.items.map(({ _count, members, ...row }) => {
        const viewer = access.get(row.id)
        return {
          ...row,
          counts: { ..._count, doneTasks: doneByProject.get(row.id) ?? 0 },
          myRole: {
            name: members[0]?.projectRole?.name ?? members[0]?.role ?? (row.ownerId === authUser.id ? '소유자' : null),
            isLeader: Boolean(viewer?.isLeader),
          },
          restricted: Boolean(viewer?.restricted),
          nextTask: nextTaskByProject.get(row.id) ?? null,
          hiddenFromProfile: hiddenFromProfile.has(row.id),
        }
      }),
      nextCursor: page.nextCursor,
      ...(statusCounts ? { statusCounts } : {}),
    })
  } catch (error) {
    next(error)
  }
})

async function requireLinkEditor(projectId: string, userId: string) {
  await requireProjectPermission(projectId, userId, 'project.edit')
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { program: { select: { status: true } } },
  })
  if (project?.program) {
    assertProgramWritable(project.program.status)
  }
}

projectsRouter.get('/:id/links', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectAccess(projectId, authUser.id)
    const links = await prisma.projectExternalLink.findMany({ where: { projectId }, select: projectLinkSelect })
    res.status(200).json({ links: sortLinks(links).map(serializeLink) })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/:id/links', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireLinkEditor(projectId, authUser.id)
    const input = projectLinkSchema.parse(req.body)
    const analyzed = analyzeExternalLink(input.url, input.type)

    const existingCount = await prisma.projectExternalLink.count({ where: { projectId } })
    if (existingCount >= MAX_LINKS_PER_PROJECT) {
      res.status(400).json({ message: `외부 링크는 프로젝트당 최대 ${MAX_LINKS_PER_PROJECT}개까지 연결할 수 있습니다.` })
      return
    }
    const duplicate = await prisma.projectExternalLink.findUnique({
      where: { projectId_url: { projectId, url: analyzed.url } },
      select: { id: true },
    })
    if (duplicate) {
      res.status(409).json({ message: '이미 연결된 링크입니다.' })
      return
    }

    const link = await prisma.projectExternalLink.create({
      data: {
        projectId,
        type: analyzed.type,
        url: analyzed.url,
        label: input.label || analyzed.defaultLabel,
        description: input.description ?? null,
        metadata: analyzed.metadata ?? undefined,
        sortOrder: existingCount,
        createdById: authUser.id,
      },
      select: projectLinkSelect,
    })
    await prisma.projectActivity.create({
      data: {
        projectId,
        userId: authUser.id,
        type: ProjectActivityType.FILE,
        title: `외부 링크 연결: ${link.label ?? analyzed.defaultLabel}`,
      },
    })
    res.status(201).json({ link: serializeLink(link) })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.patch('/:id/links/:linkId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const linkId = String(req.params.linkId)
    await requireLinkEditor(projectId, authUser.id)
    const existing = await prisma.projectExternalLink.findFirst({ where: { id: linkId, projectId } })
    if (!existing) {
      res.status(404).json({ message: '링크를 찾을 수 없습니다.' })
      return
    }
    const input = updateProjectLinkSchema.parse(req.body)
    const analyzed =
      input.url !== undefined || input.type !== undefined
        ? analyzeExternalLink(input.url ?? existing.url, input.type ?? existing.type)
        : null
    if (analyzed && analyzed.url !== existing.url) {
      const duplicate = await prisma.projectExternalLink.findUnique({
        where: { projectId_url: { projectId, url: analyzed.url } },
        select: { id: true },
      })
      if (duplicate) {
        res.status(409).json({ message: '이미 연결된 링크입니다.' })
        return
      }
    }

    const link = await prisma.projectExternalLink.update({
      where: { id: linkId },
      data: {
        ...(analyzed
          ? { type: analyzed.type, url: analyzed.url, metadata: analyzed.metadata ?? Prisma.JsonNull }
          : {}),
        ...(input.label !== undefined ? { label: input.label || (analyzed ?? existing).url } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      select: projectLinkSelect,
    })
    res.status(200).json({ link: serializeLink(link) })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.delete('/:id/links/:linkId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireLinkEditor(projectId, authUser.id)
    const { count } = await prisma.projectExternalLink.deleteMany({
      where: { id: String(req.params.linkId), projectId },
    })
    if (count === 0) {
      res.status(404).json({ message: '링크를 찾을 수 없습니다.' })
      return
    }
    res.status(204).send()
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = projectSchema.parse(req.body)
    const slug = await createUniqueSlug(input.title)

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          ...buildProjectData(input),
          slug,
          ownerId: authUser.id,
        },
      })

      await tx.projectRole.createMany({
        data: DEFAULT_PROJECT_ROLE_TEMPLATES.map((template) => ({
          projectId: created.id,
          name: template.name,
          slug: template.slug,
          description: template.description,
          permissions: template.permissions,
          isSystem: template.isSystem,
          sortOrder: template.sortOrder,
        })),
      })

      const ownerRole = await tx.projectRole.findUnique({
        where: { projectId_slug: { projectId: created.id, slug: 'owner' } },
      })

      await tx.projectMember.create({
        data: {
          projectId: created.id,
          userId: authUser.id,
          roleId: ownerRole?.id,
          role: ownerRole?.name ?? '소유자',
          contribution: DEFAULT_OWNER_CONTRIBUTION,
        },
      })

      await tx.projectActivity.create({
        data: {
          projectId: created.id,
          userId: authUser.id,
          type: ProjectActivityType.MILESTONE,
          title: 'Project created',
          description: '프로젝트가 생성되었습니다.',
        },
      })

      return tx.project.findUnique({
        where: { id: created.id },
        include: projectInclude,
      })
    })

    res.status(201).json({ project: project && withSerializedLinks(project) })
  } catch (error) {
    next(error)
  }
})

projectsRouter.post('/invites/:inviteId/accept', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const inviteId = String(req.params.inviteId)
    const result = await acceptProjectInvite(inviteId, authUser.id)
    res.status(200).json(result)
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/invites/:inviteId/decline', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const inviteId = String(req.params.inviteId)
    await declineProjectInvite(inviteId, authUser.id)
    res.status(200).json({ ok: true })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.get('/:id/team-candidates', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const candidates = await getProjectTeamCandidates(projectId, authUser.id)
    res.status(200).json(candidates)
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/:id/invites', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'members.invite')
    const input = projectInviteSchema.parse(req.body)

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        title: true,
        program: { select: { id: true, organizationId: true, allowMultipleProjects: true, status: true } },
      },
    })

    if (!project) {
      res.status(404).json({ message: 'Project not found' })
      return
    }

    if (project.program) {
      await assertProgramInvitee(project.program, projectId, input.userId)
    }

    if (input.userId === authUser.id) {
      res.status(400).json({ message: '본인은 초대할 수 없습니다.' })
      return
    }

    if (input.userId === project.ownerId) {
      res.status(400).json({ message: '프로젝트 소유자는 초대할 수 없습니다.' })
      return
    }

    const inviteRole = await getProjectRoleById(projectId, input.roleId)
    if (!inviteRole) {
      res.status(400).json({ message: '유효하지 않은 역할입니다.' })
      return
    }

    if (inviteRole.slug === 'owner') {
      res.status(400).json({ message: '소유자 역할로는 초대할 수 없습니다.' })
      return
    }

    if (project.program && isLeaderSlug(inviteRole.slug)) {
      res.status(400).json({ message: '기관 프로그램 팀장 지정은 담당자가 합니다. 팀원 역할로 초대해 주세요.' })
      return
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: input.userId } },
    })

    if (existingMember) {
      res.status(400).json({ message: '이미 팀에 포함된 멤버입니다.' })
      return
    }

    const invite = await prisma.projectInvite.upsert({
      where: {
        projectId_inviteeId: { projectId, inviteeId: input.userId },
      },
      create: {
        projectId,
        inviterId: authUser.id,
        inviteeId: input.userId,
        roleId: inviteRole.id,
        role: inviteRole.name,
        contribution: input.contribution ?? null,
        status: ProjectInviteStatus.PENDING,
      },
      update: {
        inviterId: authUser.id,
        roleId: inviteRole.id,
        role: inviteRole.name,
        contribution: input.contribution ?? null,
        status: ProjectInviteStatus.PENDING,
        respondedAt: null,
      },
      include: inviteInclude,
    })

    await createProjectInviteNotification({
      inviteId: invite.id,
      inviteeId: input.userId,
      inviterId: authUser.id,
      projectTitle: project.title,
    })

    res.status(201).json({ invite })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const project = await requireProjectAccess(projectId, authUser.id)
    const { permissions, isOwner, isLeader, isProgramStaff, restricted } = await resolveUserProjectPermissions(
      projectId,
      authUser.id,
    )
    const isMember =
      isOwner || project.members.some((member) => member.userId === authUser.id)
    if (isMember && !restricted && !permissions.includes('project.view')) {
      throw new Error('PROJECT_FORBIDDEN')
    }
    const isGuestViewer = !isOwner && permissions.length === 0
    const canInvite = permissions.includes('members.invite')

    const [canSetDisplay, hiddenFromProfile, pendingInvites, registration] = await Promise.all([
      canSetProfileDisplay(authUser.id, projectId),
      isHiddenFromProfile(authUser.id, projectId),
      canInvite
        ? prisma.projectInvite.findMany({
            where: { projectId, status: ProjectInviteStatus.PENDING },
            include: inviteInclude,
            orderBy: { createdAt: 'desc' },
          })
        : [],
      isGuestViewer
        ? null
        : prisma.programProjectRegistration.findFirst({
            where: { projectId },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              reviewNote: true,
              createdAt: true,
              program: { select: { id: true, title: true, organizationId: true, organization: { select: { name: true } } } },
            },
          }),
    ])

    const withLinks = withSerializedLinks(project)
    const visibleProject = isGuestViewer
      ? {
          ...withLinks,
          externalLinks: restricted ? [] : withLinks.externalLinks,
          owner: { ...withLinks.owner, email: '' },
          members: withLinks.members.map((member) => ({ ...member, user: { ...member.user, email: '' } })),
          tasks: [],
          files: [],
          activities: [],
          roles: [],
        }
      : withLinks

    res.status(200).json({
      project: visibleProject,
      pendingInvites,
      myPermissions: permissions,
      isOwner,
      isLeader,
      isProgramStaff,
      isGuestViewer,
      restricted,
      /** The viewer's own profile setting; independent of team access and institution records. */
      profileDisplay: { canSet: canSetDisplay, hidden: hiddenFromProfile },
      registration: registration
        ? {
            id: registration.id,
            status: registration.status.toLowerCase(),
            reviewNote: registration.reviewNote,
            createdAt: registration.createdAt,
            program: {
              id: registration.program.id,
              title: registration.program.title,
              organizationId: registration.program.organizationId,
              organizationName: registration.program.organization.name,
            },
          }
        : null,
    })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'project.edit')
    const input = updateProjectSchema.parse(req.body)
    if (input.visibility !== undefined) {
      await requireProjectPermission(projectId, authUser.id, 'project.settings')
      await assertVisibilityAllowed(projectId, input.visibility)
    }
    const project = await prisma.project.update({
      where: { id: projectId },
      data: buildProjectUpdateData(input),
      include: projectInclude,
    })

    res.status(200).json({ project: withSerializedLinks(project) })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

const visibilitySchema = z.object({ visibility: z.enum(['private', 'team', 'public']) })

/**
 * Project content visibility. PRIVATE: leaders, program staff and members granted private access.
 * TEAM: every official team member (plus program staff). PUBLIC: any signed-in user sees the
 * overview, and for program projects only while the program allows it.
 */
projectsRouter.patch('/:id/visibility', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'project.settings')
    const { visibility } = visibilitySchema.parse(req.body)
    await assertVisibilityAllowed(projectId, visibility)
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { visibility: visibilityMap[visibility] },
      select: {
        id: true,
        visibility: true,
        programId: true,
        ownerId: true,
        program: { select: { organizationId: true } },
        members: { select: { userId: true } },
        verifiedRecords: { select: { userId: true } },
      },
    })
    if (project.visibility !== ProjectVisibility.PUBLIC) {
      await refreshCandidateResultsSafely([project.ownerId, ...project.members.map((m) => m.userId), ...project.verifiedRecords.map((r) => r.userId)])
    }
    await audit(req, res, {
      action: 'project.visibility_change',
      organizationId: project.program?.organizationId ?? null,
      targetType: 'project',
      targetId: project.id,
      metadata: { visibility: project.visibility },
    })
    res.status(200).json({ id: project.id, visibility: project.visibility.toLowerCase() })
  } catch (error) {
    if (handleProjectError(error, res)) return
    next(error)
  }
})

const privateAccessSchema = z.object({ allowed: z.boolean() })

/** Leaders choose which non-leader members may open the project while it is PRIVATE. */
projectsRouter.patch('/:id/members/:memberId/private-access', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const { isLeader } = await resolveUserProjectPermissions(projectId, authUser.id)
    if (!isLeader) throw new HttpError(403, '팀장만 비공개 열람 권한을 지정할 수 있습니다.')
    const { allowed } = privateAccessSchema.parse(req.body)
    const member = await prisma.projectMember.findFirst({
      where: { id: String(req.params.memberId), projectId },
      select: { id: true },
    })
    if (!member) throw new HttpError(404, '팀원을 찾을 수 없습니다.')
    await prisma.projectMember.update({ where: { id: member.id }, data: { privateAccess: allowed } })
    res.status(200).json({ id: member.id, privateAccess: allowed })
  } catch (error) {
    if (handleProjectError(error, res)) return
    next(error)
  }
})

const profileDisplaySchema = z.object({ hidden: z.boolean() })

/** Hides the project from (or shows it again on) the caller's own profile, portfolio and shared records. */
projectsRouter.put('/:id/profile-display', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { hidden } = profileDisplaySchema.parse(req.body)
    const result = await setHiddenFromProfile(authUser.id, String(req.params.id), hidden)
    if (hidden) await refreshCandidateResultsSafely([authUser.id])
    res.status(200).json(result)
  } catch (error) {
    next(error)
  }
})

/** What deleting would remove or why it is refused, so the settings screen can offer archiving instead. */
projectsRouter.get('/:id/deletion', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const { permissions } = await resolveUserProjectPermissions(projectId, authUser.id)
    if (!permissions.includes('project.view')) throw new HttpError(404, 'Project not found')
    const { blockers, impact } = await projectDeletionCheck(prisma, projectId)
    const hasPermission = permissions.includes('project.delete')
    res.status(200).json({
      canDelete: hasPermission && blockers.length === 0,
      hasPermission,
      canArchive: permissions.includes('project.settings'),
      blockers,
      impact,
    })
  } catch (error) {
    next(error)
  }
})

projectsRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'project.delete')

    const input = deleteProjectSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: authUser.id } })
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password)
    if (!passwordMatches) {
      res.status(403).json({ message: '비밀번호가 일치하지 않습니다.' })
      return
    }

    const { title, members } = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { title: true, members: { select: { userId: true } } },
    })
    try {
      const check = await deletePersonalProject(projectId, { confirmTeamImpact: input.confirmTeamImpact })
      await refreshCandidateResultsSafely([authUser.id, ...members.map((member) => member.userId)])
      await audit(req, res, {
        action: 'project.delete',
        targetType: 'project',
        targetId: projectId,
        metadata: { title, impact: check.impact },
      })
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        const check = await projectDeletionCheck(prisma, projectId).catch(() => null)
        await audit(req, res, {
          action: 'project.delete',
          outcome: 'denied',
          organizationId: check?.organizationId ?? null,
          targetType: 'project',
          targetId: projectId,
          metadata: { title, reason: (error.details as { code?: string } | undefined)?.code, blockers: check?.blockers.map((b) => b.code) },
        })
      }
      throw error
    }

    res.status(204).send()
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: 'Validation failed', issues: error.issues })
      return
    }
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.delete('/:id/members/me', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
      res.status(404).json({ message: 'Project not found' })
      return
    }

    if (project.programId) {
      res.status(400).json({ message: '기관 프로그램 팀 구성은 프로그램 담당자가 관리합니다.' })
      return
    }

    if (project.ownerId === authUser.id) {
      res.status(400).json({ message: '프로젝트 소유자는 탈퇴할 수 없습니다. 프로젝트를 삭제해 주세요.' })
      return
    }

    await prisma.projectMember.deleteMany({
      where: { projectId, userId: authUser.id },
    })
    await refreshCandidateResultsSafely([authUser.id])

    res.status(204).send()
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/:id/members', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'members.invite')
    const target = await prisma.project.findUnique({ where: { id: projectId }, select: { programId: true } })
    if (target?.programId) {
      res.status(400).json({ message: '기관 프로그램 팀원은 초대를 보내 수락받는 방식으로만 추가할 수 있습니다.' })
      return
    }
    const input = projectMemberSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } })

    if (!user) {
      res.status(404).json({ message: 'User not found for member email' })
      return
    }

    const editorRole = await prisma.projectRole.findFirst({
      where: { projectId, slug: 'editor' },
    })

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: {
        projectId,
        userId: user.id,
        roleId: editorRole?.id,
        role: editorRole?.name ?? input.role,
        contribution: input.contribution,
      },
      update: {
        roleId: editorRole?.id,
        role: editorRole?.name ?? input.role,
        contribution: input.contribution,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })

    res.status(201).json({ member })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

async function assertAssignable(projectId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: assigneeId } },
    select: { id: true },
  })
  if (!member) throw new HttpError(400, '담당자는 이 프로젝트의 팀원 중에서 지정해 주세요.')
}

projectsRouter.post('/:id/tasks', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'tasks.create')
    const input = projectTaskSchema.parse(req.body)
    await assertAssignable(projectId, input.assigneeId)
    const task = await prisma.projectTask.create({
      data: {
        projectId,
        title: input.title,
        description: input.description,
        status: taskStatusMap[input.status],
        assigneeId: input.assigneeId,
        dueDate: toOptionalDate(input.dueDate),
      },
      include: {
        assignee: projectInclude.owner,
      },
    })

    res.status(201).json({ task })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.patch('/:id/tasks/:taskId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'tasks.edit')
    const input = updateProjectTaskSchema.parse(req.body)
    await assertAssignable(projectId, input.assigneeId)
    const task = await prisma.projectTask.update({
      where: {
        id: String(req.params.taskId),
        projectId,
      },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: taskStatusMap[input.status] } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: toOptionalDate(input.dueDate) } : {}),
      },
      include: {
        assignee: projectInclude.owner,
      },
    })

    res.status(200).json({ task })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

projectsRouter.post('/:id/activities', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectPermission(projectId, authUser.id, 'activities.create')
    const input = projectActivitySchema.parse(req.body)
    const activity = await prisma.projectActivity.create({
      data: {
        projectId,
        userId: authUser.id,
        type: activityTypeMap[input.type],
        title: input.title,
        description: input.description,
      },
      include: {
        user: projectInclude.owner,
      },
    })

    res.status(201).json({ activity })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.maxFileBytes, files: PROJECT_FILE_LIMITS.maxFilesPerRequest, fields: 5 },
})

/** JSON bodies add a link; multipart bodies carry files. Permission is checked before anything is buffered. */
const acceptProjectFiles: RequestHandler = async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    await requireProjectPermission(String(req.params.id), authUser.id, 'files.upload')
  } catch (error) {
    if (!handleProjectError(error, res)) next(error)
    return
  }
  if (!req.is('multipart/form-data')) {
    next()
    return
  }
  limits.upload(req, res, (error?: unknown) => {
    if (error) {
      next(error)
      return
    }
    fileUpload.array('files', PROJECT_FILE_LIMITS.maxFilesPerRequest)(req, res, next)
  })
}

projectsRouter.post('/:id/files', authenticate, acceptProjectFiles, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    if (req.is('multipart/form-data')) {
      const { fileType } = projectFileUploadSchema.parse(req.body)
      const uploads = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[]
      const files = await storeProjectFiles(projectId, authUser.id, uploads, fileType)
      res.status(201).json({ files })
      return
    }
    const input = projectFileSchema.parse(req.body)
    const file = await prisma.projectFile.create({
      data: {
        projectId,
        uploadedBy: authUser.id,
        name: input.name,
        url: input.url,
        fileType: input.fileType,
      },
      select: projectFileSelect,
    })

    res.status(201).json({ file })
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

/** Uploaded files are only reachable through a short-lived URL issued after the viewer's access is re-checked. */
projectsRouter.get('/:id/files/:fileId/url', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    await requireProjectAccess(projectId, authUser.id)
    await requireProjectPermission(projectId, authUser.id, 'files.view')
    const file = await prisma.projectFile.findFirst({
      where: { id: String(req.params.fileId), projectId },
      select: { name: true, storageKey: true, mimeType: true },
    })
    if (!file?.storageKey || !file.mimeType) throw new HttpError(404, '파일을 찾을 수 없습니다.')
    const signed = await storage.signedUrl(file.storageKey, {
      contentType: file.mimeType,
      fileName: file.name,
      inline: req.query.download !== '1' && opensInline(file.mimeType),
    })
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(signed)
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})

/** `files.delete` removes anyone's file; uploaders who can still upload may remove their own. */
projectsRouter.delete('/:id/files/:fileId', authenticate, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const projectId = String(req.params.id)
    const { permissions } = await resolveUserProjectPermissions(projectId, authUser.id)
    if (!permissions.includes('files.view')) throw new Error('PROJECT_NOT_FOUND')
    const file = await prisma.projectFile.findFirst({
      where: { id: String(req.params.fileId), projectId },
      select: { id: true, uploadedBy: true, storageKey: true },
    })
    if (!file) throw new HttpError(404, '파일을 찾을 수 없습니다.')
    const ownFile = file.uploadedBy === authUser.id && permissions.includes('files.upload')
    if (!permissions.includes('files.delete') && !ownFile) throw new Error('PROJECT_FORBIDDEN')
    await prisma.projectFile.delete({ where: { id: file.id } })
    await removeStoredObjects([file.storageKey])
    res.status(204).send()
  } catch (error) {
    if (handleProjectError(error, res)) {
      return
    }
    next(error)
  }
})
