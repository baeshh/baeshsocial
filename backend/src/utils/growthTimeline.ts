export type GrowthTimelineEvent = {
  id: string
  kind:
    | 'profile'
    | 'certificate'
    | 'career_start'
    | 'career_end'
    | 'award'
    | 'project_created'
    | 'project_joined'
    | 'project_activity'
    | 'verified'
    | 'program_completed'
  title: string
  description: string
  date: string
}

type TimelineCertificate = {
  id: string
  title: string
  issuer: string
  issuedAt: Date | null
  verified: boolean
}

type TimelineCareer = {
  id: string
  company: string
  position: string
  startDate: Date | null
  endDate: Date | null
  description: string | null
}

type TimelineAward = {
  id: string
  title: string
  issuer: string | null
  awardedAt: Date | null
  description: string | null
}

type TimelineProject = {
  id: string
  title: string
  createdAt: Date
}

type TimelineMembership = {
  id: string
  role: string
  joinedAt: Date
  project: { title: string }
}

type TimelineActivity = {
  id: string
  title: string
  description: string | null
  createdAt: Date
  project: { title: string }
}

type TimelineVerifiedRecord = {
  id: string
  role: string
  contributionSummary: string
  issuedAt: Date
  status: string
  project: { title: string }
}

type TimelineProgramEnrollment = {
  id: string
  completedAt: Date | null
  opportunity: { title: string; organization: string }
}

export type BuildGrowthTimelineInput = {
  profileCreatedAt: Date
  certificates: TimelineCertificate[]
  careers: TimelineCareer[]
  awards: TimelineAward[]
  ownedProjects: TimelineProject[]
  memberships: TimelineMembership[]
  activities: TimelineActivity[]
  verifiedRecords: TimelineVerifiedRecord[]
  programEnrollments: TimelineProgramEnrollment[]
}

function toIso(date: Date) {
  return date.toISOString()
}

function pushEvent(
  events: GrowthTimelineEvent[],
  event: Omit<GrowthTimelineEvent, 'date'> & { date: Date | null },
) {
  if (!event.date) {
    return
  }

  events.push({
    ...event,
    date: toIso(event.date),
  })
}

export function buildGrowthTimeline(input: BuildGrowthTimelineInput): GrowthTimelineEvent[] {
  const events: GrowthTimelineEvent[] = []

  pushEvent(events, {
    id: 'profile-created',
    kind: 'profile',
    title: '프로필 생성',
    description: 'BAESH 커리어 프로필이 생성되었습니다.',
    date: input.profileCreatedAt,
  })

  for (const certificate of input.certificates) {
    pushEvent(events, {
      id: `certificate-${certificate.id}`,
      kind: 'certificate',
      title: `자격증 · ${certificate.title}`,
      description: `${certificate.issuer}${certificate.verified ? ' · 검증됨' : ''}`,
      date: certificate.issuedAt,
    })
  }

  for (const career of input.careers) {
    pushEvent(events, {
      id: `career-start-${career.id}`,
      kind: 'career_start',
      title: `경력 시작 · ${career.company}`,
      description: career.position + (career.description ? ` — ${career.description}` : ''),
      date: career.startDate,
    })

    if (career.endDate) {
      pushEvent(events, {
        id: `career-end-${career.id}`,
        kind: 'career_end',
        title: `경력 종료 · ${career.company}`,
        description: career.position,
        date: career.endDate,
      })
    }
  }

  for (const award of input.awards) {
    pushEvent(events, {
      id: `award-${award.id}`,
      kind: 'award',
      title: `수상 · ${award.title}`,
      description: (award.issuer ?? '발급 기관 미입력') + (award.description ? ` — ${award.description}` : ''),
      date: award.awardedAt,
    })
  }

  for (const project of input.ownedProjects) {
    pushEvent(events, {
      id: `project-created-${project.id}`,
      kind: 'project_created',
      title: `프로젝트 생성 · ${project.title}`,
      description: '내가 소유한 프로젝트가 등록되었습니다.',
      date: project.createdAt,
    })
  }

  for (const membership of input.memberships) {
    pushEvent(events, {
      id: `project-joined-${membership.id}`,
      kind: 'project_joined',
      title: `프로젝트 참여 · ${membership.project.title}`,
      description: `역할: ${membership.role}`,
      date: membership.joinedAt,
    })
  }

  for (const activity of input.activities) {
    pushEvent(events, {
      id: `activity-${activity.id}`,
      kind: 'project_activity',
      title: `${activity.project.title} · ${activity.title}`,
      description: activity.description ?? '프로젝트 활동이 기록되었습니다.',
      date: activity.createdAt,
    })
  }

  for (const record of input.verifiedRecords) {
    const statusLabel =
      record.status === 'VERIFIED' ? '검증 완료' : record.status === 'PENDING' ? '검증 대기' : '검증 반려'

    pushEvent(events, {
      id: `verified-${record.id}`,
      kind: 'verified',
      title: `기여 검증 · ${record.project.title}`,
      description: `${record.role} · ${statusLabel} — ${record.contributionSummary}`,
      date: record.issuedAt,
    })
  }

  for (const enrollment of input.programEnrollments) {
    pushEvent(events, {
      id: `program-${enrollment.id}`,
      kind: 'program_completed',
      title: `프로그램 수료 · ${enrollment.opportunity.title}`,
      description: `${enrollment.opportunity.organization} · 인증된 수료 이력`,
      date: enrollment.completedAt,
    })
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
