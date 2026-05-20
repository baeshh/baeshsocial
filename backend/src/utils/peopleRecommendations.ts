import { prisma } from '../config/prisma.js'

type ProfileViewRow = {
  profileUserId: string
  viewCount: number
}

function isMissingProfileViewStore(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: string }).code)
    return code === 'P2021' || code === 'P2022'
  }
  const message = error instanceof Error ? error.message : String(error)
  return /ProfileView/i.test(message) && /(does not exist|Unknown model)/i.test(message)
}

async function loadProfileViews(viewerId: string): Promise<ProfileViewRow[]> {
  try {
    return await prisma.profileView.findMany({
      where: { viewerId },
      orderBy: { lastViewedAt: 'desc' },
      take: 30,
      select: { profileUserId: true, viewCount: true },
    })
  } catch (error) {
    if (isMissingProfileViewStore(error)) {
      return []
    }
    throw error
  }
}

const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  role: true,
} as const

export type RecommendedPerson = {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  headline: string | null
  company: string | null
  school: string | null
  skills: string[]
  matchReasons: string[]
}

type CandidateSignals = {
  viewedScore: number
  mutualFollow: boolean
  networkHop: boolean
  projectMate: boolean
  engagedAuthor: boolean
  coLiker: boolean
  sharedSkills: number
  sharedInterests: number
  sameSchool: boolean
  sameCompany: boolean
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function overlapCount(a: string[], b: string[]) {
  const setB = new Set(b.map(normalize))
  return a.filter((item) => setB.has(normalize(item))).length
}

function buildMatchReasons(signals: CandidateSignals): string[] {
  const reasons: string[] = []
  if (signals.viewedScore > 0) {
    reasons.push('자주 본 프로필')
  }
  if (signals.sharedSkills >= 2 || (signals.sameSchool && signals.sameCompany)) {
    reasons.push('비슷한 커리어')
  } else if (signals.sharedSkills >= 1 || signals.sameSchool || signals.sameCompany) {
    reasons.push('비슷한 커리어')
  }
  if (signals.projectMate) {
    reasons.push('같은 프로젝트')
  }
  if (signals.sharedInterests >= 1) {
    reasons.push('관심사가 비슷해요')
  }
  if (signals.engagedAuthor || signals.coLiker) {
    reasons.push('함께 본 관심 글')
  }
  if (signals.mutualFollow) {
    reasons.push('맞팔로우')
  } else if (signals.networkHop) {
    reasons.push('연결된 네트워크')
  }
  return [...new Set(reasons)]
}

function scoreCandidate(signals: CandidateSignals): number {
  let score = 0
  score += Math.min(24, signals.viewedScore * 4)
  if (signals.mutualFollow) {
    score += 14
  }
  if (signals.networkHop) {
    score += 8
  }
  if (signals.projectMate) {
    score += 10
  }
  score += Math.min(18, signals.sharedSkills * 4)
  score += Math.min(8, signals.sharedInterests * 2)
  if (signals.sameSchool) {
    score += 7
  }
  if (signals.sameCompany) {
    score += 7
  }
  if (signals.engagedAuthor) {
    score += 9
  }
  if (signals.coLiker) {
    score += 5
  }
  return score
}

async function getEngagedAuthorIds(viewerId: string) {
  const [likes, comments, reposts] = await Promise.all([
    prisma.postLike.findMany({ where: { userId: viewerId }, select: { postId: true } }),
    prisma.comment.findMany({ where: { authorId: viewerId }, select: { postId: true } }),
    prisma.post.findMany({
      where: { authorId: viewerId, repostOfId: { not: null } },
      select: { repostOfId: true },
    }),
  ])

  const postIds = new Set<string>()
  for (const row of likes) {
    postIds.add(row.postId)
  }
  for (const row of comments) {
    postIds.add(row.postId)
  }
  for (const row of reposts) {
    if (row.repostOfId) {
      postIds.add(row.repostOfId)
    }
  }

  if (postIds.size === 0) {
    return { engagedAuthorIds: new Set<string>(), coLikerIds: new Set<string>() }
  }

  const posts = await prisma.post.findMany({
    where: { id: { in: [...postIds] } },
    include: { likes: { select: { userId: true } } },
  })

  const engagedAuthorIds = new Set<string>()
  const coLikerIds = new Set<string>()
  for (const post of posts) {
    engagedAuthorIds.add(post.authorId)
    for (const like of post.likes) {
      if (like.userId !== viewerId) {
        coLikerIds.add(like.userId)
      }
    }
  }

  return { engagedAuthorIds, coLikerIds }
}

export async function getRecommendedPeople(viewerId: string, limit: number): Promise<RecommendedPerson[]> {
  const viewerProfile = await prisma.profile.findUnique({
    where: { userId: viewerId },
    include: { careers: { select: { company: true, position: true } } },
  })

  const viewerSkills = viewerProfile?.skills ?? []
  const viewerInterests = viewerProfile?.interests ?? []
  const viewerSchool = viewerProfile?.school ? normalize(viewerProfile.school) : ''
  const viewerCompany = viewerProfile?.company ? normalize(viewerProfile.company) : ''
  const viewerCareerCompanies = new Set(
    (viewerProfile?.careers ?? []).map((c) => normalize(c.company)),
  )

  const [followingRows, profileViews, projectMemberships, engaged, followerRows] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    }),
    loadProfileViews(viewerId),
    prisma.projectMember.findMany({
      where: { userId: viewerId },
      select: { projectId: true },
    }),
    getEngagedAuthorIds(viewerId),
    prisma.userFollow.findMany({
      where: { followingId: viewerId },
      select: { followerId: true },
    }),
  ])

  const followingIds = new Set(followingRows.map((row) => row.followingId))
  const followerIds = new Set(followerRows.map((row) => row.followerId))
  const excluded = new Set<string>([viewerId, ...followingIds])

  const viewScoreByUser = new Map<string, number>()
  for (const view of profileViews) {
    if (!excluded.has(view.profileUserId)) {
      viewScoreByUser.set(
        view.profileUserId,
        (viewScoreByUser.get(view.profileUserId) ?? 0) + Math.min(6, view.viewCount),
      )
    }
  }

  const candidateFlags = new Map<string, Partial<CandidateSignals>>()

  const addFlag = (userId: string, patch: Partial<CandidateSignals>) => {
    if (excluded.has(userId)) {
      return
    }
    const prev = candidateFlags.get(userId) ?? {}
    candidateFlags.set(userId, {
      viewedScore: Math.max(prev.viewedScore ?? 0, patch.viewedScore ?? 0),
      mutualFollow: prev.mutualFollow || patch.mutualFollow,
      networkHop: prev.networkHop || patch.networkHop,
      projectMate: prev.projectMate || patch.projectMate,
      engagedAuthor: prev.engagedAuthor || patch.engagedAuthor,
      coLiker: prev.coLiker || patch.coLiker,
      sharedSkills: Math.max(prev.sharedSkills ?? 0, patch.sharedSkills ?? 0),
      sharedInterests: Math.max(prev.sharedInterests ?? 0, patch.sharedInterests ?? 0),
      sameSchool: prev.sameSchool || patch.sameSchool,
      sameCompany: prev.sameCompany || patch.sameCompany,
    })
  }

  for (const [userId, viewedScore] of viewScoreByUser) {
    addFlag(userId, { viewedScore })
  }

  if (followingIds.size > 0) {
    const secondHop = await prisma.userFollow.findMany({
      where: { followerId: { in: [...followingIds] } },
      select: { followingId: true, followerId: true },
    })
    for (const row of secondHop) {
      const candidateId = row.followingId
      const isMutual = followingIds.has(candidateId) && followerIds.has(candidateId)
      addFlag(candidateId, {
        networkHop: true,
        mutualFollow: isMutual,
      })
    }
  }

  const projectIds = projectMemberships.map((row) => row.projectId)
  if (projectIds.length > 0) {
    const teammates = await prisma.projectMember.findMany({
      where: { projectId: { in: projectIds }, userId: { not: viewerId } },
      select: { userId: true },
      distinct: ['userId'],
    })
    for (const row of teammates) {
      addFlag(row.userId, { projectMate: true })
    }
  }

  for (const authorId of engaged.engagedAuthorIds) {
    addFlag(authorId, { engagedAuthor: true })
  }
  for (const likerId of engaged.coLikerIds) {
    addFlag(likerId, { coLiker: true })
  }

  if (viewerSkills.length > 0) {
    const skillMatches = await prisma.profile.findMany({
      where: {
        userId: { notIn: [...excluded] },
        skills: { hasSome: viewerSkills },
      },
      select: { userId: true, skills: true, interests: true, school: true, company: true },
      take: 60,
    })
    for (const profile of skillMatches) {
      addFlag(profile.userId, {
        sharedSkills: overlapCount(viewerSkills, profile.skills),
        sharedInterests: overlapCount(viewerInterests, profile.interests),
        sameSchool: Boolean(viewerSchool && profile.school && normalize(profile.school) === viewerSchool),
        sameCompany:
          Boolean(viewerCompany && profile.company && normalize(profile.company) === viewerCompany) ||
          (profile.company ? viewerCareerCompanies.has(normalize(profile.company)) : false),
      })
    }
  }

  const discoveryPool = await prisma.profile.findMany({
    where: { userId: { notIn: [...excluded] } },
    select: { userId: true, skills: true, interests: true, school: true, company: true },
    orderBy: { updatedAt: 'desc' },
    take: Math.max(limit * 4, 24),
  })
  for (const profile of discoveryPool) {
    addFlag(profile.userId, {
      sharedSkills: viewerSkills.length > 0 ? overlapCount(viewerSkills, profile.skills) : 0,
      sharedInterests:
        viewerInterests.length > 0 ? overlapCount(viewerInterests, profile.interests) : 0,
      sameSchool: Boolean(viewerSchool && profile.school && normalize(profile.school) === viewerSchool),
      sameCompany:
        Boolean(viewerCompany && profile.company && normalize(profile.company) === viewerCompany) ||
        (profile.company ? viewerCareerCompanies.has(normalize(profile.company)) : false),
    })
  }

  const candidateIds = [...candidateFlags.keys()]
  if (candidateIds.length === 0) {
    const fallback = await prisma.profile.findMany({
      where: { userId: { not: viewerId } },
      include: {
        user: { select: userSelect },
        careers: { orderBy: { startDate: 'desc' }, take: 1, select: { company: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    })
    return fallback.map((profile) => ({
      userId: profile.user.id,
      name: profile.user.name,
      avatarUrl: profile.user.avatarUrl,
      role: profile.user.role,
      headline: profile.headline,
      company: profile.company ?? profile.careers[0]?.company ?? null,
      school: profile.school,
      skills: profile.skills.slice(0, 6),
      matchReasons: ['새로운 연결'],
    }))
  }

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: candidateIds } },
    include: {
      user: { select: userSelect },
      careers: { orderBy: { startDate: 'desc' }, take: 3, select: { company: true, position: true } },
    },
  })

  type RankedRow = {
    score: number
    signals: CandidateSignals
    matchReasons: string[]
    person: RecommendedPerson
  }

  const ranked: RankedRow[] = profiles
    .map((profile) => {
      const flags = candidateFlags.get(profile.userId) ?? {}
      const careerCompanies = profile.careers.map((c) => normalize(c.company))
      const signals: CandidateSignals = {
        viewedScore: flags.viewedScore ?? 0,
        mutualFollow: flags.mutualFollow ?? false,
        networkHop: flags.networkHop ?? false,
        projectMate: flags.projectMate ?? false,
        engagedAuthor: flags.engagedAuthor ?? false,
        coLiker: flags.coLiker ?? false,
        sharedSkills:
          flags.sharedSkills ??
          (viewerSkills.length > 0 ? overlapCount(viewerSkills, profile.skills) : 0),
        sharedInterests:
          flags.sharedInterests ??
          (viewerInterests.length > 0 ? overlapCount(viewerInterests, profile.interests) : 0),
        sameSchool:
          flags.sameSchool ??
          Boolean(viewerSchool && profile.school && normalize(profile.school) === viewerSchool),
        sameCompany:
          flags.sameCompany ??
          Boolean(
            (viewerCompany && profile.company && normalize(profile.company) === viewerCompany) ||
              careerCompanies.some((company) => viewerCareerCompanies.has(company)),
          ),
      }
      const rawScore = scoreCandidate(signals)
      const score = rawScore > 0 ? rawScore : 1
      const matchReasons = buildMatchReasons(signals)
      const latestCareer = profile.careers[0]
      const reasons = matchReasons.length > 0 ? matchReasons : ['추천 연결']
      return {
        score,
        signals,
        matchReasons: reasons,
        person: {
          userId: profile.user.id,
          name: profile.user.name,
          avatarUrl: profile.user.avatarUrl,
          role: profile.user.role,
          headline: profile.headline,
          company: profile.company ?? latestCareer?.company ?? null,
          school: profile.school,
          skills: profile.skills.slice(0, 6),
          matchReasons: reasons,
        },
      }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)

  const hasOtherSignals = (signals: CandidateSignals) =>
    signals.mutualFollow ||
    signals.networkHop ||
    signals.projectMate ||
    signals.engagedAuthor ||
    signals.coLiker ||
    signals.sharedSkills > 0 ||
    signals.sharedInterests > 0 ||
    signals.sameSchool ||
    signals.sameCompany

  const viewedHeavy = ranked.filter((row) => row.signals.viewedScore > 0 && !hasOtherSignals(row.signals))
  const others = ranked.filter((row) => row.signals.viewedScore === 0 || hasOtherSignals(row.signals))

  const maxViewedOnlySlots = Math.min(2, Math.max(0, limit - 1))
  const picked: RankedRow[] = []
  const pickedIds = new Set<string>()

  const pushRow = (row: RankedRow) => {
    if (picked.length >= limit || pickedIds.has(row.person.userId)) {
      return
    }
    pickedIds.add(row.person.userId)
    picked.push(row)
  }

  for (const row of viewedHeavy.slice(0, maxViewedOnlySlots)) {
    pushRow(row)
  }
  for (const row of others) {
    pushRow(row)
  }
  for (const row of viewedHeavy.slice(maxViewedOnlySlots)) {
    pushRow(row)
  }

  if (picked.length < limit) {
    const backfill = await prisma.profile.findMany({
      where: {
        userId: {
          notIn: [viewerId, ...pickedIds, ...excluded],
        },
      },
      include: {
        user: { select: userSelect },
        careers: { orderBy: { startDate: 'desc' }, take: 1, select: { company: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit - picked.length,
    })
    for (const profile of backfill) {
      pushRow({
        score: 1,
        signals: {
          viewedScore: 0,
          mutualFollow: false,
          networkHop: false,
          projectMate: false,
          engagedAuthor: false,
          coLiker: false,
          sharedSkills: 0,
          sharedInterests: 0,
          sameSchool: false,
          sameCompany: false,
        },
        matchReasons: ['새로운 연결'],
        person: {
          userId: profile.user.id,
          name: profile.user.name,
          avatarUrl: profile.user.avatarUrl,
          role: profile.user.role,
          headline: profile.headline,
          company: profile.company ?? profile.careers[0]?.company ?? null,
          school: profile.school,
          skills: profile.skills.slice(0, 6),
          matchReasons: ['새로운 연결'],
        },
      })
    }
  }

  return picked.map((row) => row.person)
}

export async function recordProfileView(viewerId: string, profileUserId: string) {
  if (viewerId === profileUserId) {
    return
  }

  try {
    await prisma.profileView.upsert({
      where: {
        viewerId_profileUserId: { viewerId, profileUserId },
      },
      create: { viewerId, profileUserId },
      update: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    })
  } catch (error) {
    if (!isMissingProfileViewStore(error)) {
      throw error
    }
  }
}
