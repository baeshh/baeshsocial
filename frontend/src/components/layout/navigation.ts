import { BriefcaseBusiness, House, LayoutGrid, Network, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

/** Personal workspace: top menu from 768px, bottom tabs below. Find is reached through global search. */
export const personalNavItems: NavItem[] = [
  { label: '홈', to: '/dashboard', icon: House },
  { label: '기회', to: '/opportunities', icon: BriefcaseBusiness },
  { label: '프로젝트', to: '/projects', icon: LayoutGrid },
  { label: '네트워크', to: '/network', icon: Network },
  { label: '프로필', to: '/profile', icon: UserRound },
]

export const PERSONAL_HOME = '/dashboard'
