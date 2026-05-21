import { apiRequest } from '../lib/api'
import type { Opportunity, OpportunityEnrollment } from '../types/opportunity'

export type OpportunityPayload = {
  title: string
  type: 'job' | 'internship' | 'hackathon' | 'education' | 'competition' | 'startup_program'
  organization: string
  description: string
  skills: string[]
  location?: string | null
  isRemote: boolean
  deadline?: string | null
  applyUrl?: string | null
}

export type OpportunityFilters = {
  q?: string
  type?: string
  remote?: boolean
  skill?: string
  saved?: boolean
}

function toQueryString(filters: OpportunityFilters) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      params.set(key, String(value))
    }
  })

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function getOpportunities(token: string, filters: OpportunityFilters = {}) {
  return apiRequest<{ opportunities: Opportunity[] }>(`/opportunities${toQueryString(filters)}`, { token })
}

export function createOpportunity(token: string, payload: OpportunityPayload) {
  return apiRequest<{ opportunity: Opportunity }>('/opportunities', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteOpportunity(token: string, opportunityId: string) {
  return apiRequest<void>(`/opportunities/${opportunityId}`, {
    method: 'DELETE',
    token,
  })
}

export function saveOpportunity(token: string, opportunityId: string) {
  return apiRequest(`/opportunities/${opportunityId}/save`, {
    method: 'POST',
    token,
  })
}

export function unsaveOpportunity(token: string, opportunityId: string) {
  return apiRequest<void>(`/opportunities/${opportunityId}/save`, {
    method: 'DELETE',
    token,
  })
}

export function enrollOpportunity(token: string, opportunityId: string) {
  return apiRequest<{ enrollment: OpportunityEnrollment }>(`/opportunities/${opportunityId}/enroll`, {
    method: 'POST',
    token,
  })
}

export function withdrawOpportunityEnrollment(token: string, opportunityId: string) {
  return apiRequest<{ enrollment: OpportunityEnrollment }>(`/opportunities/${opportunityId}/enroll`, {
    method: 'DELETE',
    token,
  })
}

export function getMyEnrollments(token: string) {
  return apiRequest<{ enrollments: OpportunityEnrollment[] }>('/opportunities/enrollments/me', {
    token,
  })
}

export function getManagedEnrollments(token: string) {
  return apiRequest<{ enrollments: OpportunityEnrollment[] }>('/opportunities/enrollments/managed', {
    token,
  })
}

export function updateEnrollmentStatus(
  token: string,
  enrollmentId: string,
  status: 'enrolled' | 'completed' | 'rejected' | 'withdrawn',
) {
  return apiRequest<{ enrollment: OpportunityEnrollment }>(
    `/opportunities/enrollments/${enrollmentId}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    },
  )
}
