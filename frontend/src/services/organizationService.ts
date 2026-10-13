import { apiRequest } from '../lib/api'
import type {
  AdminOrganizationDetail,
  AdminOrganizationSummary,
  MyMembership,
  Organization,
  OrganizationDashboard,
  OrganizationDocumentType,
  OrganizationMember,
  OrganizationRole,
  OrganizationVerification,
  OrganizationVerificationStatus,
  PublicOrganization,
} from '../types/organization'

export type RegistrableOrganizationType = 'university' | 'institution' | 'company'

export type OrganizationPayload = {
  name: string
  type: RegistrableOrganizationType
  description?: string
  website?: string
  contactEmail?: string
  registrationNumber?: string
}

export type VerificationPayload = {
  documentType: OrganizationDocumentType
  documentName?: string
  documentUrl: string
  note?: string
}

const json = (body: unknown) => JSON.stringify(body)

export function getMyMemberships(token: string) {
  return apiRequest<{ memberships: MyMembership[] }>('/organizations/me', { token })
}

export function getOrganizationDirectory(
  token: string,
  filters: { q?: string; type?: RegistrableOrganizationType } = {},
) {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.type) params.set('type', filters.type)
  const query = params.toString()
  return apiRequest<{ organizations: PublicOrganization[] }>(
    `/organizations/directory${query ? `?${query}` : ''}`,
    { token },
  )
}

export function createOrganization(token: string, payload: OrganizationPayload) {
  return apiRequest<{ organization: Organization; myRole: OrganizationRole }>('/organizations', {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function updateOrganization(token: string, orgId: string, payload: Partial<OrganizationPayload>) {
  return apiRequest<{ organization: Organization }>(`/organizations/${orgId}`, {
    method: 'PATCH',
    token,
    body: json(payload),
  })
}

export function getOrganizationDashboard(token: string, orgId: string, programId?: string | null) {
  const query = programId ? `?programId=${encodeURIComponent(programId)}` : ''
  return apiRequest<OrganizationDashboard>(`/organizations/${orgId}/dashboard${query}`, { token })
}

export function getOrganizationMembers(token: string, orgId: string) {
  return apiRequest<{ members: OrganizationMember[]; pendingRequests: OrganizationMember[] }>(
    `/organizations/${orgId}/members`,
    { token },
  )
}

export function joinOrganization(token: string, orgId: string, payload: { title?: string; message?: string }) {
  return apiRequest<{ membership: OrganizationMember }>(`/organizations/${orgId}/join`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function cancelJoinRequest(token: string, orgId: string) {
  return apiRequest<void>(`/organizations/${orgId}/join`, { method: 'DELETE', token })
}

export function leaveOrganization(token: string, orgId: string) {
  return apiRequest<void>(`/organizations/${orgId}/membership`, { method: 'DELETE', token })
}

export function decideMemberRequest(token: string, orgId: string, memberId: string, decision: 'approve' | 'reject') {
  return apiRequest<{ member: OrganizationMember }>(`/organizations/${orgId}/members/${memberId}/decision`, {
    method: 'POST',
    token,
    body: json({ decision }),
  })
}

export function updateMemberRole(
  token: string,
  orgId: string,
  memberId: string,
  role: Exclude<OrganizationRole, 'owner'>,
) {
  return apiRequest<{ member: OrganizationMember }>(`/organizations/${orgId}/members/${memberId}`, {
    method: 'PATCH',
    token,
    body: json({ role }),
  })
}

export function removeMember(token: string, orgId: string, memberId: string) {
  return apiRequest<void>(`/organizations/${orgId}/members/${memberId}`, { method: 'DELETE', token })
}

export function getVerifications(token: string, orgId: string) {
  return apiRequest<{ verifications: OrganizationVerification[] }>(`/organizations/${orgId}/verifications`, {
    token,
  })
}

export function submitVerification(token: string, orgId: string, payload: VerificationPayload) {
  return apiRequest<{ verification: OrganizationVerification }>(`/organizations/${orgId}/verifications`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function getAdminOrganizations(token: string, status: OrganizationVerificationStatus) {
  return apiRequest<{ organizations: AdminOrganizationSummary[] }>(`/admin/organizations?status=${status}`, {
    token,
  })
}

export function getAdminOrganization(token: string, orgId: string) {
  return apiRequest<{ organization: AdminOrganizationDetail }>(`/admin/organizations/${orgId}`, { token })
}

export function reviewOrganization(
  token: string,
  orgId: string,
  decision: 'approved' | 'rejected',
  note?: string,
) {
  return apiRequest<{ organization: Organization }>(`/admin/organizations/${orgId}/review`, {
    method: 'POST',
    token,
    body: json({ decision, note }),
  })
}
