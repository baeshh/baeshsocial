import { ProjectTaskStatus } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { DEFAULT_OWNER_CONTRIBUTION } from '../../utils/projectPermissions.js'
import { readContributionSnapshot, readSnapshot, trustedRecordWhere } from '../verification/verifiedRecords.js'
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
 * Builds the source set for a user's own career features (portfolio, insights). Only the user's
 * own projects, assigned tasks and activities are included; teammates are never named, and the
 * only items marked verified are institution-approved records with an intact snapshot.
 */
export async function collectCareerSources(userId: string, options: { projectIds?: string[]; maxProjects?: number } = {}) {
  const maxProjects = options.maxProjects ?? 6
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      status: { not: 'ARCHIVED' },
      // Projects hidden from the profile stay out unless the user picks them explicitly.
      ...(options.projectIds?.length ? { id: { in: options.projectIds } } : { displayPreferences: { none: { userId } } }),
    },
    orderBy: { updatedAt: 'desc' },
    take: maxProjects,
    select: {
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
      verifiedRecords: {
        where: { userId, ...trustedRecordWhere },
        orderBy: { verifiedAt: 'desc' },
        take: 8,
        select: { snapshot: true, verifiedAt: true },
      },
    },
  })

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

  projects.forEach((project, index) => {
    const ref = `P${index + 1}`
    const member = project.members[0]
    const isOwner = project.ownerId === userId && !project.programId
    const role = isOwner ? '프로젝트 리더' : (member?.role ?? member?.projectRole?.name ?? '팀원')
    const contribution =
      member?.contribution && member.contribution !== DEFAULT_OWNER_CONTRIBUTION ? truncate(member.contribution, 300) : null
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
    const verifiedRefs: string[] = []
    for (const row of project.verifiedRecords) {
      const contribution = readContributionSnapshot(row.snapshot)
      if (contribution) {
        evidence += 1
        const contributionRef = `E${evidence}`
        verifiedRefs.push(contributionRef)
        list.push({
          ref: contributionRef,
          kind: 'evidence',
          label: `기관 공식 인증 · ${contribution.organization.name} · ${contribution.program.title}`,
          projectId: project.id,
          verified: true,
          text: scrubPii(
            `역할 ${contribution.role} — ${truncate(contribution.contribution, 400)} (승인 증빙 ${contribution.approvedEvidence.length}건 근거, 인증 ${contribution.approvedAt.slice(0, 10)})`,
          ),
        })
        continue
      }
      const snapshot = readSnapshot(row.snapshot)
      if (!snapshot) continue
      evidence += 1
      const evidenceRef = `E${evidence}`
      verifiedRefs.push(evidenceRef)
      list.push({
        ref: evidenceRef,
        kind: 'evidence',
        label: `기관 검증 · ${snapshot.organization?.name ?? '기관'}${snapshot.program ? ` · ${snapshot.program.title}` : ''}`,
        projectId: project.id,
        verified: true,
        text: scrubPii(
          `${truncate(snapshot.evidence.title, 120)}${snapshot.evidence.description ? ` — ${truncate(snapshot.evidence.description, 400)}` : ''} (활동일 ${snapshot.evidence.activityDate.slice(0, 10)}, 승인 ${snapshot.approvedAt.slice(0, 10)}, 역할 ${snapshot.role})`,
        ),
      })
    }
    careerProjects.push({ ref, projectId: project.id, title: project.title, role, isProgramProject: Boolean(project.programId), verifiedRefs })
  })

  // Server-computed counts so the model can cite totals without inventing them.
  const doneTasks = projects.reduce((sum, p) => sum + p.tasks.filter((t) => t.status === ProjectTaskStatus.DONE).length, 0)
  list.push({
    ref: 'F1',
    kind: 'fact',
    label: 'BAESH 집계(분석 범위 기준)',
    verified: false,
    text: `분석에 포함된 프로젝트 ${projects.length}개 / 기관 검증 기록 ${evidence}건 / 완료한 담당 태스크 ${doneTasks}개 / 본인 활동 기록 ${activity}건 / 외부 산출물 링크 ${link}개`,
  })

  return { sources: sourceSet(list), projects: careerProjects, profileSkills: profile?.skills ?? [] } satisfies CareerSources
}
