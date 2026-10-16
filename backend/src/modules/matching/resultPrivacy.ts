import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { buildTalentExplanationInput, fallbackExplanation, type CandidateExplanation } from '../../services/ai/tasks/talentExplanation.js'
import {
  loadShareableCandidates,
  normalize,
  scoreCandidate,
  searchCriteriaSchema,
  shareableNow,
  type Breakdown,
  type LoadedCandidate,
  type MatchEvidence,
} from './scoring.js'

/**
 * A stored result is a snapshot of what was shareable when the search ran. Candidates can later withdraw consent,
 * hide a project from their profile, make a project non-public, hide a record or have it revoked. Every read and
 * every such change re-checks stored results: one that still only mentions shareable data is kept as it was; one
 * that mentions anything no longer shareable is re-scored from what is shareable now (AI text replaced by
 * rule-based text from the same data), or emptied when nothing shareable is left. Stored rows are rewritten too,
 * so withdrawn data does not stay at rest.
 */

export type StoredEvidence = MatchEvidence & {
  explanation?: CandidateExplanation | null
  /** Set when the result was re-scored because the candidate's shareable data changed. */
  recalculatedAt?: string
  /** Set when nothing about the candidate may be shown any more; the rest is emptied. */
  purged?: true
}

type StoredRow = {
  id: string
  candidateId: string
  score: number
  breakdown: Prisma.JsonValue
  evidence: Prisma.JsonValue
  explanationSource: string | null
  explanationModel: string | null
}

export type ResultState =
  | { kind: 'kept'; score: number; breakdown: Breakdown; evidence: StoredEvidence; explanationSource: string | null; explanationModel: string | null }
  | { kind: 'recalculated'; score: number; breakdown: Breakdown; evidence: StoredEvidence; explanationSource: 'rule'; explanationModel: null }
  | { kind: 'withdrawn'; reason: 'consent' | 'not_shareable' }

const EMPTY_EVIDENCE: StoredEvidence = { matchedSkills: [], missingSkills: [], projects: [], verified: [], lastRelevantActivity: null, purged: true }

function readEvidence(value: Prisma.JsonValue): StoredEvidence {
  const raw = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<StoredEvidence>
  return {
    ...raw,
    matchedSkills: raw.matchedSkills ?? [],
    missingSkills: raw.missingSkills ?? [],
    projects: raw.projects ?? [],
    verified: raw.verified ?? [],
    lastRelevantActivity: raw.lastRelevantActivity ?? null,
  }
}

/** True when the stored result mentions anything (project, record, title, profile skill) not shareable now. */
export function mentionsWithdrawnData(stored: StoredEvidence, candidate: LoadedCandidate) {
  if (stored.purged) return true
  const now = shareableNow(candidate)
  if (stored.projects.some((project) => !now.projectIds.has(project.id) || (project.public && !now.publicProjectIds.has(project.id)))) return true
  if (stored.verified.some((record) => !now.recordIds.has(record.id))) return true
  return stored.matchedSkills.some((match) =>
    match.backedBy.some((source) => (source === '프로필' ? !now.profileSkills.has(normalize(match.skill)) : !now.titles.has(source))),
  )
}

function evaluate(row: StoredRow, candidate: LoadedCandidate | undefined, criteria: Prisma.JsonValue, searchedAt: Date): ResultState {
  if (!candidate) return { kind: 'withdrawn', reason: 'consent' }
  const stored = readEvidence(row.evidence)
  if (!mentionsWithdrawnData(stored, candidate)) {
    return {
      kind: 'kept',
      score: row.score,
      breakdown: row.breakdown as unknown as Breakdown,
      evidence: stored,
      explanationSource: row.explanationSource,
      explanationModel: row.explanationModel,
    }
  }
  const parsed = searchCriteriaSchema.parse(criteria)
  // Scored as of the search so the recency part stays comparable with the other results of that search.
  const live = scoreCandidate(candidate, parsed, searchedAt)
  if (live.score <= 0) return { kind: 'withdrawn', reason: 'not_shareable' }
  const explanation = fallbackExplanation(buildTalentExplanationInput(parsed, [live])).output.C1 ?? null
  return {
    kind: 'recalculated',
    score: live.score,
    breakdown: live.breakdown,
    evidence: { ...live.evidence, explanation, recalculatedAt: stored.recalculatedAt ?? new Date().toISOString() },
    explanationSource: 'rule',
    explanationModel: null,
  }
}

function explanationText(explanation: CandidateExplanation | null | undefined) {
  return explanation ? [...explanation.reasons, ...explanation.cautions].map((claim) => claim.text).join(' ') : null
}

async function persist(row: StoredRow, state: ResultState) {
  if (state.kind === 'kept') return
  if (state.kind === 'withdrawn') {
    if (readEvidence(row.evidence).purged) return
    await prisma.matchResult.update({
      where: { id: row.id },
      data: { score: 0, breakdown: {}, evidence: EMPTY_EVIDENCE as unknown as Prisma.InputJsonValue, explanation: null, explanationSource: null, explanationModel: null },
    })
    return
  }
  await prisma.matchResult.update({
    where: { id: row.id },
    data: {
      score: state.score,
      breakdown: state.breakdown as unknown as Prisma.InputJsonValue,
      evidence: state.evidence as unknown as Prisma.InputJsonValue,
      explanation: explanationText(state.evidence.explanation),
      explanationSource: state.explanationSource,
      explanationModel: null,
    },
  })
}

const rowSelect = {
  id: true,
  candidateId: true,
  score: true,
  breakdown: true,
  evidence: true,
  explanationSource: true,
  explanationModel: true,
} as const

/** Re-checks the given results of one search against the candidates' current shareable data and rewrites stale rows. */
export async function checkSearchResults(search: { criteria: Prisma.JsonValue; createdAt: Date }, rows: StoredRow[]) {
  const candidates = new Map((await loadShareableCandidates([...new Set(rows.map((row) => row.candidateId))])).map((candidate) => [candidate.id, candidate]))
  const states = new Map<string, ResultState>()
  for (const row of rows) {
    const state = evaluate(row, candidates.get(row.candidateId), search.criteria, search.createdAt)
    await persist(row, state)
    states.set(row.id, state)
  }
  return states
}

/** Called after a candidate's shareable data shrinks (consent withdrawn, project hidden or made non-public, record hidden). */
export async function refreshCandidateResults(userIds: string[]) {
  if (!userIds.length) return
  const rows = await prisma.matchResult.findMany({
    where: { candidateId: { in: userIds } },
    select: { ...rowSelect, search: { select: { id: true, criteria: true, createdAt: true } } },
  })
  const bySearch = new Map<string, { search: { criteria: Prisma.JsonValue; createdAt: Date }; rows: StoredRow[] }>()
  for (const { search, ...row } of rows) {
    const entry = bySearch.get(search.id) ?? { search, rows: [] }
    entry.rows.push(row)
    bySearch.set(search.id, entry)
  }
  for (const { search, rows: searchRows } of bySearch.values()) await checkSearchResults(search, searchRows)
}

/** Best effort after a user action: a failure is logged and the read-time check still protects the data. */
export function refreshCandidateResultsSafely(userIds: string[]) {
  return refreshCandidateResults(userIds).catch((error) => {
    console.error('[talent] refreshing stored results failed:', error instanceof Error ? error.message : error)
  })
}
