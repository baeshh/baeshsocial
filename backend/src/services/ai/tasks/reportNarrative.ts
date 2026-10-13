import { AIAnalysisType } from '@prisma/client'
import { z } from 'zod'
import type { ReportSnapshot } from '../../../modules/reports/reportData.js'
import { groundClaims, scrubPii, sourceSet, sourcesForPrompt, truncate, type GroundedClaim, type GroundingIssue, type Source } from '../grounding.js'
import type { AiTask } from '../runner.js'

const claim = z.object({
  text: z.string().trim().min(1).max(400),
  sourceRefs: z.array(z.string().max(12)).max(8).default([]),
})

const narrativeSchema = z.object({
  overview: z.array(claim).max(4).default([]),
  programs: z.array(z.object({ programRef: z.string().max(12), summary: z.array(claim).max(3).default([]) })).max(30).default([]),
  highlights: z.array(claim).max(6).default([]),
  evaluation: z.array(claim).max(4).default([]),
  improvements: z.array(claim).max(4).default([]),
})

type NarrativeDraft = z.infer<typeof narrativeSchema>

export type ReportNarrative = {
  overview: GroundedClaim[]
  programs: { programId: string; summary: GroundedClaim[] }[]
  highlights: GroundedClaim[]
  evaluation: GroundedClaim[]
  improvements: GroundedClaim[]
}

export type ReportNarrativeInput = { snapshot: ReportSnapshot; sources: Map<string, Source>; programRefs: Map<string, string> }

const fmt = (value: number | null, unit = '%') => (value === null ? '산출 불가' : `${value}${unit}`)
const day = (iso: string) => iso.slice(0, 10)

/** Server-computed facts are the only place numbers can come from. Student names are never sent. */
export function buildNarrativeInput(snapshot: ReportSnapshot): ReportNarrativeInput {
  const { kpis } = snapshot
  const m = kpis.totals.metrics
  const c = kpis.totals.counts
  const list: Source[] = [
    {
      ref: 'G1',
      kind: 'fact',
      label: '전체 집계(PostgreSQL)',
      verified: false,
      text: [
        `기간 ${day(snapshot.period.from)} ~ ${day(snapshot.period.to)}`,
        `운영 프로그램 ${c.programs}개`,
        `운영 프로젝트 ${c.projects}개`,
        `완료 프로젝트 ${c.completedProjects}개`,
        `등록 학생(중복 제외) ${c.uniqueStudents}명`,
        `기간 내 참여 학생 ${c.activeStudents}명`,
        `프로젝트 완료율 ${fmt(m.projectCompletionRate.value)}`,
        `학생 참여율 ${fmt(m.participationRate.value)}`,
        `활동 제출률 ${fmt(m.submissionRate.value)}`,
        `증빙 승인율 ${fmt(m.approvalRate.value)}`,
        `평균 진행률 ${fmt(m.averageProgress.value)}`,
        `승인 증빙 ${c.approvedEvidence}건`,
        `반려 증빙 ${c.rejectedEvidence}건`,
        `검토 대기 증빙 ${c.pendingEvidence}건`,
        `검증 기록 발급 ${kpis.totals.verifiedRecordsIssued}건`,
        m.goalAchievementRate.denominator
          ? `목표가 설정된 KPI ${m.goalAchievementRate.denominator}개 중 ${m.goalAchievementRate.numerator}개 달성(${fmt(m.goalAchievementRate.value)})`
          : 'KPI 목표 미설정',
      ].join(' / '),
    },
  ]
  const programRefs = new Map<string, string>()
  kpis.programs.forEach((program, index) => {
    const ref = `PG${index + 1}`
    programRefs.set(ref, program.id)
    const pm = program.metrics
    const targets = Object.entries(program.targets)
      .map(([key, value]) => `${kpis.definitions[key as keyof typeof kpis.definitions]?.label ?? key} 목표 ${value}`)
      .join(', ')
    list.push({
      ref,
      kind: 'program',
      label: program.title,
      verified: false,
      text: [
        program.term ? `학기 ${program.term}` : null,
        `프로젝트 ${program.counts.projects}개(완료 ${program.counts.completedProjects}개)`,
        `등록 학생 ${program.counts.enrollments}명`,
        `참여율 ${fmt(pm.participationRate.value)}`,
        `제출률 ${fmt(pm.submissionRate.value)}`,
        `승인율 ${fmt(pm.approvalRate.value)}`,
        `평균 진행률 ${fmt(pm.averageProgress.value)}`,
        `승인 증빙 ${program.counts.approvedEvidence}건`,
        targets ? `목표: ${targets}` : '목표 미설정',
        pm.goalAchievementRate.denominator ? `목표 달성 ${pm.goalAchievementRate.numerator}/${pm.goalAchievementRate.denominator}` : null,
      ]
        .filter(Boolean)
        .join(' / '),
    })
  })
  kpis.projects.slice(0, 40).forEach((project, index) => {
    list.push({
      ref: `PJ${index + 1}`,
      kind: 'project',
      label: `${project.teamName ? `${project.teamName} · ` : ''}${project.title}`,
      projectId: project.id,
      verified: false,
      text: `상태 ${project.status} / 진행률 ${project.progress}% / 태스크 ${project.tasks.done}/${project.tasks.total} 완료 / 기간 내 활동 ${project.activitiesInPeriod}건 / 승인 증빙 ${project.evidence.approved}건`,
    })
  })
  snapshot.evidence.slice(0, 30).forEach((item, index) => {
    list.push({
      ref: `EV${index + 1}`,
      kind: 'evidence',
      label: `승인 증빙 · ${item.project.teamName ?? item.project.title}`,
      projectId: item.project.id,
      verified: true,
      text: scrubPii(`${truncate(item.title, 100)} (${item.category}, 활동일 ${day(item.activityDate)})${item.description ? ` — ${truncate(item.description, 200)}` : ''}`),
    })
  })
  return { snapshot, sources: sourceSet(list), programRefs }
}

function mockNarrative({ snapshot, sources, programRefs }: ReportNarrativeInput): NarrativeDraft {
  const { kpis } = snapshot
  const m = kpis.totals.metrics
  const c = kpis.totals.counts
  const org = snapshot.organization.name
  const projectRefs = [...sources.values()].filter((s) => s.kind === 'project')
  const evidenceRefs = [...sources.values()].filter((s) => s.kind === 'evidence')

  const overview = [
    { text: `${org}에서는 집계 기간 동안 프로그램 ${c.programs}개와 프로젝트 ${c.projects}개를 운영했습니다.`, sourceRefs: ['G1'] },
    { text: `등록 학생 ${c.uniqueStudents}명 중 기간 내 활동 기록이 있는 참여 학생은 ${c.activeStudents}명입니다.`, sourceRefs: ['G1'] },
    ...(m.averageProgress.value !== null
      ? [{ text: `운영 프로젝트의 평균 진행률은 ${m.averageProgress.value}%이며, 완료된 프로젝트는 ${c.completedProjects}개입니다.`, sourceRefs: ['G1'] }]
      : []),
    { text: `기간 내 승인된 증빙은 ${c.approvedEvidence}건이며, 이를 통해 검증 기록 ${kpis.totals.verifiedRecordsIssued}건이 발급되었습니다.`, sourceRefs: ['G1'] },
  ]

  const programs = [...programRefs.entries()].map(([ref, id]) => {
    const program = kpis.programs.find((p) => p.id === id)!
    const pm = program.metrics
    return {
      programRef: ref,
      summary: [
        { text: `「${program.title}」 프로그램은 프로젝트 ${program.counts.projects}개, 등록 학생 ${program.counts.enrollments}명 규모로 운영되었습니다.`, sourceRefs: [ref] },
        ...(pm.submissionRate.value !== null ? [{ text: `활동 제출률은 ${pm.submissionRate.value}%, 학생 참여율은 ${fmt(pm.participationRate.value)}입니다.`, sourceRefs: [ref] }] : []),
      ],
    }
  })

  const topProjects = [...projectRefs]
    .map((source) => ({ source, progress: Number(/진행률 (\d+(?:\.\d+)?)%/.exec(source.text)?.[1] ?? 0) }))
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3)
  const highlights = [
    ...topProjects.map(({ source, progress }) => ({ text: `${source.label} 프로젝트가 진행률 ${progress}%를 기록했습니다.`, sourceRefs: [source.ref] })),
    ...evidenceRefs.slice(0, 3).map((source) => ({ text: `${source.label.replace('승인 증빙 · ', '')}: ${source.text.split(' (')[0]} 활동이 승인되었습니다.`, sourceRefs: [source.ref] })),
  ]

  const evaluation = [
    ...(m.goalAchievementRate.denominator
      ? [{ text: `목표가 설정된 KPI ${m.goalAchievementRate.denominator}개 중 ${m.goalAchievementRate.numerator}개를 달성했습니다.`, sourceRefs: ['G1'] }]
      : [{ text: '프로그램별 KPI 목표가 설정되지 않아 목표 달성 여부는 평가하지 않았습니다.', sourceRefs: ['G1'] }]),
    ...(m.approvalRate.value !== null ? [{ text: `제출된 증빙의 승인율은 ${m.approvalRate.value}%입니다.`, sourceRefs: ['G1'] }] : []),
  ]

  const improvements = [
    ...(m.submissionRate.value !== null && m.submissionRate.value < 70
      ? [{ text: `활동 제출률이 ${m.submissionRate.value}%로, 미제출 학생 대상 제출 안내가 필요합니다.`, sourceRefs: ['G1'] }]
      : []),
    ...(c.pendingEvidence > 0 ? [{ text: `검토 대기 중인 증빙 ${c.pendingEvidence}건의 처리가 필요합니다.`, sourceRefs: ['G1'] }] : []),
    ...(m.approvalRate.value !== null && m.approvalRate.value < 80
      ? [{ text: `증빙 승인율이 ${m.approvalRate.value}%로, 증빙 작성 기준 안내를 보완할 필요가 있습니다.`, sourceRefs: ['G1'] }]
      : []),
    ...(!m.goalAchievementRate.denominator ? [{ text: '다음 운영 기간에는 프로그램별 KPI 목표를 설정해 달성도를 관리하는 것을 권장합니다.', sourceRefs: ['G1'] }] : []),
  ]

  return { overview, programs, highlights, evaluation, improvements }
}

function groundNarrative(draft: NarrativeDraft, input: ReportNarrativeInput) {
  const issues: GroundingIssue[] = []
  const keep = (claims: { text: string; sourceRefs: string[] }[], path: string) => {
    const result = groundClaims(claims, input.sources, path)
    issues.push(...result.issues)
    return result.kept
  }
  const programs: ReportNarrative['programs'] = []
  draft.programs.forEach((entry, index) => {
    const programId = input.programRefs.get(entry.programRef)
    if (!programId || programs.some((p) => p.programId === programId)) {
      issues.push({ path: `programs[${index}]`, text: entry.programRef, reason: 'unknown_source' })
      return
    }
    programs.push({ programId, summary: keep(entry.summary, `programs[${index}].summary`) })
  })
  const output: ReportNarrative = {
    overview: keep(draft.overview, 'overview'),
    programs,
    highlights: keep(draft.highlights, 'highlights'),
    evaluation: keep(draft.evaluation, 'evaluation'),
    improvements: keep(draft.improvements, 'improvements'),
  }
  return { output, issues }
}

export const reportNarrativeTask: AiTask<ReportNarrativeInput, NarrativeDraft, ReportNarrative> = {
  feature: 'report_narrative',
  analysisType: AIAnalysisType.REPORT_NARRATIVE,
  promptVersion: 'report-narrative-v1',
  schema: narrativeSchema,
  maxTokens: 2400,
  instructions: [
    '너는 대학·기관의 사업 결과보고서 서술을 돕는 작성자다. 통계는 이미 PostgreSQL에서 계산되어 sources에 있다.',
    '- 수치는 sources의 값을 그대로 인용만 한다. 새 비율·합계·증감을 계산하지 않는다.',
    '- overview: 사업 개요와 핵심 운영 성과, programs: 프로그램별 운영 결과(programRef 사용), highlights: 주요 프로젝트·증빙 활동,',
    '  evaluation: 종합 평가, improvements: 데이터에서 드러난 개선 사항.',
    '- 학생 개인을 평가하거나 이름을 쓰지 않는다. 보고서 문체(~했습니다)로 쓴다.',
  ].join('\n'),
  outputFormat: `{
  "overview": [{ "text": "...", "sourceRefs": ["G1"] }],
  "programs": [{ "programRef": "PG1", "summary": [{ "text": "...", "sourceRefs": ["PG1"] }] }],
  "highlights": [{ "text": "...", "sourceRefs": ["PJ1", "EV1"] }],
  "evaluation": [{ "text": "...", "sourceRefs": ["G1"] }],
  "improvements": [{ "text": "...", "sourceRefs": ["G1"] }]
}`,
  buildPayload: (input) => ({
    task: 'report_narrative',
    organizationType: input.snapshot.organization.type,
    sources: sourcesForPrompt(input.sources),
  }),
  mock: mockNarrative,
  ground: groundNarrative,
}

/** Rule-based narrative used when the AI call fails, so a report can always be issued. */
export function fallbackNarrative(input: ReportNarrativeInput) {
  return groundNarrative(mockNarrative(input), input)
}
