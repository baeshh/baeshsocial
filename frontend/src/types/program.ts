import type { MemberUser, OrganizationRole, OrganizationType } from './organization'

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'archived'
export type ProgramProjectStatus = 'planning' | 'active' | 'completed' | 'archived'
export type EvidenceStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type EvidenceCategory = 'development' | 'meeting' | 'presentation' | 'research' | 'fieldwork' | 'report' | 'other'
export type EvidenceFileKind = 'image' | 'video' | 'pdf'
export type TeamRole = 'leader' | 'member'

export type RecordDisclosure = 'hidden' | 'summary' | 'full'
export type ProjectVisibility = 'private' | 'team' | 'public'

export type ProgramPolicy = {
  allowStudentProjects: boolean
  requireProjectApproval: boolean
  allowStudentTeams: boolean
  allowPublicProjects: boolean
  allowMultipleProjects: boolean
  recordDisclosure: RecordDisclosure
}

export type Program = {
  id: string
  organizationId: string
  title: string
  description: string | null
  term: string | null
  status: ProgramStatus
  startDate: string | null
  endDate: string | null
  createdAt: string
  updatedAt: string
  projectCount: number | null
  participantCount: number | null
  managers: MemberUser[]
  policy: ProgramPolicy
}

export type ProgramListItem = Program & {
  myAccess: { isStaff: boolean; isParticipant: boolean }
  pendingEvidence: number | null
}

export type ProgramAccess = {
  isStaff: boolean
  isOrgAdmin: boolean
  isManager: boolean
  isParticipant: boolean
  orgRole: OrganizationRole
}

export type ProgramDetail = {
  program: Program
  organization: { id: string; name: string; type: OrganizationType }
  myAccess: ProgramAccess
}

export type TeamMember = MemberUser & { userId: string; teamRole: TeamRole }

export type ProgramProject = {
  id: string
  title: string
  slug: string
  teamName: string | null
  objective: string | null
  description: string | null
  status: ProgramProjectStatus
  progress: number
  startDate: string | null
  endDate: string | null
  programId: string
  updatedAt: string
  members: TeamMember[]
  taskStats: { total: number; done: number }
  evidenceStats: { submitted: number; approved: number; rejected: number } | null
  visibility: ProjectVisibility
  origin: 'student' | 'institution'
  registration: { status: RegistrationStatus; source: RegistrationSource } | null
  verification: { id: string; verifiedAt: string } | null
  supervision: ProjectSupervision | null
}

export type SupervisionHealth = 'evidence_review' | 'feedback_needed' | 'revision_requested' | 'on_track'

export type ProjectSupervision = {
  health: SupervisionHealth
  stale: boolean
  openRevisionRequests: number
  openRemovalRequests: number
  lastActivityAt: string
  overdueTasks: number
}

export type ProgramProjectsSummary = {
  projects: number
  studentProjects: number
  students: number
  participants: number
  pendingEvidence: number
  pendingRequests: number
  openRemovalRequests: number
  verified: number
  byHealth: Record<SupervisionHealth, number>
}

type ParticipantTeam = { id: string; title: string; teamName: string | null; teamRole: TeamRole }

export type ProgramParticipant = {
  id: string
  userId: string
  studentNo: string | null
  department: string | null
  createdAt: string
  user: MemberUser
  team: ParticipantTeam | null
  teams: ParticipantTeam[]
  evidence: { submitted: number; approved: number; rejected: number }
}

/* ----------------------- Student project registration ----------------------- */

export type RegistrationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'removed'
export type RegistrationSource = 'new_project' | 'existing_project'

export type RegistrationSnapshot = {
  title: string
  description: string | null
  objective: string | null
  teamName: string | null
  visibility: string
  members: { userId: string; name: string; role: string }[]
  counts: { tasks: number; activities: number; links: number; files: number }
}

export type ProjectRegistration = {
  id: string
  programId: string
  source: RegistrationSource
  status: RegistrationStatus
  message: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  requester: MemberUser | null
  reviewedBy: { id: string; name: string } | null
  snapshot: RegistrationSnapshot | null
  project: {
    id: string
    title: string
    teamName: string | null
    visibility: ProjectVisibility
    inProgram: boolean
    counts: { members: number; tasks: number; activities: number; externalLinks: number }
  }
}

export type LinkableProject = {
  id: string
  title: string
  visibility: ProjectVisibility
  updatedAt: string
  counts: { members: number; tasks: number; externalLinks: number }
  blockedReason: string | null
}

/* ------------------------------ Reviews ------------------------------ */

export type ProjectReviewKind = 'feedback' | 'revision_request' | 'response' | 'removal_request'

export type ProjectReview = {
  id: string
  kind: ProjectReviewKind
  status: 'open' | 'resolved' | null
  body: string
  parentId: string | null
  author: MemberUser | null
  authorIsStaff: boolean
  targetUser: { id: string; name: string } | null
  resolvedBy: { id: string; name: string } | null
  resolvedAt: string | null
  createdAt: string
}

export type ProjectReviewsResponse = {
  reviews: ProjectReview[]
  members: Array<
    MemberUser & {
      userId: string
      role: string
      teamRole: TeamRole
      joinedAt: string
      evidence: { submitted: number; approved: number; rejected: number }
      lastEvidenceAt: string | null
      missingSubmission: boolean
    }
  >
  tasks: { total: number; done: number; overdue: number }
  origin: 'student' | 'institution'
  permissions: {
    canFeedback: boolean
    canRespond: boolean
    canRequestRemoval: boolean
    canResolve: boolean
    canRemoveProject: boolean
  }
}

/* ---------------------------- Verification ---------------------------- */

export type ProjectVerificationMember = {
  recordId: string
  user: { id: string; name: string; avatarUrl: string | null }
  role: string
  status: 'verified' | 'revoked' | 'pending' | 'rejected'
  contribution: string | null
  period: { start: string | null; end: string | null } | null
  evidenceCount: number
  revokeReason: string | null
  revokedAt: string | null
}

export type ProjectVerificationResponse = {
  current: string | null
  verifications: Array<{
    id: string
    status: 'verified' | 'revoked'
    outcomeSummary: string
    program: { id: string; title: string }
    verifiedBy: { id: string; name: string } | null
    verifiedAt: string
    revokedBy: { id: string; name: string } | null
    revokedAt: string | null
    revokeReason: string | null
    members: ProjectVerificationMember[]
  }>
  candidates: Array<
    MemberUser & { userId: string; role: string; teamRole: TeamRole; joinedAt: string; approvedEvidence: number; verified: boolean }
  >
  approvedEvidenceTotal: number
  canVerify: boolean
}

export type VerifyMemberInput = { userId: string; role: string; contribution: string; startDate?: string | null; endDate?: string | null }

export type MyVerifiedRecord = {
  id: string
  kind: 'evidence' | 'contribution'
  status: 'verified' | 'revoked'
  integrity: string
  title: string
  projectTitle: string
  role: string | null
  organizationName: string | null
  programTitle: string | null
  verifiedAt: string
  disclosure: RecordDisclosure
  programCap: RecordDisclosure | null
  effectiveDisclosure: RecordDisclosure
}

export type EvidenceFile = {
  id: string
  originalName: string
  mimeType: string
  kind: EvidenceFileKind
  sizeBytes: number
  sha256: string
  scanStatus: string
  createdAt: string
}

export type EvidenceHistoryEntry = {
  id: string
  action: 'submitted' | 'resubmitted' | 'approved' | 'rejected' | 'revoked'
  note: string | null
  actor: { id: string; name: string } | null
  createdAt: string
}

export type Evidence = {
  id: string
  projectId: string
  title: string
  description: string | null
  category: EvidenceCategory
  activityDate: string
  status: EvidenceStatus
  submittedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
  updatedAt: string
  author: MemberUser | null
  reviewedBy: { id: string; name: string } | null
  files: EvidenceFile[]
  history: EvidenceHistoryEntry[]
  verifiedRecordId: string | null
  verifiedRecord: {
    id: string
    status: 'pending' | 'verified' | 'rejected' | 'revoked'
    verifiedAt: string | null
    revokedAt: string | null
    revokeReason: string | null
  } | null
  project: { id: string; title: string; teamName: string | null; programId: string | null } | null
}

export type ProjectEvidenceResponse = {
  evidence: Evidence[]
  program: { id: string; title: string; status: ProgramStatus }
  canCreate: boolean
  canReview: boolean
  limits: { maxFilesPerEvidence: number; image: string; video: string; pdf: string }
}

export type EvidenceCounts = { submitted: number; approved: number; rejected: number }

export type ParticipationEntry = {
  programId: string
  programTitle: string
  programStatus: ProgramStatus
  term: string | null
  team: { id: string; title: string; teamName: string | null; programId: string; teamRole: TeamRole } | null
}

export type InstitutionDashboard =
  | { scope: 'participant'; myParticipation: ParticipationEntry[] }
  | {
      scope: 'staff'
      isOrgAdmin: boolean
      filterProgramId: string | null
      programs: Array<{
        id: string
        title: string
        status: ProgramStatus
        term: string | null
        startDate: string | null
        endDate: string | null
        inScope: boolean
        projectCount: number | null
        participantCount: number | null
        pendingEvidence: number | null
        approvedEvidence: number | null
        submissionRate: number | null
      }>
      totals: {
        programCount: number
        projectCount: number
        participantCount: number
        evidence: EvidenceCounts
        pendingReview: number
        submittedParticipants: number
        submissionRate: number | null
        approvalRate: number | null
        averageProgress: number | null
      }
      projects: Array<{
        id: string
        title: string
        teamName: string | null
        status: ProgramProjectStatus
        programId: string
        programTitle: string
        memberCount: number
        progress: number
        tasks: { total: number; done: number }
        evidence: EvidenceCounts
        lastSubmittedAt: string | null
        updatedAt: string
      }>
      myParticipation: ParticipationEntry[]
    }
