import { ToastViewport } from './components/common/ToastViewport'
import { AppRoutes } from './routes/AppRoutes'
import { useBootstrapAuth } from './hooks/useBootstrapAuth'

export default function App() {
  useBootstrapAuth()

  return (
    <>
      <AppRoutes />
      <ToastViewport />
    </>
  )
}
