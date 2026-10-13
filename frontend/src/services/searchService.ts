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

export function getRecommendedPeople(token: string, limit = 12) {
  return apiRequest<{ results: SearchResult[] }>(withQuery('/search/recommended', { limit }), { token })
}
