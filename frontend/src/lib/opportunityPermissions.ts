import type { UserRole } from '../types/auth'
import type { Opportunity } from '../types/opportunity'

export function canManageOpportunity(
  role: UserRole | undefined,
  userId: string | undefined,
  opportunity: Opportunity,
) {
  if (!role || !userId) {
    return false
  }
  if (role === 'admin') {
    return true
  }
  if (role === 'institution') {
    return opportunity.createdBy === userId
  }
  return false
}
