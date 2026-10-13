import {
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MailPlus,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserSearch,
  Users,
} from 'lucide-react'
import { hasOrgRole } from '../../lib/organizations'
import type { OrganizationRole, OrganizationType } from '../../types/organization'
import type { ManagementNavGroup, ManagementNavItem } from '../layout/ManagementAppShell'

/** Console sections; ids are the existing `/org/:orgId?tab=` values so old links keep working. */
export type OrgSection =
  | 'overview'
  | 'onboarding'
  | 'programs'
  | 'kpis'
  | 'reports'
  | 'members'
  | 'invites'
  | 'billing'
  | 'audit'
  | 'verification'
  | 'settings'

export const ORG_SECTION_LABEL: Record<OrgSection, string> = {
  overview: '운영 홈',
  onboarding: '도입 가이드',
  programs: '프로그램',
  kpis: '성과 분석',
  reports: '결과보고서',
  members: '구성원',
  invites: '초대',
  billing: '요금제·사용량',
  audit: '감사 로그',
  verification: '조직 인증',
  settings: '조직 설정',
}

type OrgAccess = {
  orgId: string
  orgType: OrganizationType
  role: OrganizationRole
  approved: boolean
}

/** Sections the caller may open. The API enforces the same rules; this only decides what to show. */
export function allowedOrgSections({ role, approved }: Pick<OrgAccess, 'role' | 'approved'>): OrgSection[] {
  const isStaff = hasOrgRole(role, 'manager')
  const isAdmin = hasOrgRole(role, 'admin')
  const canManagePrograms = approved && isStaff
  return [
    'overview',
    ...(canManagePrograms ? (['onboarding'] as const) : []),
    'programs',
    ...(canManagePrograms ? (['kpis', 'reports'] as const) : []),
    'members',
    ...(approved && isStaff ? (['invites'] as const) : []),
    ...(isAdmin ? (['verification', 'settings'] as const) : []),
    ...(approved && isAdmin ? (['audit'] as const) : []),
    ...(isStaff ? (['billing'] as const) : []),
  ]
}

export function orgSectionPath(orgId: string, section: OrgSection) {
  return section === 'overview' ? `/org/${orgId}` : `/org/${orgId}?tab=${section}`
}

export function buildOrgNav(
  access: OrgAccess,
  options: { active: OrgSection | 'talent' | null; counts?: Partial<Record<OrgSection, number | null>> } = { active: null },
): ManagementNavGroup[] {
  const allowed = new Set(allowedOrgSections(access))
  const item = (section: OrgSection, icon: ManagementNavItem['icon']): ManagementNavItem[] =>
    allowed.has(section)
      ? [
          {
            id: section,
            label: ORG_SECTION_LABEL[section],
            to: orgSectionPath(access.orgId, section),
            icon,
            active: options.active === section,
            count: options.counts?.[section] ?? null,
          },
        ]
      : []

  const talent: ManagementNavItem[] =
    access.orgType === 'company' && access.approved
      ? [{ id: 'talent', label: '인재 검색', to: `/talent-db?org=${access.orgId}`, icon: UserSearch, active: options.active === 'talent' }]
      : []

  const groups: ManagementNavGroup[] = [
    { id: 'operate', label: '운영', items: [...item('overview', LayoutDashboard), ...item('onboarding', Rocket)] },
    {
      id: 'programs',
      label: '프로그램 · 성과',
      items: [...item('programs', FolderKanban), ...item('kpis', TrendingUp), ...item('reports', FileText), ...talent],
    },
    { id: 'people', label: '구성원', items: [...item('members', Users), ...item('invites', MailPlus)] },
    {
      id: 'organization',
      label: '조직 관리',
      items: [
        ...item('verification', ShieldCheck),
        ...item('settings', Settings),
        ...item('audit', ScrollText),
        ...item('billing', CreditCard),
      ],
    },
  ]
  return groups.filter((group) => group.items.length > 0)
}
