import { useAuthStore } from '../stores/authStore'

/**
 * Identifies whose data a personalised query holds. Put it in the query key so one account's cached
 * responses are never served to another, and wait on `ready` while the signed-in user is loading.
 */
export function useViewerKey() {
  const token = useAuthStore((state) => state.token)
  const userId = useAuthStore((state) => state.user?.id ?? null)
  return { viewerKey: token ? userId : 'anonymous', ready: !token || Boolean(userId) }
}
