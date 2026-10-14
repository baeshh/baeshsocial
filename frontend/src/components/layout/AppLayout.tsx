import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { AnnouncementBanner } from './AnnouncementBanner'
import { BottomNav } from './BottomNav'
import { Navbar } from './Navbar'

type AppLayoutProps = {
  children: ReactNode
}

/** Personal workspace shell (top menu ≥768px, bottom tabs below). Management pages use ManagementAppShell. */
export function AppLayout({ children }: AppLayoutProps) {
  const { token, user } = useAuthStore()

  if (!token) {
    return <Navigate replace to="/auth/login" />
  }

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-body">
      <Navbar user={user} />
      <main className="mx-auto max-w-[1400px] px-4 pb-[calc(var(--bottom-nav-height)+1.5rem)] pt-5 sm:px-6 md:px-8 md:pb-12 md:pt-6">
        <AnnouncementBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
