import type { AuthUser } from './auth'

export type Profile = {
  id: string
  userId: string
  headline: string | null
  bio: string | null
  school: string | null
  company: string | null
  location: string | null
  skills: string[]
  interests: string[]
  socialLinks: Record<string, string> | null
  trustScore: number
  verified: boolean
  createdAt: string
  updatedAt: string
  user: AuthUser
  certificates: Certificate[]
  careers: Career[]
  awards: Award[]
  portfolios: Portfolio[]
}

export type CertificateSource = 'MANUAL' | 'PROGRAM'

export type Certificate = {
  id: string
  profileId: string
  title: string
  issuer: string
  issuedAt: string | null
  credentialUrl: string | null
  verified: boolean
  source?: CertificateSource
  opportunityId?: string | null
}

export type Career = {
  id: string
  profileId: string
  company: string
  position: string
  startDate: string | null
  endDate: string | null
  description: string | null
}

export type Award = {
  id: string
  profileId: string
  title: string
  issuer: string | null
  awardedAt: string | null
  description: string | null
}

export type Portfolio = {
  id: string
  profileId: string
  title: string
  description: string | null
  url: string | null
  imageUrl: string | null
}

export type ProfileProject = {
  id: string
  title: string
  slug: string
  description: string | null
  status: string
  progress: number
  skills: string[]
  updatedAt: string
  memberRole?: string
  contribution?: string | null
}

export type VerifiedRecord = {
  id: string
  userId: string
  projectId: string
  role: string
  contributionSummary: string
  evidenceUrl: string | null
  trustScore: number
  issuedAt: string
  status: string
  project: {
    id: string
    title: string
    slug: string
  }
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

export type GrowthTimelineItem = {
  id: string
  kind: string
  title: string
  description: string
  date: string
}

export type ProgramEnrollmentStatus =
  | 'APPLIED'
  | 'ENROLLED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'WITHDRAWN'

export type ProgramEnrollment = {
  id: string
  userId: string
  opportunityId: string
  status: ProgramEnrollmentStatus
  appliedAt: string
  enrolledAt: string | null
  completedAt: string | null
  opportunity: {
    id: string
    title: string
    organization: string
    type: string
  }
  certificate: {
    id: string
    verified: boolean
    issuedAt: string | null
  } | null
}

export type ProfileStats = {
  followerCount: number
  followingCount: number
  postCount: number
}

export type ProfilePayload = {
  profile: Profile
  projects: ProfileProject[]
  verifiedRecords: VerifiedRecord[]
  programEnrollments: ProgramEnrollment[]
  stats: ProfileStats
  isFollowing: boolean
  isOwnProfile: boolean
  aiSkillInsights: AISkillInsights
  growthTimeline: GrowthTimelineItem[]
}
