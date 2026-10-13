import type { OpportunityType } from '../types/opportunity'
import type { ProgramCategory } from '../types/program'

/** One search across institution programs and posted opportunities on the Jobs page. */
export type JobsSort = 'recommended' | 'deadline' | 'recent'

export type JobsSearch = {
  q: string
  category: JobsCategoryId
  openOnly: boolean
  sort: JobsSort
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

export const EMPTY_JOBS_SEARCH: JobsSearch = { q: '', category: 'all', openOnly: false, sort: 'recommended' }

const categoryOf = (id: JobsCategoryId): JobsCategory => JOBS_CATEGORIES.find((category) => category.id === id) ?? JOBS_CATEGORIES[0]

/** Query for institution programs, or `null` when the chosen category has none. */
export function programQuery(search: JobsSearch) {
  const category = categoryOf(search.category)
  if (search.category !== 'all' && !category.program) return null
  return {
    q: search.q.trim() || undefined,
    category: category.program,
    state: search.openOnly ? ('open' as const) : ('all' as const),
    sort: search.sort === 'recent' ? ('recent' as const) : ('deadline' as const),
  }
}

/** Query for posted opportunities, or `null` when the chosen category has none. */
export function opportunityQuery(search: JobsSearch) {
  const category = categoryOf(search.category)
  if (search.category !== 'all' && category.opportunity.length === 0) return null
  return {
    q: search.q.trim() || undefined,
    types: category.opportunity.join(',') || undefined,
    openOnly: search.openOnly,
    sort: search.sort === 'recommended' ? ('match' as const) : search.sort,
  }
}

/** Filters that only posted opportunities have; search, category and sort are shared. */
export type OpportunityFilters = {
  skill: string
  remote: boolean
  saved: boolean
}

export const EMPTY_OPPORTUNITY_FILTERS: OpportunityFilters = { skill: '', remote: false, saved: false }

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  JOB: '채용',
  INTERNSHIP: '인턴십',
  HACKATHON: '해커톤',
  EDUCATION: '교육',
  COMPETITION: '공모전',
  STARTUP_PROGRAM: '창업 프로그램',
}
