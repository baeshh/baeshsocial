import type { AuthUser } from './auth'

export type OpportunityType =
  | 'JOB'
  | 'INTERNSHIP'
  | 'HACKATHON'
  | 'EDUCATION'
  | 'COMPETITION'
  | 'STARTUP_PROGRAM'

export type Opportunity = {
  id: string
  title: string
  type: OpportunityType
  organization: string
  description: string
  skills: string[]
  location: string | null
  isRemote: boolean
  deadline: string | null
  applyUrl: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  /** Who posted it; contact details are not shared. */
  creator: Pick<AuthUser, 'id' | 'name' | 'role'> | null
  saved: boolean
  matchScore: number
  /** The opportunity's skills that are also on the viewer's profile. */
  matchedSkills?: string[]
}

export type OpportunityEnrollmentStatus =
  | 'APPLIED'
  | 'ENROLLED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'WITHDRAWN'

export type OpportunityEnrollment = {
  id: string
  userId: string
  opportunityId: string
  status: OpportunityEnrollmentStatus
  appliedAt: string
  enrolledAt: string | null
  completedAt: string | null
  opportunity: Pick<Opportunity, 'id' | 'title' | 'organization' | 'type' | 'skills'>
  user?: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
  certificate?: { id: string; verified: boolean; issuedAt?: string | null } | null
}

export const PROGRAM_OPPORTUNITY_TYPES: OpportunityType[] = [
  'EDUCATION',
  'STARTUP_PROGRAM',
  'HACKATHON',
  'COMPETITION',
]

export function isProgramOpportunityType(type: OpportunityType) {
  return PROGRAM_OPPORTUNITY_TYPES.includes(type)
}
