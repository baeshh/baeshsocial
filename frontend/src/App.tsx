import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ToastViewport } from './components/common/ToastViewport'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { AppRoutes } from './routes/AppRoutes'
import { useBootstrapAuth } from './hooks/useBootstrapAuth'
import { setSessionEndedHandler } from './lib/api'
import { useAuthStore } from './stores/authStore'
import { showToast } from './stores/toastStore'

export default function App() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useBootstrapAuth()

  // Cached responses can hold another account's personal data (e.g. application answers), so any
  // sign-in, sign-out or account switch starts from an empty cache.
  useEffect(
    () =>
      useAuthStore.subscribe((state, previous) => {
        if (state.token !== previous.token) queryClient.clear()
      }),
    [queryClient],
  )

  useEffect(() => {
    setSessionEndedHandler((message) => {
      if (!useAuthStore.getState().token) return
      useAuthStore.getState().clearSession()
      queryClient.clear()
      showToast(message, 'info')
      navigate('/auth/login', { replace: true })
    })
  }, [navigate, queryClient])

  return (
    <>
      <ScrollToTop />
      <AppRoutes />
      <ToastViewport />
    </>
  )
}
