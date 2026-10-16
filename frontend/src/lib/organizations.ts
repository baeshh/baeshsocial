import { Building2, GraduationCap, Landmark, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  OrganizationDocumentType,
  OrganizationRole,
  OrganizationType,
  OrganizationVerificationStatus,
} from '../types/organization'

export const ORG_TYPE_META: Record<
  OrganizationType,
  { label: string; icon: LucideIcon; audience: string; registrationLabel: string }
> = {
  university: {
    label: '대학교',
    icon: GraduationCap,
    audience: '교수 · 학과 · 학교 담당자',
    registrationLabel: '학교/학과 고유번호',
  },
  institution: {
    label: '기관',
    icon: Landmark,
    audience: '교육기관 · 정부 · 협회',
    registrationLabel: '기관 고유번호 / 사업자등록번호',
  },
  company: {
    label: '기업',
    icon: Building2,
    audience: '채용 · 프로젝트 운영 기업',
    registrationLabel: '사업자등록번호',
  },
  community: {
    label: '커뮤니티',
    icon: Users,
    audience: '커뮤니티',
    registrationLabel: '등록번호',
  },
}

export const REGISTRABLE_ORG_TYPES = ['university', 'institution', 'company'] as const

export const ORG_ROLE_LABEL: Record<OrganizationRole, string> = {
  owner: '소유자',
  admin: '관리자',
  manager: '담당자',
  member: '구성원',
}

const ROLE_RANK: Record<OrganizationRole, number> = { owner: 4, admin: 3, manager: 2, member: 1 }

export function hasOrgRole(role: OrganizationRole, minRole: OrganizationRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

export function canManageMember(actorRole: OrganizationRole, targetRole: OrganizationRole) {
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole]
}

export const VERIFICATION_STATUS_META: Record<
  OrganizationVerificationStatus,
  { label: string; tone: 'gray' | 'green' | 'red' }
> = {
  pending: { label: '인증 심사 대기', tone: 'gray' },
  approved: { label: '인증 완료', tone: 'green' },
  rejected: { label: '인증 반려', tone: 'red' },
}

export const DOCUMENT_TYPE_LABEL: Record<OrganizationDocumentType, string> = {
  business_registration: '사업자등록증',
  employment_certificate: '재직증명서',
  official_letter: '기관 공문 / 위임장',
  other: '기타 증빙',
}
