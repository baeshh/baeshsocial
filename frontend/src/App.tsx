import { ToastViewport } from './components/common/ToastViewport'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { AppRoutes } from './routes/AppRoutes'
import { useBootstrapAuth } from './hooks/useBootstrapAuth'

export default function App() {
  useBootstrapAuth()

  return (
    <>
      <ScrollToTop />
      <AppRoutes />
      <ToastViewport />
    </>
  )
}
