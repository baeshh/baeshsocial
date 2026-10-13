import type { MemberUser, OrganizationRole, OrganizationType } from './organization'

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'archived'
export type ProgramProjectStatus = 'planning' | 'active' | 'completed' | 'archived'
export type EvidenceStatus = 'draft' | 'submitted' | 'approved' | 'rejected'
export type EvidenceCategory = 'development' | 'meeting' | 'presentation' | 'research' | 'fieldwork' | 'report' | 'other'
export type EvidenceFileKind = 'image' | 'video' | 'pdf'
export type TeamRole = 'leader' | 'member'

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
}

export type ProgramParticipant = {
  id: string
  userId: string
  studentNo: string | null
  department: string | null
  createdAt: string
  user: MemberUser
  team: { id: string; title: string; teamName: string | null; teamRole: TeamRole } | null
  evidence: { submitted: number; approved: number; rejected: number }
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
  action: 'submitted' | 'resubmitted' | 'approved' | 'rejected'
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
