import type { AuthUser } from './auth'
import type { ProjectLink } from './profile'
import type { ProjectRole } from './projectRole'

export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
export type ProjectVisibility = 'PRIVATE' | 'TEAM' | 'PUBLIC'
export type ProjectTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type ProjectActivityType = 'UPDATE' | 'TASK' | 'FILE' | 'MILESTONE' | 'INSIGHT'

export type ProjectInviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED'

export type ProjectInvite = {
  id: string
  projectId: string
  inviterId: string
  inviteeId: string
  roleId: string | null
  role: string
  contribution: string | null
  status: ProjectInviteStatus
  createdAt: string
  respondedAt: string | null
  invitee: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
}

export type TeamCandidateRelation = 'following' | 'follower' | 'mutual' | 'participant'

export type TeamCandidate = Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'> & {
  relation: TeamCandidateRelation
}

export type TeamCandidates = {
  following: TeamCandidate[]
  followers: TeamCandidate[]
  mutual: TeamCandidate[]
  participants?: TeamCandidate[]
}

export type ProjectMember = {
  id: string
  projectId: string
  userId: string
  roleId: string | null
  role: string
  contribution: string | null
  joinedAt: string
  user: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
  projectRole?: Pick<ProjectRole, 'id' | 'name' | 'slug' | 'permissions'> | null
  privateAccess?: boolean
}

export type ProjectRegistrationBrief = {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'removed'
  reviewNote: string | null
  createdAt: string
  program: { id: string; title: string; organizationId: string; organizationName: string }
}

export type ProjectTask = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: ProjectTaskStatus
  assigneeId: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  assignee: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'> | null
}

export type ProjectActivity = {
  id: string
  projectId: string
  userId: string
  type: ProjectActivityType
  title: string
  description: string | null
  createdAt: string
  user?: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
}

export type ProjectFile = {
  id: string
  projectId: string
  name: string
  url: string
  fileType: string
  uploadedBy: string
  createdAt: string
  uploader?: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
}

export type Project = {
  id: string
  title: string
  slug: string
  description: string | null
  objective: string | null
  readme: string | null
  ownerId: string
  status: ProjectStatus
  progress: number
  visibility: ProjectVisibility
  skills: string[]
  createdAt: string
  updatedAt: string
  owner: Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'>
  programId?: string | null
  teamName?: string | null
  program?: {
    id: string
    title: string
    status?: string
    allowPublicProjects?: boolean
    allowStudentTeams?: boolean
    organization: { id: string; name: string; type?: string }
  } | null
  roles?: ProjectRole[]
  members: ProjectMember[]
  tasks: ProjectTask[]
  activities: ProjectActivity[]
  files: ProjectFile[]
  externalLinks?: ProjectLink[]
}

/** List rows from GET /projects: summary fields plus counts instead of nested collections. */
export type ProjectSummary = Pick<
  Project,
  | 'id'
  | 'title'
  | 'slug'
  | 'description'
  | 'status'
  | 'progress'
  | 'visibility'
  | 'skills'
  | 'ownerId'
  | 'createdAt'
  | 'updatedAt'
> & {
  programId: string | null
  teamName: string | null
  program: { id: string; title: string; organization: { id: string; name: string } } | null
  counts: {
    tasks: number
    doneTasks: number
    activities: number
    files: number
    members: number
    externalLinks: number
  }
  myRole?: { name: string | null; isLeader: boolean }
  /** A member locked out of a PRIVATE project until a leader grants access. */
  restricted?: boolean
  /** The open task due soonest; null when none is open or the viewer may not see tasks. */
  nextTask?: Pick<ProjectTask, 'id' | 'title' | 'status' | 'dueDate'> | null
}
