import { apiRequest, apiUpload } from '../lib/api'
import type {
  AnswerValue,
  ApplicationField,
  ApplicationFile,
  ApplicationStatus,
  DeliveryMode,
  ProgramAudience,
  ProgramBenefit,
  ProgramCategory,
  ProgramEligibility,
  DiscoverableProgram,
  DiscoverProgramsPage,
  Evidence,
  EvidenceCategory,
  LinkableProject,
  MyProgramApplication,
  ParticipatingProgram,
  MyVerifiedRecord,
  Program,
  ProgramApplication,
  ProgramApplicationsResponse,
  ProgramDetail,
  ProgramVisibility,
  RecruitmentMode,
  ProgramListItem,
  ProgramParticipant,
  ProgramPolicy,
  ProgramProject,
  ProgramProjectsSummary,
  ProgramProjectStatus,
  ProgramStatus,
  ProjectEvidenceResponse,
  ProjectRegistration,
  ProjectReview,
  ProjectReviewKind,
  ProjectReviewsResponse,
  ProjectVerificationResponse,
  ProjectVisibility,
  RecordDisclosure,
  RegistrationStatus,
  TeamRole,
  VerifyMemberInput,
} from '../types/program'

const json = (body: unknown) => JSON.stringify(body)

export type ApplicationFieldPayload = Omit<ApplicationField, 'id'> & { id?: string }

export type ProgramPayload = {
  title: string
  description?: string | null
  term?: string | null
  status?: ProgramStatus
  startDate?: string | null
  endDate?: string | null
  managerUserIds?: string[]
  visibility?: ProgramVisibility
  recruitmentMode?: RecruitmentMode
  category?: ProgramCategory | null
  coverImageUrl?: string | null
  audiences?: ProgramAudience[]
  targetAudience?: string | null
  eligibility?: ProgramEligibility | null
  benefits?: ProgramBenefit[]
  benefitsNote?: string | null
  capacity?: number | null
  applyStartAt?: string | null
  applyEndAt?: string | null
  announceAt?: string | null
  selectionProcess?: string | null
  deliveryMode?: DeliveryMode | null
  location?: string | null
  publish?: boolean
  applicationFields?: ApplicationFieldPayload[]
} & Partial<ProgramPolicy>

export type PublicationAction = 'publish' | 'unpublish' | 'close_recruitment' | 'reopen_recruitment' | 'rotate_share_link'

export type ProgramProjectPayload = {
  title: string
  teamName?: string | null
  objective?: string | null
  description?: string | null
  status?: ProgramProjectStatus
  startDate?: string | null
  endDate?: string | null
}

export type ParticipantInput = { email?: string; userId?: string; studentNo?: string; department?: string }

/* ---------------------- Discovery & applications ---------------------- */

export function discoverPrograms(
  token: string | null,
  params: { page: number; pageSize: number; q?: string; category?: ProgramCategory | null; openOnly?: boolean },
) {
  const search = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) })
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.openOnly) search.set('openOnly', 'true')
  return apiRequest<DiscoverProgramsPage>(`/programs/discover?${search}`, { token })
}

export function getDiscoverableProgram(token: string | null, programId: string, shareToken?: string | null) {
  const query = shareToken ? `?t=${encodeURIComponent(shareToken)}` : ''
  return apiRequest<{ program: DiscoverableProgram }>(`/programs/discover/${programId}${query}`, { token })
}

export function saveMyApplication(
  token: string,
  programId: string,
  payload: { answers: Record<string, AnswerValue>; submit: boolean; shareToken?: string | null },
) {
  return apiRequest<{ application: { id: string; status: ApplicationStatus } }>(`/programs/${programId}/applications/me`, {
    method: 'PUT',
    token,
    body: json({ ...payload, shareToken: payload.shareToken || undefined }),
  })
}

export function uploadApplicationFile(token: string, programId: string, fieldId: string, file: File, shareToken?: string | null) {
  const form = new FormData()
  form.append('fieldId', fieldId)
  if (shareToken) form.append('shareToken', shareToken)
  form.append('file', file)
  return apiUpload<{ file: ApplicationFile }>(`/programs/${programId}/applications/me/files`, form, { token })
}

export function deleteApplicationFile(token: string, programId: string, fileId: string) {
  return apiRequest<void>(`/programs/${programId}/applications/me/files/${fileId}`, { method: 'DELETE', token })
}

export function getApplicationFileUrl(token: string, fileId: string, download = false) {
  return apiRequest<{ url: string; expiresAt: string }>(`/programs/application-files/${fileId}/url${download ? '?download=1' : ''}`, {
    token,
  })
}

/** Withdraws a submitted application, or discards a draft. */
export function withdrawProgramApplication(token: string, programId: string) {
  return apiRequest<void>(`/programs/${programId}/applications/me`, { method: 'DELETE', token })
}

export function getApplicationForm(token: string, programId: string) {
  return apiRequest<{ fields: ApplicationField[]; submittedCount: number }>(`/programs/${programId}/application-form`, { token })
}

export function saveApplicationForm(token: string, programId: string, fields: ApplicationFieldPayload[]) {
  return apiRequest<{ fields: ApplicationField[] }>(`/programs/${programId}/application-form`, {
    method: 'PUT',
    token,
    body: json({ fields }),
  })
}

export function updateProgramPublication(token: string, programId: string, action: PublicationAction) {
  return apiRequest<{ program: Program }>(`/programs/${programId}/publication`, { method: 'POST', token, body: json({ action }) })
}

export function getParticipatingPrograms(token: string) {
  return apiRequest<{ programs: ParticipatingProgram[] }>('/programs/participating', { token })
}

export function getMyProgramApplications(token: string) {
  return apiRequest<{ applications: MyProgramApplication[] }>('/programs/applications/me', { token })
}

export function getProgramApplications(token: string, programId: string, status: ApplicationStatus | 'all') {
  return apiRequest<ProgramApplicationsResponse>(`/programs/${programId}/applications?status=${status}`, { token })
}

export function decideProgramApplication(
  token: string,
  programId: string,
  applicationId: string,
  decision: 'accept' | 'reject',
  note?: string,
) {
  return apiRequest<{ application: ProgramApplication }>(`/programs/${programId}/applications/${applicationId}`, {
    method: 'PATCH',
    token,
    body: json({ decision, note: note?.trim() || null }),
  })
}

/* ------------------------------ Programs ----------------------------- */

export function getOrganizationPrograms(token: string, orgId: string) {
  return apiRequest<{ programs: ProgramListItem[]; canCreate: boolean }>(`/organizations/${orgId}/programs`, { token })
}

export function createProgram(token: string, orgId: string, payload: ProgramPayload) {
  return apiRequest<{ program: Program }>(`/organizations/${orgId}/programs`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function getProgram(token: string, programId: string) {
  return apiRequest<ProgramDetail>(`/programs/${programId}`, { token })
}

export function updateProgram(token: string, programId: string, payload: Partial<ProgramPayload>) {
  return apiRequest<{ program: Program }>(`/programs/${programId}`, { method: 'PATCH', token, body: json(payload) })
}

export function deleteProgram(token: string, programId: string) {
  return apiRequest<void>(`/programs/${programId}`, { method: 'DELETE', token })
}

/* ------------------------------ Projects ----------------------------- */

export function getProgramProjects(token: string, programId: string) {
  return apiRequest<{ projects: ProgramProject[]; summary: ProgramProjectsSummary | null }>(`/programs/${programId}/projects`, {
    token,
  })
}

export function createProgramProject(token: string, programId: string, payload: ProgramProjectPayload) {
  return apiRequest<{ project: ProgramProject }>(`/programs/${programId}/projects`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function updateProgramProject(
  token: string,
  programId: string,
  projectId: string,
  payload: Partial<ProgramProjectPayload>,
) {
  return apiRequest<{ project: ProgramProject }>(`/programs/${programId}/projects/${projectId}`, {
    method: 'PATCH',
    token,
    body: json(payload),
  })
}

export function moveProgramProject(token: string, programId: string, projectId: string, targetProgramId: string) {
  return apiRequest<{ ok: true; programId: string }>(`/programs/${programId}/projects/${projectId}/move`, {
    method: 'POST',
    token,
    body: json({ targetProgramId }),
  })
}

export function assignTeamMembers(
  token: string,
  programId: string,
  projectId: string,
  userIds: string[],
  teamRole: TeamRole,
) {
  return apiRequest<{ added: string[]; skipped: Array<{ userId: string; reason: string }> }>(
    `/programs/${programId}/projects/${projectId}/members`,
    { method: 'POST', token, body: json({ userIds, teamRole }) },
  )
}

export function removeTeamMember(token: string, programId: string, projectId: string, userId: string) {
  return apiRequest<void>(`/programs/${programId}/projects/${projectId}/members/${userId}`, { method: 'DELETE', token })
}

/* ---------------------- Student project registration --------------------- */

export type ProjectRequestPayload =
  | {
      mode: 'new'
      title: string
      teamName?: string | null
      objective?: string | null
      description?: string | null
      skills?: string[]
      visibility?: ProjectVisibility
      message?: string | null
    }
  | { mode: 'existing'; projectId: string; teamName?: string | null; message?: string | null }

export function createProjectRequest(token: string, programId: string, payload: ProjectRequestPayload) {
  return apiRequest<{ registration: ProjectRegistration }>(`/programs/${programId}/project-requests`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function getProjectRequests(token: string, programId: string, status: RegistrationStatus | 'all' = 'all') {
  return apiRequest<{ requests: ProjectRegistration[] }>(`/programs/${programId}/project-requests?status=${status}`, { token })
}

export function decideProjectRequest(
  token: string,
  programId: string,
  requestId: string,
  decision: 'approve' | 'reject' | 'withdraw',
  note?: string,
) {
  return apiRequest<{ registration: ProjectRegistration }>(`/programs/${programId}/project-requests/${requestId}`, {
    method: 'PATCH',
    token,
    body: json({ decision, note: note || undefined }),
  })
}

export function getLinkableProjects(token: string, programId: string) {
  return apiRequest<{ projects: LinkableProject[] }>(`/programs/${programId}/linkable-projects`, { token })
}

/* --------------------------- Reviews & removal --------------------------- */

export function getProjectReviews(token: string, programId: string, projectId: string) {
  return apiRequest<ProjectReviewsResponse>(`/programs/${programId}/projects/${projectId}/reviews`, { token })
}

export function createProjectReview(
  token: string,
  programId: string,
  projectId: string,
  payload: { kind: ProjectReviewKind; body: string; parentId?: string; targetUserId?: string },
) {
  return apiRequest<{ review: ProjectReview }>(`/programs/${programId}/projects/${projectId}/reviews`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function resolveProjectReview(token: string, programId: string, projectId: string, reviewId: string, note?: string) {
  return apiRequest<{ review: ProjectReview }>(`/programs/${programId}/projects/${projectId}/reviews/${reviewId}`, {
    method: 'PATCH',
    token,
    body: json({ status: 'resolved', note: note || undefined }),
  })
}

export function removeProgramProject(token: string, programId: string, projectId: string, reason: string) {
  return apiRequest<{ ok: true }>(`/programs/${programId}/projects/${projectId}/remove`, {
    method: 'POST',
    token,
    body: json({ reason }),
  })
}

/* ---------------------------- Verification ---------------------------- */

export function getProjectVerification(token: string, programId: string, projectId: string) {
  return apiRequest<ProjectVerificationResponse>(`/programs/${programId}/projects/${projectId}/verification`, { token })
}

export function verifyProject(
  token: string,
  programId: string,
  projectId: string,
  payload: { outcomeSummary: string; members: VerifyMemberInput[] },
) {
  return apiRequest<{ verificationId: string }>(`/programs/${programId}/projects/${projectId}/verification`, {
    method: 'POST',
    token,
    body: json(payload),
  })
}

export function verifyProjectMembers(token: string, programId: string, projectId: string, members: VerifyMemberInput[]) {
  return apiRequest<{ ok: true }>(`/programs/${programId}/projects/${projectId}/verify-members`, {
    method: 'POST',
    token,
    body: json({ members }),
  })
}

export function revokeProjectVerification(token: string, programId: string, projectId: string, reason: string, userId?: string) {
  return apiRequest<{ ok: true; revoked: number }>(`/programs/${programId}/projects/${projectId}/revoke-verification`, {
    method: 'POST',
    token,
    body: json({ reason, userId }),
  })
}

/* --------------------------- Record disclosure --------------------------- */

export function getMyVerifiedRecords(token: string) {
  return apiRequest<{ records: MyVerifiedRecord[] }>('/verified-records/mine', { token })
}

export function updateRecordDisclosure(token: string, recordId: string, disclosure: RecordDisclosure) {
  return apiRequest<{ record: MyVerifiedRecord }>(`/verified-records/${recordId}/visibility`, {
    method: 'PATCH',
    token,
    body: json({ disclosure }),
  })
}

/* ---------------------------- Participants --------------------------- */

export function getProgramParticipants(token: string, programId: string) {
  return apiRequest<{ participants: ProgramParticipant[] }>(`/programs/${programId}/participants`, { token })
}

export function addProgramParticipants(token: string, programId: string, participants: ParticipantInput[]) {
  return apiRequest<{ added: string[]; skipped: Array<{ input: string; reason: string; needsInvite?: boolean }> }>(
    `/programs/${programId}/participants`,
    { method: 'POST', token, body: json({ participants }) },
  )
}

export function removeProgramParticipant(token: string, programId: string, userId: string) {
  return apiRequest<void>(`/programs/${programId}/participants/${userId}`, { method: 'DELETE', token })
}

/* ------------------------------ Evidence ----------------------------- */

export function getReviewQueue(
  token: string,
  programId: string,
  status: 'submitted' | 'approved' | 'rejected' | 'all' = 'submitted',
) {
  return apiRequest<{ evidence: Evidence[] }>(`/programs/${programId}/evidence?status=${status}`, { token })
}

export function getProjectEvidence(token: string, projectId: string) {
  return apiRequest<ProjectEvidenceResponse>(`/projects/${projectId}/evidence`, { token })
}

export type EvidenceFields = {
  title: string
  description?: string
  category: EvidenceCategory
  activityDate: string
}

export function createEvidence(token: string, projectId: string, fields: EvidenceFields, files: File[]) {
  const form = new FormData()
  form.append('title', fields.title)
  if (fields.description) form.append('description', fields.description)
  form.append('category', fields.category)
  form.append('activityDate', fields.activityDate)
  for (const file of files) form.append('files', file)
  return apiUpload<{ evidence: Evidence }>(`/projects/${projectId}/evidence`, form, { token })
}

export function updateEvidence(token: string, evidenceId: string, fields: Partial<EvidenceFields>) {
  return apiRequest<{ evidence: Evidence }>(`/evidence/${evidenceId}`, { method: 'PATCH', token, body: json(fields) })
}

export function deleteEvidence(token: string, evidenceId: string) {
  return apiRequest<void>(`/evidence/${evidenceId}`, { method: 'DELETE', token })
}

export function addEvidenceFiles(token: string, evidenceId: string, files: File[]) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return apiUpload<{ evidence: Evidence }>(`/evidence/${evidenceId}/files`, form, { token })
}

export function removeEvidenceFile(token: string, evidenceId: string, fileId: string) {
  return apiRequest<{ evidence: Evidence }>(`/evidence/${evidenceId}/files/${fileId}`, { method: 'DELETE', token })
}

export function submitEvidence(token: string, evidenceId: string) {
  return apiRequest<{ evidence: Evidence }>(`/evidence/${evidenceId}/submit`, { method: 'POST', token })
}

export function reviewEvidence(token: string, evidenceId: string, decision: 'approve' | 'reject', note?: string) {
  return apiRequest<{ evidence: Evidence }>(`/evidence/${evidenceId}/review`, {
    method: 'POST',
    token,
    body: json({ decision, note }),
  })
}

export function revokeEvidence(token: string, evidenceId: string, reason: string) {
  return apiRequest<{ evidence: Evidence }>(`/evidence/${evidenceId}/revoke`, { method: 'POST', token, body: json({ reason }) })
}

export function getEvidenceFileUrl(token: string, fileId: string, download = false) {
  return apiRequest<{ url: string; expiresAt: string }>(
    `/evidence-files/${fileId}/url${download ? '?download=1' : ''}`,
    { token },
  )
}
