import {
  Activity,
  BriefcaseBusiness,
  LayoutGrid,
  Network,
  Search,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

/** 일반 사용자 상단/모바일 메뉴 (목업 순서) */
export const generalNavItems: NavItem[] = [
  { label: 'Profile', to: '/profile', icon: UserRound },
  { label: 'Network', to: '/network', icon: Network },
  { label: 'Projects', to: '/projects', icon: LayoutGrid },
  { label: 'Find', to: '/find', icon: Search },
  { label: 'Jobs', to: '/opportunities', icon: BriefcaseBusiness },
  { label: '내 활동', to: '/dashboard', icon: Activity },
]

/** 하단 탭 네비 */
export const bottomNavItems: NavItem[] = [
  { label: 'Network', to: '/network', icon: Network },
  { label: 'Project', to: '/projects', icon: LayoutGrid },
  { label: 'Find', to: '/find', icon: Search },
  { label: 'Jobs', to: '/opportunities', icon: BriefcaseBusiness },
  { label: 'Profile', to: '/profile', icon: UserRound },
]

