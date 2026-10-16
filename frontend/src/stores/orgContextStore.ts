import { create } from 'zustand'

const ACTIVE_ORG_KEY = 'baesh.activeOrganizationId'

/**
 * UI-only preference for which workspace (personal or an organization) is shown.
 * Every organization API call is still authorized server-side against the caller's membership.
 */
type OrgContextState = {
  activeOrgId: string | null
  setActiveOrg: (orgId: string | null) => void
}

export const useOrgContextStore = create<OrgContextState>((set) => ({
  activeOrgId: localStorage.getItem(ACTIVE_ORG_KEY),
  setActiveOrg: (orgId) => {
    if (orgId) {
      localStorage.setItem(ACTIVE_ORG_KEY, orgId)
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY)
    }
    set({ activeOrgId: orgId })
  },
}))
