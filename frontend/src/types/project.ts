import type { AuthUser } from './auth'
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

export type TeamCandidateRelation = 'following' | 'follower' | 'mutual'

export type TeamCandidate = Pick<AuthUser, 'id' | 'name' | 'email' | 'avatarUrl'> & {
  relation: TeamCandidateRelation
}

export type TeamCandidates = {
  following: TeamCandidate[]
  followers: TeamCandidate[]
  mutual: TeamCandidate[]
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
  roles?: ProjectRole[]
  members: ProjectMember[]
  tasks: ProjectTask[]
  activities: ProjectActivity[]
  files: ProjectFile[]
}
