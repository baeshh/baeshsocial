import {
  EvidenceStatus,
  OrganizationRole,
  OrganizationVerificationStatus,
  type Organization,
  type OrganizationMember,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'
import { computeProjectProgress } from './programs.routes.js'
import { teamRoleOf } from './program.serializers.js'

const ratio = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100))

/**
 * Institution view of the org dashboard. Staff (org admins: every program; managers: assigned
 * programs) get aggregate progress and review stats; plain members only see their own participation.
 */
export async function buildInstitutionDashboard(
  organization: Organization,
  membership: OrganizationMember,
  userId: string,
  filterProgramId?: string,
) {
  const approved = organization.verificationStatus === OrganizationVerificationStatus.APPROVED
  const isOrgAdmin = approved && hasOrgRole(membership.role, OrganizationRole.ADMIN)
  const canManage = approved && hasOrgRole(membership.role, OrganizationRole.MANAGER)

  const myParticipation = await prisma.programParticipant.findMany({
    where: { userId, program: { organizationId: organization.id } },
    select: {
      program: { select: { id: true, title: true, status: true, term: true } },
    },
  })
  const myTeams = await prisma.projectMember.findMany({
    where: { userId, project: { program: { organizationId: organization.id } } },
    select: {
      projectRole: { select: { slug: true } },
      project: { select: { id: true, title: true, teamName: true, programId: true } },
    },
  })
  const participation = myParticipation.map(({ program }) => {
    const team = myTeams.find((row) => row.project.programId === program.id)
    return {
      programId: program.id,
      programTitle: program.title,
      programStatus: program.status.toLowerCase(),
      term: program.term,
      team: team ? { ...team.project, teamRole: teamRoleOf(team.projectRole?.slug) } : null,
    }
  })

  if (!canManage) {
    return { scope: 'participant' as const, myParticipation: participation }
  }

  const programs = await prisma.program.findMany({
    where: {
      organizationId: organization.id,
      ...(isOrgAdmin ? {} : { managers: { some: { userId } } }),
    },
    select: { id: true, title: true, status: true, term: true, startDate: true, endDate: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  if (filterProgramId && !programs.some((program) => program.id === filterProgramId)) {
    throw new HttpError(404, '프로그램을 찾을 수 없습니다.')
  }
  const scopeIds = filterProgramId ? [filterProgramId] : programs.map((program) => program.id)

  const [projects, participants] = await Promise.all([
    prisma.project.findMany({
      where: { programId: { in: scopeIds } },
      select: {
        id: true,
        title: true,
        teamName: true,
        status: true,
        progress: true,
        programId: true,
        updatedAt: true,
        _count: { select: { members: true } },
        tasks: { select: { status: true } },
        evidence: { select: { status: true, authorId: true, submittedAt: true } },
      },
    }),
    prisma.programParticipant.findMany({
      where: { programId: { in: scopeIds } },
      select: { programId: true, userId: true },
    }),
  ])

  const programTitle = new Map(programs.map((program) => [program.id, program.title]))
  const submitters = new Set<string>()
  const totals = { submitted: 0, approved: 0, rejected: 0 }
  const perProgram = new Map<string, { projects: number; pending: number; approved: number; rejected: number }>()

  const projectRows = projects.map((project) => {
    const stats = { submitted: 0, approved: 0, rejected: 0 }
    let lastSubmittedAt: Date | null = null
    for (const item of project.evidence) {
      if (item.status === EvidenceStatus.DRAFT) continue
      submitters.add(`${project.programId}:${item.authorId}`)
      if (item.status === EvidenceStatus.SUBMITTED) stats.submitted += 1
      if (item.status === EvidenceStatus.APPROVED) stats.approved += 1
      if (item.status === EvidenceStatus.REJECTED) stats.rejected += 1
      if (item.submittedAt && (!lastSubmittedAt || item.submittedAt > lastSubmittedAt)) lastSubmittedAt = item.submittedAt
    }
    totals.submitted += stats.submitted
    totals.approved += stats.approved
    totals.rejected += stats.rejected

    const bucket = perProgram.get(project.programId!) ?? { projects: 0, pending: 0, approved: 0, rejected: 0 }
    bucket.projects += 1
    bucket.pending += stats.submitted
    bucket.approved += stats.approved
    bucket.rejected += stats.rejected
    perProgram.set(project.programId!, bucket)

    return {
      id: project.id,
      title: project.title,
      teamName: project.teamName,
      status: project.status.toLowerCase(),
      programId: project.programId,
      programTitle: programTitle.get(project.programId!) ?? '',
      memberCount: project._count.members,
      progress: computeProjectProgress(project),
      tasks: { total: project.tasks.length, done: project.tasks.filter((t) => t.status === 'DONE').length },
      evidence: stats,
      lastSubmittedAt,
      updatedAt: project.updatedAt,
    }
  })

  // A student enrolled in several programs counts once in the totals.
  const uniqueStudents = new Set(participants.map((participant) => participant.userId))
  const submittedStudents = new Set(
    participants
      .filter((participant) => submitters.has(`${participant.programId}:${participant.userId}`))
      .map((participant) => participant.userId),
  )
  const submittedParticipants = submittedStudents.size

  const reviewed = totals.approved + totals.rejected
  return {
    scope: 'staff' as const,
    isOrgAdmin,
    filterProgramId: filterProgramId ?? null,
    programs: programs.map((program) => {
      const bucket = perProgram.get(program.id) ?? { projects: 0, pending: 0, approved: 0, rejected: 0 }
      const programParticipants = participants.filter((p) => p.programId === program.id)
      const programSubmitters = programParticipants.filter((p) => submitters.has(`${program.id}:${p.userId}`)).length
      const inScope = scopeIds.includes(program.id)
      return {
        id: program.id,
        title: program.title,
        status: program.status.toLowerCase(),
        term: program.term,
        startDate: program.startDate,
        endDate: program.endDate,
        inScope,
        projectCount: inScope ? bucket.projects : null,
        participantCount: inScope ? programParticipants.length : null,
        pendingEvidence: inScope ? bucket.pending : null,
        approvedEvidence: inScope ? bucket.approved : null,
        submissionRate: inScope ? ratio(programSubmitters, programParticipants.length) : null,
      }
    }),
    totals: {
      programCount: scopeIds.length,
      projectCount: projectRows.length,
      participantCount: uniqueStudents.size,
      evidence: totals,
      pendingReview: totals.submitted,
      submittedParticipants,
      submissionRate: ratio(submittedParticipants, uniqueStudents.size),
      approvalRate: ratio(totals.approved, reviewed),
      averageProgress: projectRows.length
        ? Math.round(projectRows.reduce((sum, row) => sum + row.progress, 0) / projectRows.length)
        : null,
    },
    projects: projectRows.sort(
      (a, b) => a.programTitle.localeCompare(b.programTitle, 'ko') || (a.teamName ?? a.title).localeCompare(b.teamName ?? b.title, 'ko'),
    ),
    myParticipation: participation,
  }
}
