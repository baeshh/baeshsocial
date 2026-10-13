import { AIAnalysisType } from '@prisma/client'
import { z } from 'zod'
import type { ScoredCandidate, SearchCriteria } from '../../../modules/matching/scoring.js'
import { groundClaims, sourceSet, sourcesForPrompt, truncate, type GroundedClaim, type GroundingIssue, type Source, type SourceSet } from '../grounding.js'
import type { AiTask } from '../runner.js'

const claim = z.object({ text: z.string().trim().min(1).max(300), sourceRefs: z.array(z.string().max(12)).max(6).default([]) })

const explanationSchema = z.object({
  candidates: z
    .array(z.object({ candidateRef: z.string().max(8), reasons: z.array(claim).max(3).default([]), cautions: z.array(claim).max(2).default([]) }))
    .max(10),
})

type ExplanationDraft = z.infer<typeof explanationSchema>

export type CandidateExplanation = { reasons: GroundedClaim[]; cautions: GroundedClaim[] }

export type TalentExplanationInput = {
  criteria: SearchCriteria
  candidates: { ref: string; scored: ScoredCandidate }[]
  sources: SourceSet
}

const profileOnly = (row: ScoredCandidate) => row.evidence.matchedSkills.filter((m) => m.backedBy.includes('프로필')).map((m) => m.skill)
const backed = (row: ScoredCandidate) => row.evidence.matchedSkills.filter((m) => !m.backedBy.includes('프로필')).map((m) => m.skill)

const LABEL = { skills: '기술 일치', projects: '관련 프로젝트', verified: '검증 성과', recency: '최근성' } as const

/** Candidates are referenced as C1..Cn; names, emails and ids are never sent to the model. */
export function buildTalentExplanationInput(criteria: SearchCriteria, scored: ScoredCandidate[]): TalentExplanationInput {
  const list: Source[] = [
    {
      ref: 'Q1',
      kind: 'fact',
      label: '검색 조건',
      verified: false,
      text: `요구 기술: ${criteria.skills.join(', ')}${criteria.keywords.length ? ` / 키워드: ${criteria.keywords.join(', ')}` : ''}`,
    },
  ]
  const candidates = scored.map((row, index) => {
    const ref = `C${index + 1}`
    const b = row.breakdown
    list.push({
      ref: `${ref}S`,
      kind: 'fact',
      label: `${ref} 규칙 점수`,
      verified: false,
      text: [
        `총점 ${row.score}`,
        ...Object.entries(LABEL).map(([key, label]) => `${label} ${b[key as keyof typeof LABEL].points}점`),
        `프로젝트·검증 기록으로 확인된 기술: ${backed(row).join(', ') || '없음'}`,
        `프로필에만 기재된 기술: ${profileOnly(row).join(', ') || '없음'}`,
        `부족 기술: ${row.evidence.missingSkills.join(', ') || '없음'}`,
        row.evidence.lastRelevantActivity ? `최근 관련 활동 ${row.evidence.lastRelevantActivity.slice(0, 10)}` : '최근 관련 활동 없음',
      ].join(' / '),
    })
    row.evidence.projects.forEach((project, i) => {
      list.push({
        ref: `${ref}P${i + 1}`,
        kind: 'project',
        label: `${ref} ${project.public ? '공개 프로젝트' : '검증된 프로젝트'}`,
        verified: !project.public,
        text: `${truncate(project.title, 100)} / 일치 기술: ${project.matchedSkills.join(', ') || '없음'} / 상태 ${project.status}`,
      })
    })
    row.evidence.verified.forEach((record, i) => {
      list.push({
        ref: `${ref}V${i + 1}`,
        kind: 'evidence',
        label: `${ref} 기관 검증 기록`,
        verified: true,
        text: `${truncate(record.title, 100)} (${record.organization ?? '기관'}${record.program ? ` · ${record.program}` : ''}, 검증 ${record.verifiedAt.slice(0, 10)}, 프로젝트 ${truncate(record.projectTitle, 60)})`,
      })
    })
    return { ref, scored: row }
  })
  return { criteria, candidates, sources: sourceSet(list) }
}

function scopeFor(sources: SourceSet, ref: string): SourceSet {
  return new Map([...sources].filter(([key]) => key === 'Q1' || key === `${ref}S` || key.startsWith(`${ref}P`) || key.startsWith(`${ref}V`)))
}

function mockExplanation(input: TalentExplanationInput): ExplanationDraft {
  return {
    candidates: input.candidates.map(({ ref, scored }) => {
      const e = scored.evidence
      const confirmed = backed(scored)
      const unconfirmed = profileOnly(scored)
      const reasons = [
        ...(confirmed.length
          ? [{ text: `요구 기술 중 ${confirmed.join(', ')} 경험이 프로젝트·검증 기록으로 확인됩니다.`, sourceRefs: [`${ref}S`] }]
          : []),
        ...(e.projects[0] && e.projects[0].matchedSkills.length
          ? [{ text: `${e.projects[0].title} 프로젝트에서 ${e.projects[0].matchedSkills.join(', ')}을(를) 사용했습니다.`, sourceRefs: [`${ref}P1`] }]
          : []),
        ...(e.verified[0]
          ? [{ text: `${e.verified[0].organization ?? '기관'}에서 검증한 활동 기록(${e.verified[0].title})이 있습니다.`, sourceRefs: [`${ref}V1`] }]
          : []),
      ]
      const cautions = [
        ...(unconfirmed.length ? [{ text: `${unconfirmed.join(', ')}은(는) 프로필에만 기재되어 있어 확인이 필요합니다.`, sourceRefs: [`${ref}S`] }] : []),
        ...(e.missingSkills.length ? [{ text: `${e.missingSkills.join(', ')} 경험은 공개 데이터에서 확인되지 않았습니다.`, sourceRefs: [`${ref}S`] }] : []),
      ]
      return { candidateRef: ref, reasons, cautions }
    }),
  }
}

function groundExplanation(draft: ExplanationDraft, input: TalentExplanationInput) {
  const issues: GroundingIssue[] = []
  const output = new Map<string, CandidateExplanation>()
  draft.candidates.forEach((entry, index) => {
    if (!input.candidates.some((c) => c.ref === entry.candidateRef) || output.has(entry.candidateRef)) {
      issues.push({ path: `candidates[${index}]`, text: entry.candidateRef, reason: 'unknown_source' })
      return
    }
    const scope = scopeFor(input.sources, entry.candidateRef)
    const reasons = groundClaims(entry.reasons, scope, `candidates[${index}].reasons`)
    const cautions = groundClaims(entry.cautions, scope, `candidates[${index}].cautions`)
    issues.push(...reasons.issues, ...cautions.issues)
    output.set(entry.candidateRef, { reasons: reasons.kept, cautions: cautions.kept })
  })
  return { output: Object.fromEntries(output) as Record<string, CandidateExplanation>, issues }
}

export const talentExplanationTask: AiTask<TalentExplanationInput, ExplanationDraft, Record<string, CandidateExplanation>> = {
  feature: 'talent_explanation',
  analysisType: AIAnalysisType.TALENT_MATCH_EXPLANATION,
  promptVersion: 'talent-explanation-v1',
  schema: explanationSchema,
  maxTokens: 1800,
  instructions: [
    '너는 채용 담당자에게 후보 추천 이유를 설명하는 도우미다. 점수는 규칙 엔진이 이미 계산했고, 너는 점수를 바꾸거나 새로 매기지 않는다.',
    '- 각 후보(C1, C2…)마다 reasons(추천 이유 최대 3개)와 cautions(확인이 필요한 점 최대 2개)를 쓴다.',
    '- 각 문장의 sourceRefs에는 해당 후보의 source(Cn으로 시작)만 사용한다.',
    '- 성별·나이·출신 등 개인 특성을 추측하거나 언급하지 않는다. 공개된 프로젝트와 검증 기록만 근거로 쓴다.',
  ].join('\n'),
  outputFormat: `{
  "candidates": [{
    "candidateRef": "C1",
    "reasons": [{ "text": "...", "sourceRefs": ["C1P1"] }],
    "cautions": [{ "text": "...", "sourceRefs": ["C1S"] }]
  }]
}`,
  buildPayload: (input) => ({ task: 'talent_explanation', sources: sourcesForPrompt(input.sources) }),
  mock: mockExplanation,
  ground: groundExplanation,
}

export function fallbackExplanation(input: TalentExplanationInput) {
  return groundExplanation(mockExplanation(input), input)
}
