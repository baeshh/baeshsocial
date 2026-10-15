import { Prisma, ProjectStatus, ProjectTaskStatus, ProjectVisibility } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { involvementWhere, shownOnProfileWhere } from '../../modules/profiles/profileData.js'
import { DEFAULT_OWNER_CONTRIBUTION, LEADER_ROLE_SLUGS } from '../../utils/projectPermissions.js'
import { readContributionSnapshot, readSnapshot, recordIntegrity, trustedRecordWhere } from '../verification/verifiedRecords.js'
import { scrubPii, sourceSet, truncate, type Source, type SourceSet } from './grounding.js'

const LINK_LABEL: Record<string, string> = {
  GITHUB: 'GitHub 저장소',
  FIGMA: 'Figma 디자인',
  NOTION: 'Notion 문서',
  GOOGLE_DRIVE: 'Google Drive 자료',
  DEPLOYMENT: '배포 서비스',
  OTHER: '외부 링크',
}

const STATUS_LABEL: Record<string, string> = {
  PLANNING: '기획 중',
  ACTIVE: '진행 중',
  COMPLETED: '완료',
  ARCHIVED: '보관',
}

const ym = (date: Date | null) => (date ? date.toISOString().slice(0, 7) : null)
const ymd = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)

function linkSummary(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.host}${parsed.pathname.replace(/\/$/, '')}`.slice(0, 120)
  } catch {
    return url.slice(0, 120)
  }
}

export type CareerProject = {
  ref: string
  projectId: string
  title: string
  role: string
  isProgramProject: boolean
  verifiedRefs: string[]
}

export type CareerSources = {
  sources: SourceSet
  projects: CareerProject[]
  profileSkills: string[]
}

/**
 * Live project content is read only where the user can still open it: their own personal projects and
 * projects they are on, minus PRIVATE projects a leader has not opened to them.
 */
function liveAccessWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { ownerId: userId, programId: null },
      { visibility: { not: ProjectVisibility.PRIVATE }, members: { some: { userId } } },
      { members: { some: { userId, OR: [{ privateAccess: true }, { projectRole: { slug: { in: LEADER_ROLE_SLUGS } } }] } } },
    ],
  }
}

type RecordRow = { projectId: string; snapshot: Prisma.JsonValue; contentHash: string | null; verifiedAt: Date | null }

/** Fields for a project the user can no longer open, taken only from the frozen snapshot of their own record. */
function snapshotProject(row: RecordRow) {
  const contribution = readContributionSnapshot(row.snapshot)
  if (contribution) {
    return {
      title: contribution.project.title,
      role: contribution.role,
      isProgramProject: true,
      text: [
        `소속: ${contribution.organization.name} · ${contribution.program.title}`,
        `역할: ${contribution.role}`,
        `기여: ${truncate(contribution.contribution, 300)}`,
        contribution.period.start || contribution.period.end
          ? `기간: ${contribution.period.start?.slice(0, 7) ?? '?'} ~ ${contribution.period.end?.slice(0, 7) ?? '?'}`
          : null,
        `기관 인증: ${contribution.approvedAt.slice(0, 10)}`,
      ],
    }
  }
  const snapshot = readSnapshot(row.snapshot)!
  return {
    title: snapshot.project.title,
    role: snapshot.role,
    isProgramProject: Boolean(snapshot.program),
    text: [
      snapshot.organization ? `소속: ${snapshot.organization.name}${snapshot.program ? ` · ${snapshot.program.title}` : ''}` : null,
      `역할: ${snapshot.role}`,
      `기관 승인: ${snapshot.approvedAt.slice(0, 10)}`,
    ],
  }
}

/**
 * Builds the source set for a user's own career features (portfolio, insights).
 *
 * - Projects count as the user's work under the profile rule: personal projects for their owner, program projects
 *   only for team members, never for the staff who created or manage them.
 * - Live content (description, links, the user's own tasks and activities) comes only from projects the user can
 *   open now; teammates are never named. By default archived projects and projects hidden from the profile stay out;
 *   a project the user explicitly picks is included if they worked on it.
 * - Verified items come from the user's own records — VERIFIED, with a snapshot whose hash still matches — whether
 *   or not they are still on the team. A project the user can no longer open is described only from that snapshot.
 */
export async function collectCareerSources(userId: string, options: { projectIds?: string[]; maxProjects?: number } = {}) {
  const maxProjects = options.maxProjects ?? 6
  const picked = options.projectIds?.length ? options.projectIds : null
  const liveScope: Prisma.ProjectWhereInput = picked
    ? { id: { in: picked } }
    : { status: { not: ProjectStatus.ARCHIVED }, ...shownOnProfileWhere(userId) }

  const recordRows = await prisma.verifiedRecord.findMany({
    where: { userId, ...trustedRecordWhere, ...(picked ? { projectId: { in: picked } } : { project: shownOnProfileWhere(userId) }) },
    orderBy: { verifiedAt: 'desc' },
    take: 40,
    select: { projectId: true, snapshot: true, contentHash: true, verifiedAt: true },
  })
  const recordsByProject = new Map<string, RecordRow[]>()
  for (const row of recordRows) {
    if (recordIntegrity(row) !== 'intact') continue
    recordsByProject.set(row.projectId, [...(recordsByProject.get(row.projectId) ?? []), row])
  }
  const recordProjectIds = [...recordsByProject.keys()]

  const liveWhere = (extra: Prisma.ProjectWhereInput): Prisma.ProjectWhereInput => ({
    AND: [involvementWhere(userId), liveAccessWhere(userId), liveScope, extra],
  })
  const projectSelect = {
    id: true,
    title: true,
    objective: true,
    description: true,
    status: true,
    progress: true,
    skills: true,
    startDate: true,
    endDate: true,
    ownerId: true,
    programId: true,
    members: { where: { userId }, select: { role: true, contribution: true, projectRole: { select: { name: true } } } },
    tasks: {
      where: { assigneeId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { title: true, status: true },
    },
    activities: {
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { title: true, description: true, createdAt: true, type: true },
    },
    externalLinks: { orderBy: { sortOrder: 'asc' }, take: 6, select: { type: true, label: true, url: true } },
  } satisfies Prisma.ProjectSelect
  const [recent, verifiedLive] = await Promise.all([
    prisma.project.findMany({ where: liveWhere({}), orderBy: { updatedAt: 'desc' }, take: maxProjects, select: projectSelect }),
    recordProjectIds.length
      ? prisma.project.findMany({ where: liveWhere({ id: { in: recordProjectIds } }), select: projectSelect })
      : Promise.resolve([]),
  ])
  const live = new Map([...recent, ...verifiedLive].map((project) => [project.id, project]))

  // Verified work first so the project limit never pushes an official record out.
  const verifiedIds = new Set(recordProjectIds)
  const ordered = [
    ...recordProjectIds,
    ...recent.map((project) => project.id).filter((id) => !verifiedIds.has(id)),
  ].slice(0, maxProjects)

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { headline: true, skills: true } })
  const list: Source[] = []
  const careerProjects: CareerProject[] = []
  let task = 0
  let activity = 0
  let link = 0
  let evidence = 0

  if (profile) {
    list.push({
      ref: 'PR1',
      kind: 'profile',
      label: '본인 입력 프로필',
      text: scrubPii(
        [profile.headline ? `소개: ${truncate(profile.headline, 160)}` : null, profile.skills.length ? `기술: ${profile.skills.join(', ')}` : null]
          .filter(Boolean)
          .join(' / ') || '프로필 정보 없음',
      ),
      verified: false,
    })
  }

  const verifiedSources = (projectId: string, records: RecordRow[]) => {
    const refs: string[] = []
    for (const row of records) {
      const contribution = readContributionSnapshot(row.snapshot)
      evidence += 1
      const evidenceRef = `E${evidence}`
      refs.push(evidenceRef)
      if (contribution) {
        list.push({
          ref: evidenceRef,
          kind: 'evidence',
          label: `기관 공식 인증 · ${contribution.organization.name} · ${contribution.program.title}`,
          projectId,
          verified: true,
          text: scrubPii(
            `역할 ${contribution.role} — ${truncate(contribution.contribution, 400)} (승인 증빙 ${contribution.approvedEvidence.length}건 근거, 인증 ${contribution.approvedAt.slice(0, 10)})`,
          ),
        })
        continue
      }
      const snapshot = readSnapshot(row.snapshot)!
      list.push({
        ref: evidenceRef,
        kind: 'evidence',
        label: `기관 검증 · ${snapshot.organization?.name ?? '기관'}${snapshot.program ? ` · ${snapshot.program.title}` : ''}`,
        projectId,
        verified: true,
        text: scrubPii(
          `${truncate(snapshot.evidence.title, 120)}${snapshot.evidence.description ? ` — ${truncate(snapshot.evidence.description, 400)}` : ''} (활동일 ${snapshot.evidence.activityDate.slice(0, 10)}, 승인 ${snapshot.approvedAt.slice(0, 10)}, 역할 ${snapshot.role})`,
        ),
      })
    }
    return refs
  }

  let doneTasks = 0
  ordered.forEach((projectId, index) => {
    const ref = `P${index + 1}`
    const project = live.get(projectId)
    const records = recordsByProject.get(projectId) ?? []
    if (!project) {
      const frozen = snapshotProject(records.find((row) => readContributionSnapshot(row.snapshot)) ?? records[0])
      list.push({
        ref,
        kind: 'project',
        label: frozen.title,
        projectId,
        verified: false,
        text: scrubPii(frozen.text.filter(Boolean).join(' / ')),
      })
      careerProjects.push({
        ref,
        projectId,
        title: frozen.title,
        role: frozen.role,
        isProgramProject: frozen.isProgramProject,
        verifiedRefs: verifiedSources(projectId, records),
      })
      return
    }
    const member = project.members[0]
    const isOwner = project.ownerId === userId && !project.programId
    const role = isOwner ? '프로젝트 리더' : (member?.role ?? member?.projectRole?.name ?? '팀원')
    const contribution =
      member?.contribution && member.contribution !== DEFAULT_OWNER_CONTRIBUTION ? truncate(member.contribution, 300) : null
    doneTasks += project.tasks.filter((row) => row.status === ProjectTaskStatus.DONE).length
    list.push({
      ref,
      kind: 'project',
      label: project.title,
      projectId: project.id,
      verified: false,
      text: scrubPii(
        [
          project.objective ? `목표: ${truncate(project.objective, 400)}` : null,
          project.description ? `설명: ${truncate(project.description, 500)}` : null,
          `역할: ${role}`,
          contribution ? `기여: ${contribution}` : null,
          `상태: ${STATUS_LABEL[project.status] ?? project.status}`,
          `진행률: ${project.progress}%`,
          project.skills.length ? `기술: ${project.skills.join(', ')}` : null,
          project.startDate || project.endDate ? `기간: ${ym(project.startDate) ?? '?'} ~ ${ym(project.endDate) ?? '진행 중'}` : null,
        ]
          .filter(Boolean)
          .join(' / '),
      ),
    })

    for (const row of project.tasks) {
      task += 1
      list.push({
        ref: `T${task}`,
        kind: 'task',
        label: `${project.title} 태스크`,
        projectId: project.id,
        verified: false,
        text: scrubPii(`${truncate(row.title, 160)} (${row.status === ProjectTaskStatus.DONE ? '완료' : row.status === ProjectTaskStatus.IN_PROGRESS ? '진행 중' : '예정'})`),
      })
    }
    for (const row of project.activities) {
      activity += 1
      list.push({
        ref: `A${activity}`,
        kind: 'activity',
        label: `${project.title} 활동 기록`,
        projectId: project.id,
        verified: false,
        text: scrubPii(`${truncate(row.title, 120)}${row.description ? ` — ${truncate(row.description, 300)}` : ''} (${ymd(row.createdAt)})`),
      })
    }
    for (const row of project.externalLinks) {
      link += 1
      list.push({
        ref: `L${link}`,
        kind: 'link',
        label: `${project.title} ${LINK_LABEL[row.type] ?? '외부 링크'}`,
        projectId: project.id,
        verified: false,
        url: row.url,
        text: `${LINK_LABEL[row.type] ?? '외부 링크'}${row.label ? ` "${truncate(row.label, 60)}"` : ''}: ${linkSummary(row.url)}`,
      })
    }
    careerProjects.push({
      ref,
      projectId: project.id,
      title: project.title,
      role,
      isProgramProject: Boolean(project.programId),
      verifiedRefs: verifiedSources(project.id, records),
    })
  })

  // Server-computed counts so the model can cite totals without inventing them.
  list.push({
    ref: 'F1',
    kind: 'fact',
    label: 'BAESH 집계(분석 범위 기준)',
    verified: false,
    text: `분석에 포함된 프로젝트 ${careerProjects.length}개 / 기관 검증 기록 ${evidence}건 / 완료한 담당 태스크 ${doneTasks}개 / 본인 활동 기록 ${activity}건 / 외부 산출물 링크 ${link}개`,
  })

  return { sources: sourceSet(list), projects: careerProjects, profileSkills: profile?.skills ?? [] } satisfies CareerSources
}
