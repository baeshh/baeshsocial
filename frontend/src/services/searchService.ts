import { apiRequest } from '../lib/api'

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

export function searchPeople(token: string, query: string, limit = 20) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return apiRequest<{ query: string; results: SearchResult[] }>(`/search?${params}`, { token })
}

export function getRecommendedPeople(token: string, limit = 12) {
  const params = new URLSearchParams({ limit: String(limit) })
  return apiRequest<{ results: SearchResult[] }>(`/search/recommended?${params}`, { token })
}
