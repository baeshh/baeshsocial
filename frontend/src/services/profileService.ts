import { apiRequest, withQuery } from '../lib/api'
import type {
  HistoryFilter,
  HistoryItem,
  Paged,
  ProfileOverview,
  ProfileProjectCard,
  ProfileProjectFilter,
  ProfileVisibility,
} from '../types/profile'

export type UpdateProfilePayload = Partial<{
  headline: string | null
  bio: string | null
  school: string | null
  company: string | null
  location: string | null
  skills: string[]
  interests: string[]
  socialLinks: Record<string, string> | null
  visibility: Lowercase<ProfileVisibility>
  talentSearchOptIn: boolean
}>

export type CertificatePayload = {
  title: string
  issuer: string
  issuedAt?: string | null
  credentialUrl?: string | null
}

export type CareerPayload = {
  company: string
  position: string
  startDate?: string | null
  endDate?: string | null
  description?: string | null
}

export type AwardPayload = {
  title: string
  issuer?: string | null
  awardedAt?: string | null
  description?: string | null
}

export type EditableHistoryKind = 'certificate' | 'career' | 'award'

const HISTORY_PATHS: Record<EditableHistoryKind, string> = {
  certificate: 'certificates',
  career: 'careers',
  award: 'awards',
}

export function getProfileOverview(token: string | null, userId: string) {
  return apiRequest<ProfileOverview>(`/profiles/${userId}/overview`, { token })
}

export function getProfileProjects(
  token: string | null,
  userId: string,
  params: { cursor?: string | null; limit?: number; filter?: ProfileProjectFilter } = {},
) {
  return apiRequest<Paged<'projects', ProfileProjectCard>>(
    withQuery(`/profiles/${userId}/projects`, {
      limit: params.limit ?? 10,
      cursor: params.cursor,
      filter: params.filter === 'all' ? undefined : params.filter,
    }),
    { token },
  )
}

export type HistoryPage = {
  items: HistoryItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function getProfileHistoryPage(
  token: string | null,
  userId: string,
  params: { page: number; limit?: number; type?: HistoryFilter },
) {
  return apiRequest<HistoryPage>(
    withQuery(`/profiles/${userId}/history`, {
      page: params.page,
      limit: params.limit ?? 10,
      type: params.type === 'all' ? undefined : params.type,
    }),
    { token },
  )
}

export function updateMyProfile(token: string, payload: UpdateProfilePayload) {
  return apiRequest<ProfileOverview>('/profiles/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function setFeaturedProjects(token: string, projectIds: string[]) {
  return apiRequest<{ featuredProjectIds: string[] }>('/profiles/me/featured-projects', {
    method: 'PUT',
    token,
    body: JSON.stringify({ projectIds }),
  })
}

export function saveHistoryItem(
  token: string,
  kind: EditableHistoryKind,
  payload: CertificatePayload | CareerPayload | AwardPayload,
  id?: string,
) {
  return apiRequest(`/profiles/me/${HISTORY_PATHS[kind]}${id ? `/${id}` : ''}`, {
    method: id ? 'PATCH' : 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function deleteHistoryItem(token: string, kind: EditableHistoryKind, id: string) {
  return apiRequest<void>(`/profiles/me/${HISTORY_PATHS[kind]}/${id}`, { method: 'DELETE', token })
}
