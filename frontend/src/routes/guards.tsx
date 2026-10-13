import { useEffect, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { LoadingState } from '../components/common/LoadingState'
import { useMyOrganizations } from '../hooks/useMyOrganizations'
import { useAuthStore } from '../stores/authStore'
import { useOrgContextStore } from '../stores/orgContextStore'

/**
 * Client-side gate for `/org/:orgId/*`. It only improves UX — the API independently rejects
 * requests from users without an ACTIVE membership in that organization.
 */
export function RequireOrgMembership({ children }: { children: ReactNode }) {
  const { orgId } = useParams()
  const token = useAuthStore((state) => state.token)
  const setActiveOrg = useOrgContextStore((state) => state.setActiveOrg)
  const { activeMemberships, isLoading, isError } = useMyOrganizations()
  const membership = activeMemberships.find((item) => item.organization.id === orgId)

  useEffect(() => {
    if (membership) {
      setActiveOrg(membership.organization.id)
    }
  }, [membership, setActiveOrg])

  if (!token) {
    return <Navigate replace to="/auth/login" />
  }

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingState label="조직 권한을 확인하는 중입니다" />
      </AppLayout>
    )
  }

  if (isError || !membership) {
    return <Navigate replace state={{ denied: true }} to="/organizations" />
  }

  return <>{children}</>
}

export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { token, user } = useAuthStore()

  if (!token) {
    return <Navigate replace to="/auth/login" />
  }

  if (!user) {
    return (
      <AppLayout>
        <LoadingState label="권한을 확인하는 중입니다" />
      </AppLayout>
    )
  }

  if (user.role !== 'admin') {
    return <Navigate replace to="/dashboard" />
  }

  return <>{children}</>
}
