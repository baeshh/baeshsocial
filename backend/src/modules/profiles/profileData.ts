import {
  OpportunityEnrollmentStatus,
  OrganizationMemberStatus,
  OrganizationVerificationStatus,
  PostVisibility,
  Prisma,
  ProfileVisibility,
  ProjectVisibility,
  VerifiedRecordStatus,
} from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { projectLinkSelect, serializeLink, sortLinks } from '../../utils/externalLinks.js'
import { HttpError } from '../../utils/httpError.js'
import {
  compareSortKeys,
  isAfterCursor,
  keysetAfter,
  keysetOrder,
  toPage,
  type SortKey,
} from '../../utils/pagination.js'
import { DEFAULT_OWNER_CONTRIBUTION } from '../../utils/projectPermissions.js'
import { readSnapshot, recordIntegrity } from '../../services/verification/verifiedRecords.js'
import { buildSkillInsights } from '../../utils/skillInsights.js'

/* ------------------------------ Viewer access ----------------------------- */

export type ProfileViewer = {
  userId: string
  profileId: string
  viewerId: string | null
  isSelf: boolean
  isFollowing: boolean
  visibility: ProfileVisibility
  canViewDetails: boolean
}

export async function resolveProfileViewer(userId: string, viewerId: string | null): Promise<ProfileViewer> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    throw new HttpError(404, '사용자를 찾을 수 없습니다.')
  }
  const profile = await prisma.profile.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { id: true, visibility: true },
  })
  const isSelf = viewerId === userId
  const isFollowing =
    viewerId && !isSelf
      ? Boolean(
          await prisma.userFollow.findUnique({
            where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
            select: { followerId: true },
          }),
        )
      : false
  const canViewDetails =
    isSelf ||
    profile.visibility === ProfileVisibility.PUBLIC ||
    (profile.visibility === ProfileVisibility.MEMBERS && Boolean(viewerId)) ||
    (profile.visibility === ProfileVisibility.FOLLOWERS && isFollowing)

  return { userId, profileId: profile.id, viewerId, isSelf, isFollowing, visibility: profile.visibility, canViewDetails }
}

export function requireProfileDetails(viewer: ProfileViewer) {
  if (!viewer.canViewDetails) {
    throw new HttpError(403, '프로필 공개 범위 설정으로 볼 수 없는 정보입니다.')
  }
}

/* -------------------------------- Projects -------------------------------- */

export const PROFILE_PROJECT_FILTERS = ['all', 'owned', 'joined', 'verified'] as const
export type ProfileProjectFilter = (typeof PROFILE_PROJECT_FILTERS)[number]

/**
 * Projects the user actually worked on. Program projects are owned by the staff member who created
 * them, so they only count for people on the team, not for the managing staff.
 */
export function involvementWhere(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, programId: null }, { members: { some: { userId } } }] }
}

function institutionVerifiedWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    verifiedRecords: { some: { userId, status: VerifiedRecordStatus.VERIFIED, evidenceId: { not: null } } },
  }
}

/**
 * Others see public projects, projects they are on themselves, and team-only institution projects
 * with an approved record — the latter as a limited card (no description or links).
 */
export function visibleProjectsWhere(viewer: ProfileViewer, filter: ProfileProjectFilter = 'all') {
  const and: Prisma.ProjectWhereInput[] = [involvementWhere(viewer.userId)]
  if (!viewer.isSelf) {
    and.push({
      OR: [
        { visibility: ProjectVisibility.PUBLIC },
        institutionVerifiedWhere(viewer.userId),
        ...(viewer.viewerId
          ? [{ members: { some: { userId: viewer.viewerId } } }, { ownerId: viewer.viewerId, programId: null }]
          : []),
      ],
    })
  }
  if (filter === 'owned') and.push({ ownerId: viewer.userId, programId: null })
  if (filter === 'joined') and.push({ members: { some: { userId: viewer.userId } }, NOT: { ownerId: viewer.userId } })
  if (filter === 'verified') and.push(institutionVerifiedWhere(viewer.userId))
  return { AND: and } satisfies Prisma.ProjectWhereInput
}

function projectCardSelect(viewer: ProfileViewer) {
  const memberIds = viewer.viewerId && !viewer.isSelf ? [viewer.userId, viewer.viewerId] : [viewer.userId]
  const verifiedWhere = { userId: viewer.userId, status: VerifiedRecordStatus.VERIFIED }
  return {
    id: true,
    title: true,
    description: true,
    objective: true,
    status: true,
    progress: true,
    skills: true,
    visibility: true,
    ownerId: true,
    programId: true,
    teamName: true,
    startDate: true,
    endDate: true,
    updatedAt: true,
    program: { select: { id: true, title: true, organization: { select: { id: true, name: true } } } },
    members: {
      where: { userId: { in: memberIds } },
      select: { userId: true, role: true, contribution: true, projectRole: { select: { name: true } } },
    },
    externalLinks: { select: projectLinkSelect, take: 12 },
    verifiedRecords: {
      where: verifiedWhere,
      orderBy: { issuedAt: 'desc' },
      take: 1,
      select: { issuedAt: true, evidence: { select: { reviewedAt: true } } },
    },
    _count: { select: { verifiedRecords: { where: verifiedWhere } } },
  } satisfies Prisma.ProjectSelect
}

type ProjectCardRow = Prisma.ProjectGetPayload<{ select: ReturnType<typeof projectCardSelect> }>

function projectHighlight(contribution: string | null | undefined, objective: string | null) {
  const meaningful = contribution?.trim()
  if (meaningful && meaningful !== DEFAULT_OWNER_CONTRIBUTION) {
    return meaningful
  }
  return objective?.trim() || null
}

function serializeProjectCard(row: ProjectCardRow, viewer: ProfileViewer, featuredIds: string[]) {
  const member = row.members.find((m) => m.userId === viewer.userId)
  const viewerOnTeam =
    Boolean(viewer.viewerId) &&
    (row.members.some((m) => m.userId === viewer.viewerId) || (row.ownerId === viewer.viewerId && !row.programId))
  const fullAccess = viewer.isSelf || row.visibility === ProjectVisibility.PUBLIC || viewerOnTeam
  const isOwner = row.ownerId === viewer.userId && !row.programId
  const latest = row.verifiedRecords[0]

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    skills: row.skills,
    visibility: row.visibility,
    updatedAt: row.updatedAt,
    startDate: row.startDate,
    endDate: row.endDate,
    access: fullAccess ? ('full' as const) : ('limited' as const),
    description: fullAccess ? row.description : null,
    highlight: fullAccess ? projectHighlight(member?.contribution, row.objective) : null,
    isOwner,
    role: isOwner ? '프로젝트 리더' : (member?.role ?? member?.projectRole?.name ?? '팀원'),
    teamName: row.teamName,
    program: row.program
      ? { id: row.program.id, title: row.program.title, organizationName: row.program.organization.name }
      : null,
    links: fullAccess ? sortLinks(row.externalLinks).map(serializeLink) : [],
    verification:
      row._count.verifiedRecords > 0 && latest
        ? {
            count: row._count.verifiedRecords,
            issuer: row.program?.organization.name ?? null,
            verifiedAt: latest.evidence?.reviewedAt ?? latest.issuedAt,
          }
        : null,
    featured: featuredIds.includes(row.id),
  }
}

export type ProfileProjectCard = ReturnType<typeof serializeProjectCard>

async function featuredIdsOf(viewer: ProfileViewer) {
  const profile = await prisma.profile.findUnique({
    where: { id: viewer.profileId },
    select: { featuredProjectIds: true },
  })
  return profile?.featuredProjectIds ?? []
}

export async function listProfileProjects(
  viewer: ProfileViewer,
  options: { limit: number; cursor: SortKey | null; filter: ProfileProjectFilter },
) {
  const [rows, featuredIds] = await Promise.all([
    prisma.project.findMany({
      where: {
        AND: [visibleProjectsWhere(viewer, options.filter), keysetAfter('updatedAt', options.cursor) as Prisma.ProjectWhereInput],
      },
      orderBy: keysetOrder('updatedAt') as Prisma.ProjectOrderByWithRelationInput[],
      take: options.limit + 1,
      select: projectCardSelect(viewer),
    }),
    featuredIdsOf(viewer),
  ])
  const page = toPage(rows, options.limit, (row) => ({ v: row.updatedAt, id: row.id }))
  return { items: page.items.map((row) => serializeProjectCard(row, viewer, featuredIds)), nextCursor: page.nextCursor }
}

export async function getFeaturedProjects(viewer: ProfileViewer) {
  const featuredIds = await featuredIdsOf(viewer)
  if (featuredIds.length === 0) {
    const recent = await listProfileProjects(viewer, { limit: 2, cursor: null, filter: 'all' })
    return { mode: 'recent' as const, projects: recent.items }
  }
  const rows = await prisma.project.findMany({
    where: { AND: [visibleProjectsWhere(viewer), { id: { in: featuredIds } }] },
    select: projectCardSelect(viewer),
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  const projects = featuredIds
    .map((id) => byId.get(id))
    .filter((row): row is ProjectCardRow => Boolean(row))
    .map((row) => serializeProjectCard(row, viewer, featuredIds))
  return { mode: 'pinned' as const, projects }
}

/* --------------------------------- History -------------------------------- */

export const HISTORY_TYPES = ['all', 'verified', 'award', 'certificate', 'career', 'program', 'project'] as const
export type HistoryType = (typeof HISTORY_TYPES)[number]
type HistoryKind = Exclude<HistoryType, 'all' | 'verified'>
const HISTORY_KINDS: HistoryKind[] = ['award', 'certificate', 'career', 'program', 'project']

type Verification = {
  /** institution: organization approved submitted evidence · program: BAESH program completion · baesh: operator-confirmed */
  kind: 'institution' | 'program' | 'baesh'
  issuer: string | null
  label: string
  verifiedAt: Date | null
  programTitle?: string | null
  verifiedBy?: string | null
}

export type HistoryItem = {
  id: string
  sourceId: string
  kind: HistoryKind
  title: string
  subtitle: string | null
  description: string | null
  date: Date | null
  endDate: Date | null
  ongoing: boolean
  category: string | null
  status: string | null
  verification: Verification | null
  link: string | null
  project: { id: string; title: string; accessible: boolean } | null
  editable: boolean
  fields: Record<string, string | null> | null
}

type Entry = { key: SortKey; item: HistoryItem }
type SourceOptions = { cursor: SortKey | null; take: number; verifiedOnly: boolean }

const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

async function awardEntries(viewer: ProfileViewer, opts: SourceOptions): Promise<Entry[]> {
  if (opts.verifiedOnly) return []
  const rows = await prisma.award.findMany({
    where: { AND: [{ profileId: viewer.profileId }, keysetAfter('awardedAt', opts.cursor, true) as Prisma.AwardWhereInput] },
    orderBy: keysetOrder('awardedAt', true) as Prisma.AwardOrderByWithRelationInput[],
    take: opts.take,
  })
  return rows.map((row) => ({
    key: { v: row.awardedAt, id: row.id },
    item: {
      id: `award:${row.id}`,
      sourceId: row.id,
      kind: 'award',
      title: row.title,
      subtitle: row.issuer,
      description: row.description,
      date: row.awardedAt,
      endDate: null,
      ongoing: false,
      category: null,
      status: null,
      verification: null,
      link: null,
      project: null,
      editable: viewer.isSelf,
      fields: viewer.isSelf
        ? { title: row.title, issuer: row.issuer, awardedAt: iso(row.awardedAt), description: row.description }
        : null,
    },
  }))
}

async function certificateEntries(viewer: ProfileViewer, opts: SourceOptions): Promise<Entry[]> {
  const rows = await prisma.certificate.findMany({
    where: {
      AND: [
        { profileId: viewer.profileId, ...(opts.verifiedOnly ? { verified: true } : {}) },
        keysetAfter('issuedAt', opts.cursor, true) as Prisma.CertificateWhereInput,
      ],
    },
    orderBy: keysetOrder('issuedAt', true) as Prisma.CertificateOrderByWithRelationInput[],
    take: opts.take,
    include: { opportunity: { select: { type: true, organization: true } } },
  })
  return rows.map((row) => {
    const fromProgram = row.source === 'PROGRAM'
    const verification: Verification | null = !row.verified
      ? null
      : fromProgram
        ? { kind: 'program', issuer: row.opportunity?.organization ?? row.issuer, label: '수료 인증', verifiedAt: row.issuedAt }
        : { kind: 'baesh', issuer: 'BAESH', label: '확인', verifiedAt: null }
    const editable = viewer.isSelf && !fromProgram
    return {
      key: { v: row.issuedAt, id: row.id },
      item: {
        id: `certificate:${row.id}`,
        sourceId: row.id,
        kind: 'certificate',
        title: row.title,
        subtitle: row.issuer,
        description: null,
        date: row.issuedAt,
        endDate: null,
        ongoing: !row.issuedAt,
        category: row.opportunity?.type ?? null,
        status: fromProgram ? 'PROGRAM' : null,
        verification,
        link: row.credentialUrl,
        project: null,
        editable,
        fields: editable
          ? { title: row.title, issuer: row.issuer, issuedAt: iso(row.issuedAt), credentialUrl: row.credentialUrl }
          : null,
      },
    }
  })
}

async function careerEntries(viewer: ProfileViewer, opts: SourceOptions): Promise<Entry[]> {
  if (opts.verifiedOnly) return []
  const rows = await prisma.career.findMany({
    where: { AND: [{ profileId: viewer.profileId }, keysetAfter('startDate', opts.cursor, true) as Prisma.CareerWhereInput] },
    orderBy: keysetOrder('startDate', true) as Prisma.CareerOrderByWithRelationInput[],
    take: opts.take,
  })
  return rows.map((row) => ({
    key: { v: row.startDate, id: row.id },
    item: {
      id: `career:${row.id}`,
      sourceId: row.id,
      kind: 'career',
      title: row.position,
      subtitle: row.company,
      description: row.description,
      date: row.startDate,
      endDate: row.endDate,
      ongoing: !row.endDate,
      category: null,
      status: null,
      verification: null,
      link: null,
      project: null,
      editable: viewer.isSelf,
      fields: viewer.isSelf
        ? {
            company: row.company,
            position: row.position,
            startDate: iso(row.startDate),
            endDate: iso(row.endDate),
            description: row.description,
          }
        : null,
    },
  }))
}

function verifiedRecordWhere(viewer: ProfileViewer, verifiedOnly: boolean): Prisma.VerifiedRecordWhereInput {
  const statuses =
    viewer.isSelf && !verifiedOnly
      ? [VerifiedRecordStatus.VERIFIED, VerifiedRecordStatus.PENDING, VerifiedRecordStatus.REVOKED]
      : [VerifiedRecordStatus.VERIFIED]
  return {
    userId: viewer.userId,
    status: { in: statuses },
    ...(viewer.isSelf ? {} : { OR: [{ project: { visibility: ProjectVisibility.PUBLIC } }, { evidenceId: { not: null } }] }),
  }
}

async function projectRecordEntries(viewer: ProfileViewer, opts: SourceOptions): Promise<Entry[]> {
  const rows = await prisma.verifiedRecord.findMany({
    where: { AND: [verifiedRecordWhere(viewer, opts.verifiedOnly), keysetAfter('issuedAt', opts.cursor) as Prisma.VerifiedRecordWhereInput] },
    orderBy: keysetOrder('issuedAt') as Prisma.VerifiedRecordOrderByWithRelationInput[],
    take: opts.take,
    select: {
      id: true,
      role: true,
      contributionSummary: true,
      issuedAt: true,
      status: true,
      verifiedAt: true,
      snapshot: true,
      contentHash: true,
      revokedAt: true,
      revokeReason: true,
      organization: { select: { name: true } },
      program: { select: { title: true } },
      verifiedBy: { select: { name: true } },
      project: { select: { id: true, title: true, visibility: true, teamName: true } },
      evidence: {
        select: {
          title: true,
          description: true,
          activityDate: true,
          reviewedAt: true,
          project: { select: { program: { select: { title: true, organization: { select: { name: true } } } } } },
        },
      },
    },
  })
  return rows.map((row) => {
    // The frozen snapshot wins over live rows so later edits never change what was verified.
    const snapshot = readSnapshot(row.snapshot)
    const integrity = recordIntegrity(row)
    const liveProgram = row.evidence?.project.program ?? null
    const issuer = snapshot?.organization?.name ?? row.organization?.name ?? liveProgram?.organization.name ?? null
    const programTitle = snapshot?.program?.title ?? row.program?.title ?? liveProgram?.title ?? null
    const verified = row.status === VerifiedRecordStatus.VERIFIED && integrity !== 'tampered'
    const verification: Verification | null = !verified
      ? null
      : issuer
        ? {
            kind: 'institution',
            issuer,
            label: '승인',
            verifiedAt: row.verifiedAt ?? row.evidence?.reviewedAt ?? row.issuedAt,
            programTitle,
            verifiedBy: snapshot?.approvedBy?.name ?? row.verifiedBy?.name ?? null,
          }
        : { kind: 'baesh', issuer: null, label: '검증', verifiedAt: row.issuedAt }
    const projectTitle = snapshot?.project.title ?? row.project.title
    const teamName = snapshot ? snapshot.project.teamName : row.project.teamName
    return {
      key: { v: row.issuedAt, id: row.id },
      item: {
        id: `project:${row.id}`,
        sourceId: row.id,
        kind: 'project',
        title: snapshot?.evidence.title ?? row.evidence?.title ?? row.project.title,
        subtitle: [projectTitle, teamName, snapshot?.role ?? row.role].filter(Boolean).join(' · '),
        description:
          row.status === VerifiedRecordStatus.REVOKED && viewer.isSelf
            ? `승인 취소${row.revokeReason ? ` — ${row.revokeReason}` : ''}`
            : (snapshot?.evidence.description ?? row.evidence?.description ?? row.contributionSummary),
        date: snapshot ? new Date(snapshot.evidence.activityDate) : (row.evidence?.activityDate ?? row.issuedAt),
        endDate: null,
        ongoing: false,
        category: null,
        status: row.status,
        verification,
        link: null,
        project: {
          id: row.project.id,
          title: row.project.title,
          accessible: viewer.isSelf || row.project.visibility === ProjectVisibility.PUBLIC,
        },
        editable: false,
        fields: null,
      },
    }
  })
}

/**
 * Opportunity enrollments are few per user and their display date is derived from several columns,
 * so they are filtered in memory with the same keyset rules as the database-backed sources.
 */
async function programEntriesAll(viewer: ProfileViewer): Promise<Entry[]> {
  const [enrollments, programCertificates] = await Promise.all([
    prisma.opportunityEnrollment.findMany({
      where: {
        userId: viewer.userId,
        status: { in: [OpportunityEnrollmentStatus.ENROLLED, OpportunityEnrollmentStatus.COMPLETED] },
      },
      select: {
        id: true,
        opportunityId: true,
        status: true,
        appliedAt: true,
        enrolledAt: true,
        completedAt: true,
        certificateId: true,
        opportunity: { select: { title: true, organization: true, type: true } },
      },
    }),
    prisma.certificate.findMany({
      where: { profileId: viewer.profileId, source: 'PROGRAM', opportunityId: { not: null } },
      select: { opportunityId: true },
    }),
  ])
  const certifiedOpportunities = new Set(programCertificates.map((row) => row.opportunityId))

  return enrollments
    .filter(
      (row) =>
        row.status !== OpportunityEnrollmentStatus.COMPLETED ||
        !(row.certificateId || certifiedOpportunities.has(row.opportunityId)),
    )
    .map((row) => {
      const date = row.completedAt ?? row.enrolledAt ?? row.appliedAt
      const completed = row.status === OpportunityEnrollmentStatus.COMPLETED
      return {
        key: { v: date, id: row.id },
        item: {
          id: `program:${row.id}`,
          sourceId: row.id,
          kind: 'program' as const,
          title: row.opportunity.title,
          subtitle: row.opportunity.organization,
          description: null,
          date,
          endDate: row.completedAt,
          ongoing: !completed,
          category: row.opportunity.type,
          status: row.status,
          verification: completed
            ? { kind: 'program' as const, issuer: row.opportunity.organization, label: '수료', verifiedAt: row.completedAt }
            : null,
          link: null,
          project: null,
          editable: false,
          fields: null,
        },
      }
    })
    .sort((a, b) => compareSortKeys(a.key, b.key))
}

async function programEntries(viewer: ProfileViewer, opts: SourceOptions): Promise<Entry[]> {
  const all = await programEntriesAll(viewer)
  return all
    .filter((entry) => (!opts.verifiedOnly || entry.item.verification) && isAfterCursor(entry.key, opts.cursor))
    .slice(0, opts.take)
}

const SOURCES: Record<HistoryKind, (viewer: ProfileViewer, opts: SourceOptions) => Promise<Entry[]>> = {
  award: awardEntries,
  certificate: certificateEntries,
  career: careerEntries,
  program: programEntries,
  project: projectRecordEntries,
}

/** Each source returns its next `limit + 1` rows after the cursor; merging them yields the exact next page. */
export async function listProfileHistory(
  viewer: ProfileViewer,
  options: { type: HistoryType; limit: number; cursor: SortKey | null },
) {
  const kinds = options.type === 'all' || options.type === 'verified' ? HISTORY_KINDS : [options.type]
  const sourceOptions = { cursor: options.cursor, take: options.limit + 1, verifiedOnly: options.type === 'verified' }
  const batches = await Promise.all(kinds.map((kind) => SOURCES[kind](viewer, sourceOptions)))
  const merged = batches.flat().sort((a, b) => compareSortKeys(a.key, b.key))
  const page = toPage(merged, options.limit, (entry) => entry.key)
  return { items: page.items.map((entry) => entry.item), nextCursor: page.nextCursor }
}

export async function countProfileHistory(viewer: ProfileViewer) {
  const [award, certificate, career, project, verifiedCertificates, verifiedProjects, programs] = await Promise.all([
    prisma.award.count({ where: { profileId: viewer.profileId } }),
    prisma.certificate.count({ where: { profileId: viewer.profileId } }),
    prisma.career.count({ where: { profileId: viewer.profileId } }),
    prisma.verifiedRecord.count({ where: verifiedRecordWhere(viewer, false) }),
    prisma.certificate.count({ where: { profileId: viewer.profileId, verified: true } }),
    prisma.verifiedRecord.count({ where: verifiedRecordWhere(viewer, true) }),
    programEntriesAll(viewer),
  ])
  const program = programs.length
  const verifiedPrograms = programs.filter((entry) => entry.item.verification).length
  return {
    all: award + certificate + career + program + project,
    verified: verifiedCertificates + verifiedProjects + verifiedPrograms,
    award,
    certificate,
    career,
    program,
    project,
  }
}

/* -------------------------------- Overview -------------------------------- */

export function visiblePostsWhere(viewer: ProfileViewer): Prisma.PostWhereInput {
  if (viewer.isSelf) return { authorId: viewer.userId }
  return {
    authorId: viewer.userId,
    visibility: viewer.isFollowing ? { in: [PostVisibility.PUBLIC, PostVisibility.CONNECTIONS] } : PostVisibility.PUBLIC,
  }
}

export async function buildProfileOverview(viewer: ProfileViewer) {
  const details = viewer.canViewDetails
  const [user, profile, affiliations, followerCount, followingCount, postCount] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: viewer.userId },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true, coverUrl: true, createdAt: true },
    }),
    prisma.profile.findUniqueOrThrow({ where: { id: viewer.profileId } }),
    prisma.organizationMember.findMany({
      where: {
        userId: viewer.userId,
        status: OrganizationMemberStatus.ACTIVE,
        organization: { verificationStatus: OrganizationVerificationStatus.APPROVED },
      },
      orderBy: { joinedAt: 'asc' },
      select: { role: true, title: true, organization: { select: { id: true, name: true, type: true } } },
    }),
    prisma.userFollow.count({ where: { followingId: viewer.userId } }),
    prisma.userFollow.count({ where: { followerId: viewer.userId } }),
    details ? prisma.post.count({ where: visiblePostsWhere(viewer) }) : Promise.resolve(0),
  ])

  const [projectCount, historyCounts, featured, verifiedHighlights, recentHistory, skillProjects] = details
    ? await Promise.all([
        prisma.project.count({ where: visibleProjectsWhere(viewer) }),
        countProfileHistory(viewer),
        getFeaturedProjects(viewer),
        listProfileHistory(viewer, { type: 'verified', limit: 3, cursor: null }),
        listProfileHistory(viewer, { type: 'all', limit: 4, cursor: null }),
        prisma.project.findMany({
          where: visibleProjectsWhere(viewer),
          orderBy: { updatedAt: 'desc' },
          take: 30,
          select: { skills: true, status: true, progress: true },
        }),
      ])
    : [0, null, null, null, null, []]

  const { email: _email, ...publicUser } = user

  return {
    user: viewer.isSelf ? user : publicUser,
    profile: {
      headline: profile.headline,
      skills: profile.skills,
      school: profile.school,
      company: profile.company,
      bio: details ? profile.bio : null,
      location: details ? profile.location : null,
      interests: details ? profile.interests : [],
      socialLinks: details ? profile.socialLinks : null,
      ...(viewer.isSelf
        ? {
            visibility: profile.visibility,
            featuredProjectIds: profile.featuredProjectIds,
            talentSearchOptIn: profile.talentSearchOptIn,
          }
        : {}),
    },
    affiliations: affiliations.map((row) => ({
      organizationId: row.organization.id,
      name: row.organization.name,
      type: row.organization.type,
      title: row.title,
    })),
    stats: {
      followerCount,
      followingCount,
      postCount,
      projectCount,
      historyCount: historyCounts?.all ?? 0,
      verifiedCount: historyCounts?.verified ?? 0,
    },
    historyCounts,
    isFollowing: viewer.isFollowing,
    isOwnProfile: viewer.isSelf,
    canViewDetails: details,
    featuredProjects: featured?.projects ?? [],
    featuredMode: featured?.mode ?? 'recent',
    verifiedHighlights: verifiedHighlights?.items ?? [],
    recentHistory: recentHistory?.items ?? [],
    aiSkillInsights: details
      ? buildSkillInsights({
          profileSkills: profile.skills,
          trustScore: profile.trustScore,
          projects: skillProjects,
          verifiedCount: historyCounts?.verified ?? 0,
          certificateCount: historyCounts?.certificate ?? 0,
          completedProgramCount: historyCounts?.program ?? 0,
          careerCount: historyCounts?.career ?? 0,
        })
      : null,
  }
}
