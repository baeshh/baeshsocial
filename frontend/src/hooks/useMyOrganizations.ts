import { useQuery } from '@tanstack/react-query'
import { getMyMemberships } from '../services/organizationService'
import { useAuthStore } from '../stores/authStore'

export const MY_ORGANIZATIONS_QUERY_KEY = ['organizations', 'me'] as const

export function useMyOrganizations() {
  const token = useAuthStore((state) => state.token)
  const query = useQuery({
    queryKey: [...MY_ORGANIZATIONS_QUERY_KEY, token],
    queryFn: () => getMyMemberships(token!),
    enabled: Boolean(token),
    staleTime: 30_000,
  })

  const memberships = query.data?.memberships ?? []
  return {
    ...query,
    memberships,
    activeMemberships: memberships.filter((membership) => membership.status === 'active'),
    pendingMemberships: memberships.filter((membership) => membership.status === 'pending'),
  }
}
