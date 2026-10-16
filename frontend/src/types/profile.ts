import type { AuthUser } from './auth'
import type { ProjectStatus, ProjectVisibility } from './project'

export type Paged<K extends string, T> = { [key in K]: T[] } & { nextCursor: string | null }

export type ProfileVisibility = 'PUBLIC' | 'MEMBERS' | 'FOLLOWERS'

export type ProjectLinkType = 'github' | 'figma' | 'notion' | 'google_drive' | 'deployment' | 'other'

export type ProjectLink = {
  id: string
  type: ProjectLinkType
  url: string
  label: string | null
  description: string | null
}

export type SkillBreakdownItem = {
  label: string
  pct: number
  color: string
}

export type AISkillInsights = {
  summary: string
  maturityLevel: 'foundation' | 'growing' | 'advanced'
  recommendedFocus: string[]
  skillBreakdown: SkillBreakdownItem[]
}

export type ProfileProjectCard = {
  id: string
  title: string
  /** null on limited cards: only the verified record is shared, not the live project. */
  status: ProjectStatus | null
  progress: number | null
  skills: string[]
  visibility: ProjectVisibility
  updatedAt: string
  startDate: string | null
  endDate: string | null
  /** limited: the viewer only sees that an institution verified this team project. */
  access: 'full' | 'limited'
  description: string | null
  highlight: string | null
  isOwner: boolean
  role: string
  teamName: string | null
  program: { id: string; title: string; organizationName: string } | null
  links: ProjectLink[]
  verification: {
    count: number
    issuer: string | null
    verifiedAt: string | null
    official?: boolean
    officialRole?: string | null
  } | null
  featured: boolean
  /** Owner's own view only: hidden from everyone else's view of the profile. */
  hiddenFromProfile?: boolean
}

export type ProfileProjectFilter = 'all' | 'owned' | 'joined' | 'verified'

export type HistoryKind = 'award' | 'certificate' | 'career' | 'program' | 'project'
export type HistoryFilter = 'all' | 'verified' | HistoryKind

export type HistoryVerification = {
  /** institution: an organization approved submitted evidence · program: program completion · baesh: operator-confirmed */
  kind: 'institution' | 'program' | 'baesh'
  issuer: string | null
  label: string
  verifiedAt: string | null
  programTitle?: string | null
  verifiedBy?: string | null
  /** An institution signed off the project outcome and this student's role and contribution. */
  official?: boolean
}

export type HistoryRecordControl = {
  id: string
  kind: 'evidence' | 'contribution'
  disclosure: 'hidden' | 'summary' | 'full'
  programCap: 'hidden' | 'summary' | 'full' | null
  effective: 'hidden' | 'summary' | 'full'
}

export type HistoryItem = {
  id: string
  sourceId: string
  kind: HistoryKind
  title: string
  subtitle: string | null
  description: string | null
  date: string | null
  endDate: string | null
  ongoing: boolean
  category: string | null
  status: string | null
  verification: HistoryVerification | null
  link: string | null
  project: { id: string; title: string; accessible: boolean; hiddenFromProfile?: boolean } | null
  editable: boolean
  fields: Record<string, string | null> | null
  /** Present for the record owner only: lets them choose how much others see. */
  record?: HistoryRecordControl | null
}

export type HistoryCounts = Record<HistoryFilter, number>

export type ProfileAffiliation = {
  organizationId: string
  name: string
  type: string
  title: string | null
}

export type ProfileOverview = {
  user: Pick<AuthUser, 'id' | 'name' | 'avatarUrl' | 'coverUrl'> & { role: string; email?: string; createdAt: string }
  profile: {
    headline: string | null
    skills: string[]
    school: string | null
    company: string | null
    bio: string | null
    location: string | null
    interests: string[]
    socialLinks: Record<string, string> | null
    visibility?: ProfileVisibility
    featuredProjectIds?: string[]
    talentSearchOptIn?: boolean
  }
  affiliations: ProfileAffiliation[]
  stats: {
    followerCount: number
    followingCount: number
    postCount: number
    projectCount: number
    historyCount: number
    verifiedCount: number
  }
  historyCounts: HistoryCounts | null
  isFollowing: boolean
  isOwnProfile: boolean
  canViewDetails: boolean
  featuredProjects: ProfileProjectCard[]
  featuredMode: 'pinned' | 'recent'
  verifiedHighlights: HistoryItem[]
  recentHistory: HistoryItem[]
  aiSkillInsights: AISkillInsights | null
}
