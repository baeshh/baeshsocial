import type { OpportunityType } from '../types/opportunity'
import type { DeliveryMode, ProgramAudience, ProgramCategory } from '../types/program'
import { DELIVERY_MODE_LABEL, PROGRAM_AUDIENCE_LABEL } from './programs'

/** One search across institution programs and posted opportunities on the Jobs page. */
export type JobsSort = 'recommended' | 'deadline' | 'recent'

/** Which kind of result to list: both, institution programs only, or posted opportunities only. */
export type JobsSource = 'all' | 'programs' | 'postings'

export type JobsSearch = {
  q: string
  category: JobsCategoryId
  openOnly: boolean
  sort: JobsSort
  source: JobsSource
  /** Posted opportunities only. */
  skill: string
  remote: boolean
  saved: boolean
  /** Institution programs only. */
  mode: DeliveryMode | ''
  audience: ProgramAudience | ''
}

type JobsCategory = {
  id: string
  label: string
  /** `null`: no institution program falls in this category. */
  program: ProgramCategory | null
  /** Empty: no posted opportunity falls in this category. */
  opportunity: Lowercase<OpportunityType>[]
}

export const JOBS_CATEGORIES = [
  { id: 'all', label: '전체', program: null, opportunity: [] },
  { id: 'job', label: '채용', program: null, opportunity: ['job'] },
  { id: 'internship', label: '인턴십·현장실습', program: 'internship', opportunity: ['internship'] },
  { id: 'competition', label: '공모전·해커톤', program: 'competition', opportunity: ['competition', 'hackathon'] },
  { id: 'education', label: '교육·연수', program: 'education', opportunity: ['education'] },
  { id: 'startup', label: '창업', program: 'startup', opportunity: ['startup_program'] },
  { id: 'capstone', label: '프로젝트·캡스톤', program: 'capstone', opportunity: [] },
  { id: 'mentoring', label: '멘토링', program: 'mentoring', opportunity: [] },
  { id: 'research', label: '연구', program: 'research', opportunity: [] },
] as const satisfies readonly JobsCategory[]

export type JobsCategoryId = (typeof JOBS_CATEGORIES)[number]['id']

export const JOBS_SORT_LABEL: Record<JobsSort, string> = {
  recommended: '추천순',
  deadline: '마감 임박순',
  recent: '최신순',
}

export const JOBS_SOURCE_LABEL: Record<JobsSource, string> = {
  all: '모든 결과',
  programs: '기관 운영 프로그램',
  postings: '일반 공고',
}

export const SKILL_PRESETS = ['Python', 'React', 'Node.js', 'TypeScript', 'Java', 'Figma'] as const

export const EMPTY_JOBS_SEARCH: JobsSearch = {
  q: '',
  category: 'all',
  openOnly: false,
  sort: 'recommended',
  source: 'all',
  skill: '',
  remote: false,
  saved: false,
  mode: '',
  audience: '',
}

const oneOf = <T extends string>(value: string | null, allowed: Record<T, unknown>): T | null =>
  value !== null && Object.prototype.hasOwnProperty.call(allowed, value) ? (value as T) : null

/** Reads the search from the URL; unknown values fall back to defaults. */
export function jobsSearchFromParams(params: URLSearchParams): JobsSearch {
  const category = params.get('category')
  return {
    q: params.get('q') ?? '',
    category: JOBS_CATEGORIES.some((item) => item.id === category) ? (category as JobsCategoryId) : 'all',
    openOnly: params.get('open') === '1',
    sort: oneOf(params.get('sort'), JOBS_SORT_LABEL) ?? 'recommended',
    source: oneOf(params.get('source'), JOBS_SOURCE_LABEL) ?? 'all',
    skill: (params.get('skill') ?? '').trim().slice(0, 40),
    remote: params.get('remote') === '1',
    saved: params.get('saved') === '1',
    mode: oneOf(params.get('mode'), DELIVERY_MODE_LABEL) ?? '',
    audience: oneOf(params.get('audience'), PROGRAM_AUDIENCE_LABEL) ?? '',
  }
}

/** Writes the search into `params`, leaving unrelated keys (such as `tab`) alone. Defaults are left out. */
export function writeJobsSearchParams(params: URLSearchParams, search: JobsSearch) {
  const next = new URLSearchParams(params)
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key))
  set('q', search.q.trim() || null)
  set('category', search.category === 'all' ? null : search.category)
  set('open', search.openOnly ? '1' : null)
  set('sort', search.sort === 'recommended' ? null : search.sort)
  set('source', search.source === 'all' ? null : search.source)
  set('skill', search.skill.trim() || null)
  set('remote', search.remote ? '1' : null)
  set('saved', search.saved ? '1' : null)
  set('mode', search.mode || null)
  set('audience', search.audience || null)
  return next
}

const categoryOf = (id: JobsCategoryId): JobsCategory => JOBS_CATEGORIES.find((category) => category.id === id) ?? JOBS_CATEGORIES[0]

export const hasPostingOnlyFilters = (search: JobsSearch) => Boolean(search.skill || search.remote || search.saved)
export const hasProgramOnlyFilters = (search: JobsSearch) => Boolean(search.mode || search.audience)

/** The conditions in the detail filter panel, as opposed to search, category, recruitment state and sort. */
export const JOBS_PANEL_DEFAULTS: Partial<JobsSearch> = { source: 'all', skill: '', remote: false, saved: false, mode: '', audience: '' }

export function countPanelFilters(search: JobsSearch) {
  return [search.source !== 'all', search.skill, search.remote, search.saved, search.mode, search.audience].filter(Boolean).length
}

export function isJobsSearchNarrowed(search: JobsSearch) {
  return Boolean(search.q.trim()) || search.category !== 'all' || search.openOnly || countPanelFilters(search) > 0
}

/**
 * Why a kind of result is left out of the list: the chosen result type, a category that has none of it,
 * or a filter that only the other kind supports.
 */
export type JobsExclusion = 'source' | 'category' | 'filters' | null

/** Query for institution programs, or why they are left out. */
export function programQuery(search: JobsSearch) {
  const category = categoryOf(search.category)
  const excluded: JobsExclusion =
    search.source === 'postings'
      ? 'source'
      : search.category !== 'all' && !category.program
        ? 'category'
        : hasPostingOnlyFilters(search)
          ? 'filters'
          : null
  if (excluded) return { query: null, excluded }
  return {
    excluded,
    query: {
      q: search.q.trim() || undefined,
      category: category.program,
      state: search.openOnly ? ('open' as const) : ('all' as const),
      sort: search.sort === 'recent' ? ('recent' as const) : ('deadline' as const),
      audience: search.audience || undefined,
      deliveryMode: search.mode || undefined,
    },
  }
}

/** Query for posted opportunities, or why they are left out. */
export function opportunityQuery(search: JobsSearch) {
  const category = categoryOf(search.category)
  const excluded: JobsExclusion =
    search.source === 'programs'
      ? 'source'
      : search.category !== 'all' && category.opportunity.length === 0
        ? 'category'
        : hasProgramOnlyFilters(search)
          ? 'filters'
          : null
  if (excluded) return { query: null, excluded }
  return {
    excluded,
    query: {
      q: search.q.trim() || undefined,
      types: category.opportunity.join(',') || undefined,
      openOnly: search.openOnly,
      sort: search.sort === 'recommended' ? ('match' as const) : search.sort,
      skill: search.skill || undefined,
      remote: search.remote || undefined,
      saved: search.saved || undefined,
    },
  }
}

/** How each kind of result is actually ordered for the chosen sort; the two sources do not rank the same way. */
export function programSortNote(sort: JobsSort) {
  if (sort === 'recent') return '최근 게시순'
  const order = '모집 중(마감 임박순) → 모집 예정 → 마감'
  return sort === 'recommended' ? `기관 프로그램은 추천 점수가 없어 ${order} 순으로 보여 줍니다` : order
}

export function postingSortNote(sort: JobsSort) {
  if (sort === 'recent') return '최근 등록순'
  if (sort === 'deadline') return '마감일이 빠른 순 · 상시 모집은 뒤'
  return '내 프로필 스킬과 겹치는 비율이 높은 순'
}

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  JOB: '채용',
  INTERNSHIP: '인턴십',
  HACKATHON: '해커톤',
  EDUCATION: '교육',
  COMPETITION: '공모전',
  STARTUP_PROGRAM: '창업 프로그램',
}
