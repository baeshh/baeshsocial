import type { Project, ProjectInvite, ProjectRegistrationBrief } from '../../../types/project'
import type { ProjectPermission } from '../../../types/projectRole'

/** What every detail tab needs: the project as the server returned it and the viewer's server-resolved access. */
export type ProjectDetailContext = {
  token: string
  project: Project
  can: (permission: ProjectPermission) => boolean
  isOwner: boolean
  isLeader: boolean
  /** Not a team member: sees the overview only, with contact details removed by the server. */
  guestViewer: boolean
  isProgramStaff: boolean
  /** A member locked out of a PRIVATE project. */
  restricted: boolean
  /** A non-owner team member of a personal project (may leave it). */
  isMember: boolean
  registration: ProjectRegistrationBrief | null
  pendingInvites: ProjectInvite[]
  invalidate: () => void
}

export type ProjectTabId = 'overview' | 'tasks' | 'members' | 'activity' | 'files' | 'evidence' | 'reviews' | 'settings'

/** Quick actions open a tab with its form ready. */
export type ProjectCompose = 'task' | 'activity' | null
