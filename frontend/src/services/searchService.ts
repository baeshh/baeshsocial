import { apiRequest, withQuery } from '../lib/api'

export type SearchResult = {
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

export function searchPeople(token: string, query: string, params: { limit?: number; cursor?: string | null } = {}) {
  return apiRequest<{ query: string; results: SearchResult[]; nextCursor: string | null }>(
    withQuery('/search', { q: query, limit: params.limit ?? 20, cursor: params.cursor }),
    { token },
  )
}

export type RecommendedPeoplePage = {
  results: SearchResult[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function getRecommendedPeople(token: string, params: { page?: number; pageSize?: number } = {}) {
  return apiRequest<RecommendedPeoplePage>(
    withQuery('/search/recommended', { page: params.page ?? 1, pageSize: params.pageSize ?? 6 }),
    { token },
  )
}
