import {
  OrganizationDocumentType,
  OrganizationMemberStatus,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
  type Organization,
  type OrganizationMember,
  type OrganizationVerification,
} from '@prisma/client'

/** Types that can be registered through the organization flow (COMMUNITY is legacy-only). */
export const REGISTRABLE_ORGANIZATION_TYPES = [
  OrganizationType.UNIVERSITY,
  OrganizationType.INSTITUTION,
  OrganizationType.COMPANY,
] as const

const ROLE_RANK: Record<OrganizationRole, number> = {
  [OrganizationRole.OWNER]: 4,
  [OrganizationRole.ADMIN]: 3,
  [OrganizationRole.MANAGER]: 2,
  [OrganizationRole.MEMBER]: 1,
}

export function roleRank(role: OrganizationRole) {
  return ROLE_RANK[role]
}

export function hasOrgRole(role: OrganizationRole, minRole: OrganizationRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/** Actors may only act on members ranked strictly below themselves. */
export function canManageMember(actorRole: OrganizationRole, targetRole: OrganizationRole) {
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole]
}

const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>

export const toApiOrgType = (type: OrganizationType) => lower(type)
export const toApiVerificationStatus = (status: OrganizationVerificationStatus) => lower(status)
export const toApiOrgRole = (role: OrganizationRole) => lower(role)
export const toApiMemberStatus = (status: OrganizationMemberStatus) => lower(status)
export const toApiDocumentType = (type: OrganizationDocumentType) => lower(type)

export function serializeOrganization(
  organization: Pick<
    Organization,
    | 'id'
    | 'name'
    | 'type'
    | 'description'
    | 'website'
    | 'contactEmail'
    | 'registrationNumber'
    | 'verificationStatus'
    | 'verifiedAt'
    | 'createdAt'
    | 'updatedAt'
  >,
  /** Contact and registration details are only shown to org admins and platform staff. */
  options: { viewerRole?: OrganizationRole | null; platformAdmin?: boolean } = {},
) {
  const showPrivate =
    options.platformAdmin === true || (options.viewerRole ? hasOrgRole(options.viewerRole, OrganizationRole.ADMIN) : false)
  return {
    id: organization.id,
    name: organization.name,
    type: toApiOrgType(organization.type),
    description: organization.description,
    website: organization.website,
    contactEmail: showPrivate ? organization.contactEmail : null,
    registrationNumber: showPrivate ? organization.registrationNumber : null,
    verificationStatus: toApiVerificationStatus(organization.verificationStatus),
    verifiedAt: organization.verifiedAt,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt,
  }
}

export function serializePublicOrganization(
  organization: Pick<Organization, 'id' | 'name' | 'type' | 'description' | 'website'> & {
    _count?: { members: number }
  },
) {
  return {
    id: organization.id,
    name: organization.name,
    type: toApiOrgType(organization.type),
    description: organization.description,
    website: organization.website,
    memberCount: organization._count?.members ?? null,
  }
}

export function serializeMember(
  member: Pick<
    OrganizationMember,
    'id' | 'userId' | 'role' | 'status' | 'title' | 'message' | 'joinedAt' | 'createdAt'
  > & {
    user?: { id: string; name: string; email: string; avatarUrl: string | null } | null
  },
  /** Member emails are visible to organization staff (manager and above) only. */
  options: { showEmail?: boolean } = { showEmail: true },
) {
  const user = member.user ? { ...member.user, email: options.showEmail ? member.user.email : null } : null
  return {
    id: member.id,
    userId: member.userId,
    role: toApiOrgRole(member.role),
    status: toApiMemberStatus(member.status),
    title: member.title,
    message: member.message,
    joinedAt: member.joinedAt,
    createdAt: member.createdAt,
    user,
  }
}

export function serializeVerification(
  verification: Pick<
    OrganizationVerification,
    | 'id'
    | 'documentType'
    | 'documentName'
    | 'note'
    | 'status'
    | 'reviewNote'
    | 'reviewedAt'
    | 'createdAt'
  > & { documentUrl?: string },
  options: { includeDocument?: boolean } = {},
) {
  return {
    id: verification.id,
    documentType: toApiDocumentType(verification.documentType),
    documentName: verification.documentName,
    note: verification.note,
    status: toApiVerificationStatus(verification.status),
    reviewNote: verification.reviewNote,
    reviewedAt: verification.reviewedAt,
    createdAt: verification.createdAt,
    ...(options.includeDocument ? { documentUrl: verification.documentUrl ?? null } : {}),
  }
}

export const memberUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const
