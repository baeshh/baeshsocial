import { AIAnalysisType } from '@prisma/client'
import { z } from 'zod'
import type { CareerSources } from '../careerSources.js'
import {
  checkFreeText,
  groundClaims,
  numberSet,
  sourcesForPrompt,
  type Claim,
  type GroundedClaim,
  type GroundingIssue,
  type Source,
  type SourceSet,
} from '../grounding.js'
import type { AiTask } from '../runner.js'

const claim = z.object({
  text: z.string().trim().min(1).max(400),
  sourceRefs: z.array(z.string().max(12)).max(8).default([]),
})

const portfolioSchema = z.object({
  headline: z.string().trim().min(1).max(160),
  resumeSummary: z.array(claim).max(5).default([]),
  projects: z
    .array(
      z.object({
        projectRef: z.string().max(12),
        intro: claim,
        role: claim,
        contributions: z.array(claim).max(6).default([]),
        process: z.array(claim).max(5).default([]),
        technicalResults: z.array(claim).max(5).default([]),
        outcomes: z.array(claim).max(5).default([]),
      }),
    )
    .max(6),
  skills: z
    .array(z.object({ name: z.string().trim().min(1).max(40), sourceRefs: z.array(z.string().max(12)).max(6).default([]) }))
    .max(12)
    .default([]),
})

export type PortfolioDraft = z.infer<typeof portfolioSchema>

type PortfolioProject = {
  ref: string
  projectId: string
  title: string
  role: string
  isProgramProject: boolean
  intro: GroundedClaim | null
  roleSummary: GroundedClaim | null
  contributions: GroundedClaim[]
  process: GroundedClaim[]
  technicalResults: GroundedClaim[]
  outcomes: GroundedClaim[]
  verifiedEvidence: { ref: string; label: string; text: string }[]
  links: { ref: string; label: string; url: string }[]
}

export type PortfolioResult = {
  headline: string
  resumeSummary: GroundedClaim[]
  projects: PortfolioProject[]
  skills: { name: string; sourceRefs: string[]; verified: boolean }[]
  sources: Source[]
  stats: { projects: number; verifiedClaims: number; totalClaims: number; droppedClaims: number }
}

const FIELDS = ['contributions', 'process', 'technicalResults', 'outcomes'] as const

function projectScope(sources: SourceSet, projectId: string): SourceSet {
  return new Map([...sources].filter(([, source]) => source.projectId === projectId || source.kind === 'profile' || source.kind === 'fact'))
}

function byKind(sources: SourceSet, projectId: string, kind: Source['kind']) {
  return [...sources.values()].filter((source) => source.projectId === projectId && source.kind === kind)
}

function mockPortfolio(input: CareerSources): PortfolioDraft {
  const { sources, projects } = input
  const skills = new Map<string, string[]>()
  const draftProjects = projects.map((project) => {
    const projectSource = sources.get(project.ref)!
    const fields = Object.fromEntries(projectSource.text.split(' / ').map((part) => {
      const [key, ...rest] = part.split(': ')
      return [key, rest.join(': ')]
    }))
    const tasks = byKind(sources, project.projectId, 'task')
    const activities = byKind(sources, project.projectId, 'activity')
    const links = byKind(sources, project.projectId, 'link')
    const evidence = byKind(sources, project.projectId, 'evidence')
    for (const skill of (fields['기술'] ?? '').split(', ').filter(Boolean)) {
      skills.set(skill, [...(skills.get(skill) ?? []), project.ref])
    }
    const intro = fields['목표'] ?? fields['설명'] ?? `${project.title} 프로젝트`
    return {
      projectRef: project.ref,
      intro: { text: `${project.title}: ${intro}`, sourceRefs: [project.ref] },
      role: {
        text: fields['기여'] ? `${project.role} 역할로 참여해 ${fields['기여']}` : `${project.role} 역할로 참여했습니다.`,
        sourceRefs: [project.ref],
      },
      contributions: tasks.slice(0, 5).map((task) => ({
        text: task.text.endsWith('(완료)') ? `${task.text.replace(/ \(완료\)$/, '')} 업무를 완료했습니다.` : `${task.text.replace(/ \([^)]*\)$/, '')} 업무를 맡았습니다.`,
        sourceRefs: [task.ref],
      })),
      process: activities.slice(0, 4).map((activity) => ({ text: activity.text.replace(/ \(\d{4}-\d{2}-\d{2}\)$/, ''), sourceRefs: [activity.ref] })),
      technicalResults: links.slice(0, 4).map((link) => ({ text: `${link.text}로 산출물을 공개했습니다.`, sourceRefs: [link.ref] })),
      outcomes: [
        ...evidence.slice(0, 4).map((item) => ({
          text: `${item.label.replace(/^기관 검증 · /, '')}에서 검증한 활동: ${item.text.split(' (활동일')[0]}`,
          sourceRefs: [item.ref],
        })),
        ...(fields['상태'] === '완료' ? [{ text: `${project.title} 프로젝트를 완료했습니다.`, sourceRefs: [project.ref] }] : []),
      ],
    }
  })
  const verifiedRefs = projects.flatMap((project) => project.verifiedRefs)
  const roles = [...new Set(projects.map((project) => project.role))].slice(0, 2).join('·')
  const topSkills = [...skills.keys()].slice(0, 3)
  return {
    headline: topSkills.length
      ? `${topSkills.join(', ')} 기반 프로젝트를 ${roles || '팀원'} 역할로 수행한 경험을 정리한 포트폴리오`
      : `${roles || '팀원'} 역할로 수행한 프로젝트 경험을 정리한 포트폴리오`,
    resumeSummary: [
      ...projects.slice(0, 3).map((project) => ({ text: `${project.title}에서 ${project.role} 역할을 수행했습니다.`, sourceRefs: [project.ref] })),
      ...(verifiedRefs.length ? [{ text: '기관 담당자가 승인한 활동 증빙을 보유하고 있습니다.', sourceRefs: verifiedRefs.slice(0, 4) }] : []),
    ],
    projects: draftProjects,
    skills: [...skills.entries()].slice(0, 10).map(([name, refs]) => ({ name, sourceRefs: refs })),
  }
}

function groundPortfolio(draft: PortfolioDraft, input: CareerSources) {
  const { sources, projects } = input
  const issues: GroundingIssue[] = []
  const allNumbers = numberSet([...sources.values()].map((source) => `${source.label} ${source.text}`))
  let total = 0

  const keep = (claims: Claim[], scope: SourceSet, path: string) => {
    total += claims.length
    const result = groundClaims(claims, scope, path)
    issues.push(...result.issues)
    return result.kept
  }

  const resultProjects: PortfolioProject[] = []
  draft.projects.forEach((entry, index) => {
    const project = projects.find((item) => item.ref === entry.projectRef)
    const path = `projects[${index}]`
    if (!project || resultProjects.some((item) => item.ref === project.ref)) {
      issues.push({ path, text: entry.projectRef, reason: 'unknown_source', detail: '제공되지 않은 프로젝트' })
      return
    }
    const scope = projectScope(sources, project.projectId)
    const [intro] = keep([entry.intro], scope, `${path}.intro`)
    const [roleSummary] = keep([entry.role], scope, `${path}.role`)
    const grounded = Object.fromEntries(FIELDS.map((field) => [field, keep(entry[field], scope, `${path}.${field}`)])) as Record<
      (typeof FIELDS)[number],
      GroundedClaim[]
    >
    resultProjects.push({
      ref: project.ref,
      projectId: project.projectId,
      title: project.title,
      role: project.role,
      isProgramProject: project.isProgramProject,
      intro: intro ?? null,
      roleSummary: roleSummary ?? null,
      ...grounded,
      verifiedEvidence: project.verifiedRefs.map((ref) => {
        const source = sources.get(ref)!
        return { ref, label: source.label, text: source.text }
      }),
      links: byKind(sources, project.projectId, 'link').map((source) => ({ ref: source.ref, label: source.label, url: source.url ?? '' })),
    })
  })

  const resumeSummary = keep(draft.resumeSummary, sources, 'resumeSummary')
  const headlineIssue = checkFreeText(draft.headline, 'headline', allNumbers)
  if (headlineIssue) issues.push(headlineIssue)

  const skills = draft.skills
    .map((skill) => {
      const refs = skill.sourceRefs.filter((ref) => sources.has(ref))
      const mentioned = refs.filter((ref) => sources.get(ref)!.text.toLowerCase().includes(skill.name.toLowerCase()))
      return { name: skill.name, sourceRefs: mentioned, verified: mentioned.some((ref) => sources.get(ref)!.verified) }
    })
    .filter((skill, index) => {
      if (skill.sourceRefs.length > 0) return true
      issues.push({ path: `skills[${index}]`, text: skill.name, reason: 'no_source', detail: '근거 자료에 없는 기술' })
      return false
    })

  const allClaims = [
    ...resumeSummary,
    ...resultProjects.flatMap((p) => [p.intro, p.roleSummary, ...FIELDS.flatMap((f) => p[f])].filter(Boolean) as GroundedClaim[]),
  ]
  const result: PortfolioResult = {
    headline: headlineIssue ? `${[...new Set(projects.map((p) => p.role))].join('·') || '팀원'} 역할로 수행한 프로젝트 경험` : draft.headline,
    resumeSummary,
    projects: resultProjects,
    skills,
    sources: [...sources.values()],
    stats: {
      projects: resultProjects.length,
      verifiedClaims: allClaims.filter((c) => c.verified).length,
      totalClaims: allClaims.length,
      droppedClaims: total - allClaims.length,
    },
  }
  return { output: result, issues }
}

export const portfolioTask: AiTask<CareerSources, PortfolioDraft, PortfolioResult> = {
  feature: 'portfolio',
  analysisType: AIAnalysisType.PORTFOLIO_GENERATOR,
  promptVersion: 'portfolio-v1',
  schema: portfolioSchema,
  maxTokens: 2800,
  temperature: 0.3,
  instructions: [
    '너는 BAESH의 포트폴리오 작성 도우미다. 사용자가 BAESH에 기록한 프로젝트 데이터만으로 채용 담당자가 읽을 포트폴리오 초안을 쓴다.',
    '- intro: 프로젝트 소개(목표·설명 기반), role: 담당 업무와 기여, contributions: 맡은 업무, process: 수행 과정(활동 기록 기반),',
    '  technicalResults: 외부 산출물(GitHub·배포 등) 기반 기술적 결과, outcomes: 결과 중심 문장(검증된 증빙·완료 상태 기반).',
    '- 각 프로젝트 섹션의 sourceRefs에는 그 프로젝트에 속한 source만 사용한다.',
    '- 데이터가 부족한 항목은 빈 배열로 둔다. 추측으로 채우지 않는다.',
    '- resumeSummary는 이력서에 붙일 2~4개의 한 줄 요약이다.',
  ].join('\n'),
  outputFormat: `{
  "headline": "한 줄 소개(숫자 사용 시 sources에 있는 값만)",
  "resumeSummary": [{ "text": "...", "sourceRefs": ["P1"] }],
  "projects": [{
    "projectRef": "P1",
    "intro": { "text": "...", "sourceRefs": ["P1"] },
    "role": { "text": "...", "sourceRefs": ["P1"] },
    "contributions": [{ "text": "...", "sourceRefs": ["T1"] }],
    "process": [{ "text": "...", "sourceRefs": ["A1"] }],
    "technicalResults": [{ "text": "...", "sourceRefs": ["L1"] }],
    "outcomes": [{ "text": "...", "sourceRefs": ["E1"] }]
  }],
  "skills": [{ "name": "React", "sourceRefs": ["P1"] }]
}`,
  buildPayload: (input) => ({
    task: 'portfolio',
    projects: input.projects.map((project) => ({ ref: project.ref, title: project.title, role: project.role })),
    sources: sourcesForPrompt(input.sources),
  }),
  mock: mockPortfolio,
  ground: groundPortfolio,
}
