/* ----------------------------------- KPI ----------------------------------- */

export type KpiKey =
  | 'projectCompletionRate'
  | 'participationRate'
  | 'submissionRate'
  | 'approvalRate'
  | 'averageProgress'
  | 'approvedEvidenceCount'
  | 'goalAchievementRate'

export type KpiTargetKey = Exclude<KpiKey, 'goalAchievementRate'>
export type KpiTargets = Partial<Record<KpiTargetKey, number | null>>

export type KpiMetric = {
  value: number | null
  numerator: number
  denominator: number
  target: number | null
  met: boolean | null
}

export type KpiDefinition = { label: string; numerator: string; denominator: string; basis: string }

export type KpiCounts = {
  programs: number
  projects: number
  completedProjects: number
  enrollments: number
  uniqueStudents: number
  activeStudents: number
  submittedStudents: number
  approvedEvidence: number
  rejectedEvidence: number
  pendingEvidence: number
}

export type KpiProgramRow = {
  id: string
  title: string
  term: string | null
  status: string
  startDate: string | null
  endDate: string | null
  targets: KpiTargets
  metrics: Record<KpiKey, KpiMetric>
  counts: KpiCounts
}

export type KpiProjectRow = {
  id: string
  title: string
  teamName: string | null
  programId: string
  status: string
  progress: number
  memberCount: number
  tasks: { total: number; done: number }
  activitiesInPeriod: number
  activeContributors: number
  evidence: { submitted: number; approved: number; rejected: number; pending: number }
}

export type KpiResult = {
  period: { from: string; to: string }
  generatedAt: string
  definitions: Record<KpiKey, KpiDefinition>
  programs: KpiProgramRow[]
  totals: { metrics: Record<KpiKey, KpiMetric>; counts: KpiCounts; verifiedRecordsIssued: number }
  projects: KpiProjectRow[]
  trend: { granularity: 'week' | 'month'; buckets: { start: string; submissions: number; approvals: number; activeStudents: number }[] }
  isOrgAdmin?: boolean
}

/* --------------------------------- Reports --------------------------------- */

export type GeneratedReport = {
  id: string
  title: string
  programIds: string[]
  period: { from: string; to: string }
  version: number
  templateVersion: number
  status: 'pending' | 'ready' | 'failed'
  narrativeSource: 'ai' | 'template' | null
  sizeBytes: number | null
  sha256: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
  createdBy: { id: string; name: string } | null
}

export type ReportProgramOption = {
  id: string
  title: string
  term: string | null
  status: string
  startDate: string | null
  endDate: string | null
}

/* ----------------------------------- AI ----------------------------------- */

export type AiSource = {
  ref: string
  kind: 'project' | 'evidence' | 'activity' | 'task' | 'link' | 'fact' | 'program' | 'profile'
  label: string
  text: string
  verified: boolean
  projectId?: string
  url?: string
}

export type GroundedClaim = { text: string; sourceRefs: string[]; verified: boolean }

export type AiValidation = { dropped: number; reasons: Record<string, number> }

export type AiMeta = {
  provider: string
  model: string
  promptVersion?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  latencyMs?: number
  attempts?: number
  createdAt?: string
}

export type AiQuota = { limit: number; used: number; remaining: number; window: string; provider: string; model: string }

export type InsightResult = {
  mode: 'profile' | 'project' | 'opportunity'
  summary: string
  strengths: GroundedClaim[]
  gaps: string[]
  recommendations: string[]
  matchScore: number | null
  sources: AiSource[]
}

export type InsightResponse = {
  analysisId: string
  insight: InsightResult
  validation: AiValidation
  meta: AiMeta
  match?: { score: number | null; matched: string[]; missing: string[]; basis: string }
}

export type PortfolioProject = {
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

export type Portfolio = {
  headline: string
  resumeSummary: GroundedClaim[]
  projects: PortfolioProject[]
  skills: { name: string; sourceRefs: string[]; verified: boolean }[]
  sources: AiSource[]
  stats: { projects: number; verifiedClaims: number; totalClaims: number; droppedClaims: number }
}

export type PortfolioResponse = {
  analysisId: string
  portfolio: Portfolio
  validation: AiValidation
  meta: AiMeta
}

export type AiAnalysisSummary = {
  id: string
  type: string
  projectId: string | null
  provider: string
  model: string
  promptVersion: string | null
  output: Record<string, unknown>
  createdAt: string
}

/* --------------------------------- Talent --------------------------------- */

export type TalentBreakdownKey = 'skills' | 'projects' | 'verified' | 'recency'

export type TalentMeta = {
  scoringVersion: string
  weights: Record<TalentBreakdownKey, number>
  basis: Record<TalentBreakdownKey, string>
}

export type TalentResult =
  /** consent: the candidate turned talent search off; not_shareable: nothing they share now matches any more. */
  | { id: string; rank: number; withdrawn: true; reason?: 'consent' | 'not_shareable' }
  | {
      id: string
      rank: number
      withdrawn: false
      /** Re-scored from what the candidate shares now because something in the original result is no longer shared. */
      recalculated?: boolean
      recalculatedAt?: string | null
      score: number
      breakdown: Record<TalentBreakdownKey, { score: number; weight: number; points: number }>
      evidence: {
        matchedSkills: { skill: string; backedBy: string[] }[]
        missingSkills: string[]
        projects: { id: string; slug: string | null; title: string; relevance: number; matchedSkills: string[]; status: string; public: boolean }[]
        verified: { id: string; title: string; organization: string | null; program: string | null; projectTitle: string; verifiedAt: string; relevant: boolean }[]
        lastRelevantActivity: string | null
      }
      explanation: { reasons: GroundedClaim[]; cautions: GroundedClaim[] } | null
      explanationSource: 'ai' | 'rule' | null
      explanationModel: string | null
      feedback: 'shortlisted' | 'contacted' | 'not_a_fit' | null
      feedbackAt: string | null
      candidate: { id: string; name: string; avatarUrl: string | null; headline: string | null; school: string | null }
    }

export type TalentSearchCriteria = { title?: string; skills: string[]; keywords: string[]; limit?: number }

export type TalentSearch = {
  id: string
  title: string
  criteria: TalentSearchCriteria
  scoringVersion: string
  candidateCount: number
  createdAt: string
  createdBy?: { id: string; name: string } | null
}

/* ------------------------------- AI operations ------------------------------ */

export type AiUsageReport = {
  days: number
  since: string
  config: {
    provider: string
    model: string
    dailyLimitPerUser: number
    monthlyBudgetUsd: number | null
    monthToDateCostUsd: number
    timeoutMs: number
    maxRetries: number
  }
  totals: {
    calls: number
    success: number
    successRate: number | null
    costUsd: number
    inputTokens: number
    outputTokens: number
    validationIssues: number
    latency: { p50: number | null; p95: number | null; avg: number | null }
  }
  byStatus: Record<string, number>
  byFeature: {
    feature: string
    calls: number
    success: number
    errors: number
    costUsd: number
    inputTokens: number
    outputTokens: number
    validationIssues: number
    successRate: number | null
    avgLatencyMs: number | null
    issuesPerCall: number | null
  }[]
  byModel: { provider: string; model: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number }[]
  daily: { day: string; calls: number; errors: number; costUsd: number; validationIssues: number }[]
  topUsers: { userId: string | null; name: string; email: string | null; calls: number; costUsd: number }[]
  recentErrors: {
    id: string
    feature: string
    provider: string
    model: string
    status: string
    errorCode: string | null
    errorMessage: string | null
    attempts: number
    createdAt: string
    user: { id: string; name: string } | null
  }[]
}
