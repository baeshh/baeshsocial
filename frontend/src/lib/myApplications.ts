import type { OpportunityEnrollment, OpportunityEnrollmentStatus } from '../types/opportunity'
import type { ApplicationStatus, MyProgramApplication, ParticipatingProgram } from '../types/program'

/**
 * Display buckets for "내 지원 현황". Program applications and posted-opportunity sign-ups keep their own
 * statuses and rules; the buckets only decide which tab shows an item.
 */
export type MyApplicationGroup = 'offer' | 'draft' | 'review' | 'waiting' | 'active' | 'ended'
export type MyApplicationTab = 'all' | Exclude<MyApplicationGroup, 'ended'>

export const MY_APPLICATION_TABS: { id: MyApplicationTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'draft', label: '작성 중' },
  { id: 'review', label: '지원 완료·심사 중' },
  { id: 'offer', label: '합격 제안·응답 필요' },
  { id: 'waiting', label: '대기·미선정' },
  { id: 'active', label: '참여 중·완료' },
]

export const myApplicationTabFromParam = (value: string | null): MyApplicationTab =>
  MY_APPLICATION_TABS.some((tab) => tab.id === value) ? (value as MyApplicationTab) : 'all'

const PROGRAM_APPLICATION_GROUP: Record<ApplicationStatus, MyApplicationGroup> = {
  draft: 'draft',
  pending: 'review',
  accepted: 'offer',
  waitlisted: 'waiting',
  rejected: 'waiting',
  confirmed: 'active',
  declined: 'ended',
  withdrawn: 'ended',
}

const ENROLLMENT_GROUP: Record<OpportunityEnrollmentStatus, MyApplicationGroup> = {
  APPLIED: 'review',
  ENROLLED: 'active',
  COMPLETED: 'active',
  REJECTED: 'waiting',
  WITHDRAWN: 'ended',
}

/** Answers that need the applicant come first, then work in progress, then the rest. */
const GROUP_ORDER: MyApplicationGroup[] = ['offer', 'draft', 'review', 'waiting', 'active', 'ended']

export type MyApplicationItem =
  | { kind: 'program-application'; key: string; group: MyApplicationGroup; at: string; application: MyProgramApplication }
  | { kind: 'participation'; key: string; group: 'active'; at: string; program: ParticipatingProgram }
  | { kind: 'enrollment'; key: string; group: MyApplicationGroup; at: string; enrollment: OpportunityEnrollment }

export function buildMyApplications(
  applications: MyProgramApplication[],
  participating: ParticipatingProgram[],
  enrollments: OpportunityEnrollment[],
): MyApplicationItem[] {
  const participatingIds = new Set(participating.map((program) => program.id))
  const items: MyApplicationItem[] = [
    ...participating.map((program) => ({ kind: 'participation' as const, key: `participation-${program.id}`, group: 'active' as const, at: program.joinedAt, program })),
    // A confirmed application and the participation it created are the same programme; show it once.
    ...applications
      .filter((application) => !(application.status === 'confirmed' && participatingIds.has(application.program.id)))
      .map((application) => ({
        kind: 'program-application' as const,
        key: `application-${application.id}`,
        group: PROGRAM_APPLICATION_GROUP[application.status],
        at: application.updatedAt,
        application,
      })),
    // Cancelled sign-ups were never listed here and stay hidden.
    ...enrollments
      .filter((enrollment) => enrollment.status !== 'WITHDRAWN')
      .map((enrollment) => ({
        kind: 'enrollment' as const,
        key: `enrollment-${enrollment.id}`,
        group: ENROLLMENT_GROUP[enrollment.status],
        at: enrollment.completedAt ?? enrollment.enrolledAt ?? enrollment.appliedAt,
        enrollment,
      })),
  ]
  return items.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || b.at.localeCompare(a.at))
}
