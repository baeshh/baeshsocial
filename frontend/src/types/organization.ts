import type { InstitutionDashboard } from './program'

export type OrganizationType = 'university' | 'institution' | 'company' | 'community'
export type OrganizationVerificationStatus = 'pending' | 'approved' | 'rejected'
export type OrganizationRole = 'owner' | 'admin' | 'manager' | 'member'
export type OrganizationMemberStatus = 'pending' | 'active' | 'rejected'
export type OrganizationDocumentType =
  | 'business_registration'
  | 'employment_certificate'
  | 'official_letter'
  | 'other'

export type Organization = {
  id: string
  name: string
  type: OrganizationType
  description: string | null
  website: string | null
  contactEmail: string | null
  registrationNumber: string | null
  verificationStatus: OrganizationVerificationStatus
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PublicOrganization = {
  id: string
  name: string
  type: OrganizationType
  description: string | null
  website: string | null
  memberCount: number | null
  myMembership?: { status: OrganizationMemberStatus; role: OrganizationRole } | null
}

export type MemberUser = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export type OrganizationMember = {
  id: string
  userId: string
  role: OrganizationRole
  status: OrganizationMemberStatus
  title: string | null
  message: string | null
  joinedAt: string | null
  createdAt: string
  user: MemberUser | null
}

export type MyMembership = OrganizationMember & {
  organization: Organization
}

export type OrganizationVerification = {
  id: string
  documentType: OrganizationDocumentType
  documentName: string | null
  note: string | null
  status: OrganizationVerificationStatus
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  documentUrl?: string | null
}

export type OrganizationDashboard = {
  organization: Organization
  myRole: OrganizationRole
  stats: {
    memberCount: number
    roleCounts: Record<OrganizationRole, number>
    pendingRequests: number | null
  }
  latestVerification: OrganizationVerification | null
  institution: InstitutionDashboard
}

export type AdminOrganizationSummary = Organization & {
  createdBy: MemberUser | null
  memberCount: number
  latestVerification: OrganizationVerification | null
}

export type AdminOrganizationDetail = Organization & {
  createdBy: MemberUser | null
  admins: OrganizationMember[]
  verifications: OrganizationVerification[]
}
