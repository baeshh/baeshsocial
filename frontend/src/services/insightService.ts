import { apiDownload, apiRequest, withQuery } from '../lib/api'
import type {
  AiAnalysisSummary,
  AiQuota,
  AiUsageReport,
  GeneratedReport,
  InsightResponse,
  KpiResult,
  KpiTargets,
  PortfolioResponse,
  ReportProgramOption,
  TalentMeta,
  TalentResult,
  TalentSearch,
  TalentSearchCriteria,
} from '../types/insights'

const json = (body: unknown) => JSON.stringify(body)
export type PeriodParams = { from?: string; to?: string }

/* ----------------------------------- KPI ----------------------------------- */

export function getProgramKpis(token: string, programId: string, period: PeriodParams = {}) {
  return apiRequest<KpiResult>(withQuery(`/programs/${programId}/kpis`, period), { token })
}

export function getOrganizationKpis(token: string, orgId: string, period: PeriodParams = {}) {
  return apiRequest<KpiResult>(withQuery(`/organizations/${orgId}/programs/kpis`, period), { token })
}

export function updateKpiTargets(token: string, programId: string, targets: KpiTargets) {
  return apiRequest<{ targets: KpiTargets }>(`/programs/${programId}/kpi-targets`, { method: 'PUT', token, body: json({ targets }) })
}

/* --------------------------------- Reports --------------------------------- */

export function getReports(token: string, orgId: string) {
  return apiRequest<{ reports: GeneratedReport[]; programs: ReportProgramOption[]; isOrgAdmin: boolean }>(`/organizations/${orgId}/reports`, { token })
}

export function createReport(token: string, orgId: string, payload: { title?: string; programIds: string[]; from: string; to: string }) {
  return apiRequest<{ report: GeneratedReport }>(`/organizations/${orgId}/reports`, { method: 'POST', token, body: json(payload) })
}

export function getReportDownloadUrl(token: string, orgId: string, reportId: string, inline = false) {
  return apiRequest<{ url: string; expiresAt: string }>(`/organizations/${orgId}/reports/${reportId}/download${inline ? '?inline=1' : ''}`, { token })
}

/* ----------------------------------- AI ----------------------------------- */

export function getAiQuota(token: string) {
  return apiRequest<{ quota: AiQuota }>('/ai/quota', { token })
}

export function createProfileInsight(token: string) {
  return apiRequest<InsightResponse>('/ai/profile-insight', { method: 'POST', token, body: json({}) })
}

export function createProjectInsight(token: string, projectId: string) {
  return apiRequest<InsightResponse>('/ai/project-insight', { method: 'POST', token, body: json({ projectId }) })
}

export function createOpportunityMatch(token: string, opportunityId: string) {
  return apiRequest<InsightResponse>('/ai/opportunity-match', { method: 'POST', token, body: json({ opportunityId }) })
}

export function generatePortfolio(token: string, projectIds?: string[]) {
  return apiRequest<PortfolioResponse>('/ai/portfolio', { method: 'POST', token, body: json(projectIds?.length ? { projectIds } : {}) })
}

export function getLatestPortfolio(token: string) {
  return apiRequest<PortfolioResponse | { portfolio: null }>('/ai/portfolio/latest', { token })
}

export function downloadPortfolioPdf(token: string, analysisId: string) {
  return apiDownload(`/ai/portfolio/${analysisId}/pdf`, token, 'portfolio.pdf')
}

export function getMyAnalyses(token: string) {
  return apiRequest<{ analyses: AiAnalysisSummary[] }>('/ai/analyses/me', { token })
}

export function getAiUsage(token: string, days = 30) {
  return apiRequest<AiUsageReport>(`/admin/ai/usage?days=${days}`, { token })
}

/* --------------------------------- Talent --------------------------------- */

export function getTalentMeta(token: string, orgId: string) {
  return apiRequest<TalentMeta>(`/organizations/${orgId}/talent/meta`, { token })
}

export function runTalentSearch(token: string, orgId: string, criteria: TalentSearchCriteria) {
  return apiRequest<{ search: TalentSearch; results: TalentResult[] }>(`/organizations/${orgId}/talent/searches`, {
    method: 'POST',
    token,
    body: json(criteria),
  })
}

export function getTalentSearches(token: string, orgId: string) {
  return apiRequest<{ searches: TalentSearch[] }>(`/organizations/${orgId}/talent/searches`, { token })
}

export function getTalentSearch(token: string, orgId: string, searchId: string) {
  return apiRequest<{ search: TalentSearch; results: TalentResult[] }>(`/organizations/${orgId}/talent/searches/${searchId}`, { token })
}

export function setMatchFeedback(token: string, orgId: string, searchId: string, resultId: string, feedback: 'shortlisted' | 'contacted' | 'not_a_fit' | null) {
  return apiRequest<{ result: { id: string; feedback: string | null } }>(
    `/organizations/${orgId}/talent/searches/${searchId}/results/${resultId}/feedback`,
    { method: 'PATCH', token, body: json({ feedback }) },
  )
}
