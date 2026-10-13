import type { EvidenceFile, EvidenceReview, Program, ProjectEvidence, VerifiedRecordStatus } from '@prisma/client'

export const userBriefSelect = { id: true, name: true, email: true, avatarUrl: true } as const

type UserBrief = { id: string; name: string; email: string; avatarUrl: string | null }

const lower = <T extends string>(value: T) => value.toLowerCase() as Lowercase<T>

export function serializeProgram(
  program: Program & {
    _count?: { projects: number; participants: number }
    managers?: { user: UserBrief }[]
  },
) {
  return {
    id: program.id,
    organizationId: program.organizationId,
    title: program.title,
    description: program.description,
    term: program.term,
    status: lower(program.status),
    startDate: program.startDate,
    endDate: program.endDate,
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
    projectCount: program._count?.projects ?? null,
    participantCount: program._count?.participants ?? null,
    managers: program.managers?.map((manager) => manager.user) ?? [],
    policy: serializeProgramPolicy(program),
    visibility: lower(program.visibility),
    recruitment: serializeRecruitment(program),
  }
}

export type RecruitmentState = 'selected' | 'upcoming' | 'open' | 'closed'

/** SELECTED programs take no applications; RECRUITING ones are open only inside the apply window of a live program. */
export function recruitmentState(program: Program, now = new Date()): RecruitmentState {
  if (program.recruitmentMode === 'SELECTED') return 'selected'
  if (program.status === 'COMPLETED' || program.status === 'ARCHIVED') return 'closed'
  if (program.applyStartAt && now < program.applyStartAt) return 'upcoming'
  if (program.applyEndAt && now > program.applyEndAt) return 'closed'
  return 'open'
}

export function serializeRecruitment(program: Program) {
  return {
    mode: lower(program.recruitmentMode),
    state: recruitmentState(program),
    targetAudience: program.targetAudience,
    capacity: program.capacity,
    applyStartAt: program.applyStartAt,
    applyEndAt: program.applyEndAt,
    announceAt: program.announceAt,
    selectionProcess: program.selectionProcess,
    deliveryMode: program.deliveryMode ? lower(program.deliveryMode) : null,
    location: program.location,
  }
}

export function serializeProgramPolicy(program: Program) {
  return {
    allowStudentProjects: program.allowStudentProjects,
    requireProjectApproval: program.requireProjectApproval,
    allowStudentTeams: program.allowStudentTeams,
    allowPublicProjects: program.allowPublicProjects,
    allowMultipleProjects: program.allowMultipleProjects,
    recordDisclosure: lower(program.recordDisclosure),
  }
}

export function teamRoleOf(roleSlug: string | null | undefined) {
  return roleSlug === 'admin' || roleSlug === 'owner' ? ('leader' as const) : ('member' as const)
}

export function serializeEvidenceFile(file: EvidenceFile) {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    kind: lower(file.kind),
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    scanStatus: file.scanStatus,
    createdAt: file.createdAt,
  }
}

export function serializeEvidence(
  evidence: ProjectEvidence & {
    author?: UserBrief
    reviewedBy?: Pick<UserBrief, 'id' | 'name'> | null
    files?: EvidenceFile[]
    reviews?: (EvidenceReview & { actor?: Pick<UserBrief, 'id' | 'name'> | null })[]
    verifiedRecord?: {
      id: string
      status?: VerifiedRecordStatus
      verifiedAt?: Date | null
      revokedAt?: Date | null
      revokeReason?: string | null
    } | null
    project?: { id: string; title: string; teamName: string | null; programId: string | null }
  },
) {
  return {
    id: evidence.id,
    projectId: evidence.projectId,
    title: evidence.title,
    description: evidence.description,
    category: lower(evidence.category),
    activityDate: evidence.activityDate,
    status: lower(evidence.status),
    submittedAt: evidence.submittedAt,
    reviewedAt: evidence.reviewedAt,
    reviewNote: evidence.reviewNote,
    createdAt: evidence.createdAt,
    updatedAt: evidence.updatedAt,
    author: evidence.author ?? null,
    reviewedBy: evidence.reviewedBy ?? null,
    files: evidence.files?.map(serializeEvidenceFile) ?? [],
    history:
      evidence.reviews?.map((review) => ({
        id: review.id,
        action: lower(review.action),
        note: review.note,
        actor: review.actor ?? null,
        createdAt: review.createdAt,
      })) ?? [],
    verifiedRecordId: evidence.verifiedRecord?.id ?? null,
    verifiedRecord: evidence.verifiedRecord?.status
      ? {
          id: evidence.verifiedRecord.id,
          status: lower(evidence.verifiedRecord.status),
          verifiedAt: evidence.verifiedRecord.verifiedAt ?? null,
          revokedAt: evidence.verifiedRecord.revokedAt ?? null,
          revokeReason: evidence.verifiedRecord.revokeReason ?? null,
        }
      : null,
    project: evidence.project ?? null,
  }
}

export const evidenceInclude = {
  author: { select: userBriefSelect },
  reviewedBy: { select: { id: true, name: true } },
  files: { orderBy: { createdAt: 'asc' } },
  reviews: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true } } } },
  verifiedRecord: { select: { id: true, status: true, verifiedAt: true, revokedAt: true, revokeReason: true } },
} as const
