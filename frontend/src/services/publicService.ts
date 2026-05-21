import { apiRequest } from '../lib/api'

export type PublicStats = {
  userCount: number
  betaOpenedAt: string
}

export function getPublicStats() {
  return apiRequest<PublicStats>('/public/stats')
}
