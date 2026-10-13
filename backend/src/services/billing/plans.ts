import { BillingPeriod, OrganizationType, PlanAudience, type Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'

/** Organization limit keys. Missing or null = unlimited. */
export const ORG_LIMIT_KEYS = [
  'members',
  'activePrograms',
  'projects',
  'storageGb',
  'reportsPerPeriod',
  'talentSearchesPerMonth',
  'aiCallsPerDay',
] as const
export type OrgLimitKey = (typeof ORG_LIMIT_KEYS)[number]

/** Personal limit keys. */
export const PERSONAL_LIMIT_KEYS = ['aiCallsPerDay', 'portfoliosPerMonth', 'portfolioPdf'] as const
export type PersonalLimitKey = (typeof PERSONAL_LIMIT_KEYS)[number]

export type PlanLimits = Partial<Record<OrgLimitKey | PersonalLimitKey, number | boolean | null>>

export const LIMIT_LABELS: Record<OrgLimitKey | PersonalLimitKey, string> = {
  members: '활성 구성원(학생·담당자)',
  activePrograms: '운영 중 프로그램',
  projects: '프로그램 프로젝트',
  storageGb: '증빙·보고서 저장공간(GB)',
  reportsPerPeriod: '계약 기간 내 결과보고서 생성',
  talentSearchesPerMonth: '최근 30일 인재 검색',
  aiCallsPerDay: '최근 24시간 AI 호출',
  portfoliosPerMonth: '최근 30일 AI 포트폴리오 생성',
  portfolioPdf: '포트폴리오 PDF 내보내기',
}

export const PLAN_KEYS = {
  personalFree: 'personal_free',
  personalPro: 'personal_pro',
  orgTrial: 'org_trial',
  university: 'university',
  institution: 'institution',
  enterprise: 'enterprise',
} as const

type PlanSeed = Omit<Prisma.PlanCreateInput, 'limits'> & { limits: PlanLimits }

/**
 * Initial catalog from the business plan. Prices are working assumptions, not final list prices:
 * operators edit them (and VAT handling) in the billing console without a deploy.
 */
export const DEFAULT_PLANS: PlanSeed[] = [
  {
    key: PLAN_KEYS.personalFree,
    name: '개인 Free',
    description: '프로필 생성, 프로젝트 참여, 기본 커리어 기록',
    audience: PlanAudience.PERSONAL,
    orgTypes: [],
    priceKrw: 0,
    billingPeriod: BillingPeriod.MONTH,
    vatIncluded: true,
    limits: { aiCallsPerDay: 10, portfoliosPerMonth: 3, portfolioPdf: false },
    features: ['프로필·프로젝트·활동 기록', '기관 검증 기록', 'AI 포트폴리오 월 3회(웹 보기)'],
    sortOrder: 10,
  },
  {
    key: PLAN_KEYS.personalPro,
    name: '개인 Pro',
    description: 'AI 포트폴리오, 고급 분석, 추가 생성·내보내기',
    audience: PlanAudience.PERSONAL,
    orgTypes: [],
    priceKrw: 8900,
    priceMaxKrw: 29000,
    billingPeriod: BillingPeriod.MONTH,
    vatIncluded: true,
    limits: { aiCallsPerDay: 100, portfoliosPerMonth: 50, portfolioPdf: true },
    features: ['AI 포트폴리오 월 50회', '포트폴리오 PDF 내보내기', 'AI 분석 하루 100회'],
    sortOrder: 20,
  },
  {
    key: PLAN_KEYS.orgTrial,
    name: '기관 체험',
    description: '조직 인증 직후 계약 전까지 제공되는 체험 범위',
    audience: PlanAudience.ORGANIZATION,
    orgTypes: [OrganizationType.UNIVERSITY, OrganizationType.INSTITUTION, OrganizationType.COMPANY],
    priceKrw: 0,
    billingPeriod: BillingPeriod.CUSTOM,
    vatIncluded: false,
    limits: {
      members: 120,
      activePrograms: 2,
      projects: 20,
      storageGb: 5,
      reportsPerPeriod: 5,
      talentSearchesPerMonth: 30,
      aiCallsPerDay: 100,
    },
    features: ['학생·프로젝트 관리', '증빙 승인', '기관 대시보드', '결과보고서 5회'],
    isPublic: false,
    sortOrder: 30,
  },
  {
    key: PLAN_KEYS.university,
    name: 'University',
    description: '학생·프로젝트 관리, 증빙 승인, 기관 대시보드, 결과보고서',
    audience: PlanAudience.ORGANIZATION,
    orgTypes: [OrganizationType.UNIVERSITY],
    priceKrw: 5_000_000,
    billingPeriod: BillingPeriod.SEMESTER,
    vatIncluded: false,
    limits: { members: 600, activePrograms: 5, projects: 120, storageGb: 50, reportsPerPeriod: 30, aiCallsPerDay: 300 },
    features: ['학생 600명', '운영 프로그램 5개', '프로젝트 120개', '저장공간 50GB', '결과보고서 학기당 30회'],
    sortOrder: 40,
  },
  {
    key: PLAN_KEYS.institution,
    name: 'Institution',
    description: '여러 프로그램 운영, 성과관리, 맞춤형 보고서, 기관 지원',
    audience: PlanAudience.ORGANIZATION,
    orgTypes: [OrganizationType.INSTITUTION, OrganizationType.UNIVERSITY],
    priceKrw: 10_000_000,
    billingPeriod: BillingPeriod.YEAR,
    vatIncluded: false,
    limits: { members: 2000, activePrograms: 30, projects: 500, storageGb: 200, reportsPerPeriod: 200, aiCallsPerDay: 1000 },
    features: ['구성원 2,000명', '운영 프로그램 30개', '프로젝트 500개', '저장공간 200GB', '결과보고서 연 200회'],
    sortOrder: 50,
  },
  {
    key: PLAN_KEYS.enterprise,
    name: 'Enterprise',
    description: '검증된 인재 검색, AI 매칭, 채용 담당자 계정, API 연동',
    audience: PlanAudience.ORGANIZATION,
    orgTypes: [OrganizationType.COMPANY],
    priceKrw: null,
    billingPeriod: BillingPeriod.YEAR,
    vatIncluded: false,
    limits: { members: 20, talentSearchesPerMonth: 1000, aiCallsPerDay: 500 },
    features: ['채용 담당자 20명', '인재 검색 월 1,000회', 'AI 추천 설명', 'API 연동(별도 협의)'],
    sortOrder: 60,
  },
]

let ensured: Promise<void> | null = null

/** Creates missing catalog plans. Existing rows are never overwritten, so console edits stick. */
export function ensureDefaultPlans() {
  ensured ??= (async () => {
    for (const plan of DEFAULT_PLANS) {
      await prisma.plan.upsert({
        where: { key: plan.key },
        create: { ...plan, limits: plan.limits as Prisma.InputJsonValue },
        update: {},
      })
    }
  })().catch((error) => {
    ensured = null
    throw error
  })
  return ensured
}

export function planLimits(plan: { limits: Prisma.JsonValue }, overrides?: Prisma.JsonValue | null): PlanLimits {
  const base = (plan.limits && typeof plan.limits === 'object' ? plan.limits : {}) as PlanLimits
  const extra = (overrides && typeof overrides === 'object' ? overrides : {}) as PlanLimits
  return { ...base, ...extra }
}
