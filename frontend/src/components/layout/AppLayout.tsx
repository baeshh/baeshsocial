import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { BottomNav } from './BottomNav'
import { Navbar } from './Navbar'

type AppLayoutProps = {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { token, user } = useAuthStore()

  if (!token) {
    return <Navigate replace to="/auth/login" />
  }

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-body">
      <Navbar user={user} />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 md:pb-10 md:px-8">{children}</main>
      <BottomNav />
    </div>
  )
}
