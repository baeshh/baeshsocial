import { ProjectVisibility, RecordDisclosure, type Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { hiddenProjectsByUser } from '../../services/projects/profileDisplay.js'
import {
  disclosedRecordWhere,
  effectiveDisclosure,
  readContributionSnapshot,
  readSnapshot,
  trustedRecordWhere,
} from '../../services/verification/verifiedRecords.js'

export const SCORING_VERSION = 'rules-v1'

/** Initial weights are experimental assumptions; calibrate with recruiter feedback (MatchResult.feedback). */
export const WEIGHTS = { skills: 0.3, projects: 0.3, verified: 0.25, recency: 0.15 } as const

export const SCORING_BASIS = {
  skills: '요구 기술 중 후보가 보유한 비율. 공개 프로젝트·검증 기록으로 뒷받침된 기술은 1, 프로필에만 적힌 기술은 0.5로 계산',
  projects: '공개 프로젝트·검증된 프로젝트와 요구 기술·키워드의 관련도(최고 관련도 60% + 관련 프로젝트 수 40%, 3개 이상이면 만점)',
  verified: '요구 기술·키워드와 관련된 기관 검증 기록 수(3건 이상 만점, 관련 없는 검증 기록만 있으면 20%)',
  recency: '관련 활동의 최근성(90일 이내 1.0, 180일 0.7, 1년 0.4, 그 이전 0.1)',
} as const

export const searchCriteriaSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).min(1, '요구 기술을 1개 이상 입력하세요.').max(15),
  keywords: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  limit: z.number().int().min(1).max(50).default(20),
})
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>

const DAY = 24 * 60 * 60 * 1000
const MAX_CANDIDATES = 500

export const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s._-]+/g, '')

function variants(skill: string) {
  const trimmed = skill.trim()
  const lower = trimmed.toLowerCase()
  return [trimmed, lower, trimmed.toUpperCase(), lower.charAt(0).toUpperCase() + lower.slice(1)]
}

type CandidateProject = {
  id: string
  slug: string
  title: string
  text: string
  skills: string[]
  status: string
  lastActiveAt: Date
  source: 'public_project' | 'verified_project'
}

export type MatchEvidence = {
  matchedSkills: { skill: string; backedBy: string[] }[]
  missingSkills: string[]
  projects: { id: string; slug: string | null; title: string; relevance: number; matchedSkills: string[]; status: string; public: boolean }[]
  verified: { id: string; title: string; organization: string | null; program: string | null; projectTitle: string; verifiedAt: string; relevant: boolean }[]
  lastRelevantActivity: string | null
}

export type Breakdown = Record<keyof typeof WEIGHTS, { score: number; weight: number; points: number }>

export type ScoredCandidate = {
  userId: string
  score: number
  breakdown: Breakdown
  evidence: MatchEvidence
}

const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits

/** Same rule as the profile: PUBLIC counts for program projects only while the program allows public projects. */
const publicProjectWhere = {
  visibility: ProjectVisibility.PUBLIC,
  OR: [{ programId: null }, { program: { allowPublicProjects: true } }],
} satisfies Prisma.ProjectWhereInput

const projectFields = { id: true, slug: true, title: true, objective: true, description: true, skills: true, status: true, updatedAt: true } as const

/**
 * Only consented, shareable data: the profile skills of candidates who opted in to talent search, the PUBLIC
 * projects they worked on (program projects owned by staff are not the staff's own work), and their trusted
 * (intact, non-revoked) verified records the student and program disclose. Nothing else is read.
 */
const candidateSelect = {
  id: true,
  profile: { select: { skills: true } },
  ownedProjects: { where: { AND: [publicProjectWhere, { programId: null }] }, select: projectFields },
  projectMemberships: { where: { project: publicProjectWhere }, select: { project: { select: projectFields } } },
  verifiedRecords: {
    where: { AND: [trustedRecordWhere, disclosedRecordWhere] },
    orderBy: { verifiedAt: 'desc' },
    take: 30,
    select: {
      id: true,
      snapshot: true,
      verifiedAt: true,
      disclosure: true,
      program: { select: { recordDisclosure: true } },
      project: { select: { id: true, skills: true, visibility: true, slug: true } },
    },
  },
} satisfies Prisma.UserSelect

/** Projects a candidate hid from their profile are dropped together with the records on them. */
async function loadShareable(where: Prisma.UserWhereInput) {
  const candidates = await prisma.user.findMany({ where: { AND: [where, { profile: { talentSearchOptIn: true } }] }, take: MAX_CANDIDATES, select: candidateSelect })
  const hidden = await hiddenProjectsByUser(candidates.map((candidate) => candidate.id))
  return candidates.map((candidate) => {
    const hiddenIds = hidden.get(candidate.id)
    if (!hiddenIds) return candidate
    return {
      ...candidate,
      ownedProjects: candidate.ownedProjects.filter((project) => !hiddenIds.has(project.id)),
      projectMemberships: candidate.projectMemberships.filter((membership) => !hiddenIds.has(membership.project.id)),
      verifiedRecords: candidate.verifiedRecords.filter((record) => !hiddenIds.has(record.project.id)),
    }
  })
}

function loadCandidates(criteria: SearchCriteria, excludeUserIds: string[]) {
  const skillVariants = [...new Set(criteria.skills.flatMap(variants))]
  const publicWithSkills = { AND: [publicProjectWhere, { skills: { hasSome: skillVariants } }] }
  return loadShareable({
    id: { notIn: excludeUserIds },
    OR: [
      { profile: { skills: { hasSome: skillVariants } } },
      { ownedProjects: { some: { AND: [publicWithSkills, { programId: null }] } } },
      { projectMemberships: { some: { project: publicWithSkills } } },
      {
        verifiedRecords: {
          some: { AND: [trustedRecordWhere, disclosedRecordWhere, { project: { skills: { hasSome: skillVariants } } }] },
        },
      },
    ],
  })
}

/** The current shareable data of specific candidates, for re-checking stored results. Opted-out users are absent. */
export function loadShareableCandidates(userIds: string[]) {
  return userIds.length ? loadShareable({ id: { in: userIds } }) : Promise.resolve([])
}

export type LoadedCandidate = Awaited<ReturnType<typeof loadShareable>>[number]

type SharedRecordView = {
  evidence: { title: string; description: string | null }
  project: { title: string }
  organization: { name: string } | null
  program: { title: string } | null
  approvedAt: string
}

/**
 * What a recruiter may read from one verified record: SUMMARY exposes only the verified project,
 * affiliation and role; FULL also exposes the evidence or contribution text.
 */
function sharedRecordView(record: LoadedCandidate['verifiedRecords'][number]): SharedRecordView | null {
  const full = effectiveDisclosure(record.disclosure, record.program?.recordDisclosure) === RecordDisclosure.FULL
  const contribution = readContributionSnapshot(record.snapshot)
  if (contribution) {
    return {
      evidence: {
        title: full ? `${contribution.role} · ${contribution.project.title}` : `${contribution.project.title} (${contribution.role})`,
        description: full ? contribution.contribution : null,
      },
      project: { title: contribution.project.title },
      organization: contribution.organization,
      program: contribution.program,
      approvedAt: contribution.approvedAt,
    }
  }
  const snapshot = readSnapshot(record.snapshot)
  if (!snapshot) return null
  return {
    evidence: full
      ? { title: snapshot.evidence.title, description: snapshot.evidence.description }
      : { title: `${snapshot.project.title} 활동 증빙 (${snapshot.role})`, description: null },
    project: { title: snapshot.project.title },
    organization: snapshot.organization,
    program: snapshot.program,
    approvedAt: snapshot.approvedAt,
  }
}

/** Everything a stored result may still mention about this candidate today. */
export function shareableNow(candidate: LoadedCandidate) {
  const publicProjects = [...candidate.ownedProjects, ...candidate.projectMemberships.map((membership) => membership.project)]
  const records = candidate.verifiedRecords
    .map((record) => ({ record, view: sharedRecordView(record) }))
    .filter((row): row is { record: (typeof candidate.verifiedRecords)[number]; view: SharedRecordView } => Boolean(row.view))
  return {
    publicProjectIds: new Set(publicProjects.map((project) => project.id)),
    projectIds: new Set([...publicProjects.map((project) => project.id), ...records.map(({ record }) => record.project.id)]),
    recordIds: new Set(records.map(({ record }) => record.id)),
    titles: new Set([...publicProjects.map((project) => project.title), ...records.map(({ view }) => view.project.title)]),
    profileSkills: new Set((candidate.profile?.skills ?? []).map(normalize)),
  }
}

export function scoreCandidate(candidate: LoadedCandidate, criteria: SearchCriteria, now: Date): ScoredCandidate {
  const required = criteria.skills.map((skill) => ({ skill, key: normalize(skill) }))
  const keywords = criteria.keywords.map((k) => k.toLowerCase())
  const profileSkills = new Set((candidate.profile?.skills ?? []).map(normalize))

  const projects = new Map<string, CandidateProject>()
  for (const project of [...candidate.ownedProjects, ...candidate.projectMemberships.map((m) => m.project)]) {
    projects.set(project.id, {
      id: project.id,
      slug: project.slug,
      title: project.title,
      text: `${project.title} ${project.objective ?? ''} ${project.description ?? ''}`.toLowerCase(),
      skills: project.skills,
      status: project.status.toLowerCase(),
      lastActiveAt: project.updatedAt,
      source: 'public_project',
    })
  }

  const verified = candidate.verifiedRecords
    .map((record) => ({ record, snapshot: sharedRecordView(record) }))
    .filter((row): row is { record: (typeof candidate.verifiedRecords)[number]; snapshot: SharedRecordView } => Boolean(row.snapshot))
    .map(({ record, snapshot }) => {
      const text = `${snapshot.evidence.title} ${snapshot.evidence.description ?? ''} ${snapshot.project.title}`.toLowerCase()
      const skillHits = record.project.skills.filter((s) => required.some((r) => r.key === normalize(s)))
      const keywordHits = keywords.filter((k) => text.includes(k))
      if (!projects.has(record.project.id)) {
        projects.set(record.project.id, {
          id: record.project.id,
          slug: record.project.slug,
          title: snapshot.project.title,
          text: `${snapshot.project.title} ${snapshot.evidence.title}`.toLowerCase(),
          skills: record.project.skills,
          status: 'verified',
          lastActiveAt: record.verifiedAt ?? new Date(snapshot.approvedAt),
          source: 'verified_project',
        })
      }
      return {
        id: record.id,
        title: snapshot.evidence.title,
        organization: snapshot.organization?.name ?? null,
        program: snapshot.program?.title ?? null,
        projectTitle: snapshot.project.title,
        projectId: record.project.id,
        verifiedAt: (record.verifiedAt ?? new Date(snapshot.approvedAt)).toISOString(),
        relevant: skillHits.length > 0 || keywordHits.length > 0,
      }
    })

  // Skills: project/verified-backed = 1, profile-only = 0.5.
  const projectSkillOwners = new Map<string, string[]>()
  for (const project of projects.values()) {
    for (const skill of project.skills) {
      const key = normalize(skill)
      projectSkillOwners.set(key, [...(projectSkillOwners.get(key) ?? []), project.title])
    }
  }
  let skillPoints = 0
  const matchedSkills: MatchEvidence['matchedSkills'] = []
  const missingSkills: string[] = []
  for (const { skill, key } of required) {
    const backedBy = projectSkillOwners.get(key)
    if (backedBy?.length) {
      skillPoints += 1
      matchedSkills.push({ skill, backedBy: [...new Set(backedBy)].slice(0, 3) })
    } else if (profileSkills.has(key)) {
      skillPoints += 0.5
      matchedSkills.push({ skill, backedBy: ['프로필'] })
    } else {
      missingSkills.push(skill)
    }
  }
  const skillsScore = skillPoints / required.length

  // Related projects.
  const denominator = required.length + keywords.length
  const projectRows = [...projects.values()]
    .map((project) => {
      const matched = project.skills.filter((s) => required.some((r) => r.key === normalize(s)))
      const keywordHits = keywords.filter((k) => project.text.includes(k)).length
      return { project, matched, relevance: round((new Set(matched.map(normalize)).size + keywordHits) / denominator) }
    })
    .sort((a, b) => b.relevance - a.relevance)
  const relevantProjects = projectRows.filter((row) => row.relevance > 0)
  const projectsScore = relevantProjects.length
    ? 0.6 * relevantProjects[0].relevance + 0.4 * Math.min(1, relevantProjects.length / 3)
    : 0

  // Verified achievements.
  const relevantVerified = verified.filter((v) => v.relevant).length
  const verifiedScore = relevantVerified ? Math.min(1, relevantVerified / 3) : verified.length ? 0.2 : 0

  // Recency of the most recent relevant activity.
  const dates = [
    ...relevantProjects.map((row) => row.project.lastActiveAt.getTime()),
    ...verified.filter((v) => v.relevant).map((v) => new Date(v.verifiedAt).getTime()),
  ]
  const latest = dates.length ? Math.max(...dates) : null
  const ageDays = latest === null ? null : (now.getTime() - latest) / DAY
  const recencyScore = ageDays === null ? 0 : ageDays <= 90 ? 1 : ageDays <= 180 ? 0.7 : ageDays <= 365 ? 0.4 : 0.1

  const parts = { skills: skillsScore, projects: projectsScore, verified: verifiedScore, recency: recencyScore }
  const breakdown = Object.fromEntries(
    Object.entries(parts).map(([key, score]) => {
      const weight = WEIGHTS[key as keyof typeof WEIGHTS]
      return [key, { score: round(score), weight, points: round(score * weight * 100, 1) }]
    }),
  ) as Breakdown

  return {
    userId: candidate.id,
    score: Math.round(Object.values(breakdown).reduce((sum, part) => sum + part.score * part.weight * 100, 0)),
    breakdown,
    evidence: {
      matchedSkills,
      missingSkills,
      projects: projectRows.slice(0, 5).map((row) => ({
        id: row.project.id,
        slug: row.project.source === 'public_project' ? row.project.slug : null,
        title: row.project.title,
        relevance: row.relevance,
        matchedSkills: row.matched,
        status: row.project.status,
        public: row.project.source === 'public_project',
      })),
      verified: verified
        .sort((a, b) => Number(b.relevant) - Number(a.relevant) || b.verifiedAt.localeCompare(a.verifiedAt))
        .slice(0, 6)
        .map(({ projectId: _projectId, ...rest }) => rest),
      lastRelevantActivity: latest === null ? null : new Date(latest).toISOString(),
    },
  }
}

export async function rankCandidates(criteria: SearchCriteria, excludeUserIds: string[]) {
  const candidates = await loadCandidates(criteria, excludeUserIds)
  const now = new Date()
  return candidates
    .map((candidate) => scoreCandidate(candidate, criteria, now))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.breakdown.verified.score - a.breakdown.verified.score)
    .slice(0, criteria.limit)
}
