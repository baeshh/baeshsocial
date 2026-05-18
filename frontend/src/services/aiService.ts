import { apiRequest } from '../lib/api'
import type { AIAnalysis, AIResponse } from '../types/ai'

export function createProfileInsight(token: string) {
  return apiRequest<AIResponse>('/ai/profile-insight', {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
}

export function createProjectInsight(token: string, projectId: string) {
  return apiRequest<AIResponse>('/ai/project-insight', {
    method: 'POST',
    token,
    body: JSON.stringify({ projectId }),
  })
}

export function createOpportunityMatch(token: string, opportunityId: string) {
  return apiRequest<AIResponse>('/ai/opportunity-match', {
    method: 'POST',
    token,
    body: JSON.stringify({ opportunityId }),
  })
}

export function createPortfolioText(token: string, projectId: string) {
  return apiRequest<AIResponse>('/ai/portfolio-generator', {
    method: 'POST',
    token,
    body: JSON.stringify({ projectId }),
  })
}

export function getMyAnalyses(token: string) {
  return apiRequest<{ analyses: AIAnalysis[] }>('/ai/analyses/me', { token })
}
