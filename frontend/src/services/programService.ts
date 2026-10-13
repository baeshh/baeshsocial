import { apiRequest, apiUpload } from '../lib/api'
import type {
  Evidence,
  EvidenceCategory,
  Program,
  ProgramDetail,
  ProgramListItem,
  ProgramParticipant,
  ProgramProject,
  ProgramProjectStatus,
  ProgramStatus,
  ProjectEvidenceResponse,
  TeamRole,
} from '../types/program'

const json = (body: unknown) => JSON.stringify(body)

export type ProgramPayload = {
  title: string
  description?: string | null
  term?: string | null
  status?: ProgramStatus
  startDate?: string | null
  endDate?: string | null
  managerUserIds?: string[]
}

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
  return apiRequest<{ projects: ProgramProject[] }>(`/programs/${programId}/projects`, { token })
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

/* ---------------------------- Participants --------------------------- */

export function getProgramParticipants(token: string, programId: string) {
  return apiRequest<{ participants: ProgramParticipant[] }>(`/programs/${programId}/participants`, { token })
}

export function addProgramParticipants(token: string, programId: string, participants: ParticipantInput[]) {
  return apiRequest<{ added: string[]; skipped: Array<{ input: string; reason: string }>; approvedMemberships: string[] }>(
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
