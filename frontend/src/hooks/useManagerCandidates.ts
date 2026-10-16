import { useQuery } from '@tanstack/react-query'
import { hasOrgRole } from '../lib/organizations'
import { getOrganizationMembers } from '../services/organizationService'
import { useAuthStore } from '../stores/authStore'

/** Active organization members eligible to manage a program (MANAGER role or above). */
export function useManagerCandidates(orgId: string, enabled: boolean) {
  const token = useAuthStore((state) => state.token)
  const query = useQuery({
    queryKey: ['organizations', orgId, 'members'],
    queryFn: () => getOrganizationMembers(token!, orgId),
    enabled: Boolean(token && enabled),
  })
  return (query.data?.members ?? [])
    .filter((member) => hasOrgRole(member.role, 'manager') && member.user)
    .map((member) => member.user!)
}
