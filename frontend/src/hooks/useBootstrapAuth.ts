import { useEffect } from 'react'
import { fetchMe } from '../services/authService'
import { useAuthStore } from '../stores/authStore'

export function useBootstrapAuth() {
  const { token, setSession, clearSession } = useAuthStore()

  useEffect(() => {
    if (!token) {
      return
    }

    let isMounted = true

    fetchMe(token)
      .then(({ user }) => {
        if (isMounted) {
          setSession(token, user)
        }
      })
      .catch(() => {
        if (isMounted) {
          clearSession()
        }
      })

    return () => {
      isMounted = false
    }
  }, [clearSession, setSession, token])
}
