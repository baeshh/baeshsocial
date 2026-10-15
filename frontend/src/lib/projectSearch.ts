import type { ProjectStatus } from '../types/project'

export type ProjectListSearch = {
  q: string
  status: ProjectStatus | null
  kind: 'personal' | 'program' | null
  sort: 'updated' | 'created'
}

const STATUS_PARAM: Record<string, ProjectStatus> = {
  active: 'ACTIVE',
  planning: 'PLANNING',
  completed: 'COMPLETED',
  archived: 'ARCHIVED',
}

export const PROJECT_KIND_LABEL = { personal: '개인 프로젝트', program: '기관 프로그램 연계' } as const
export const PROJECT_SORT_LABEL = { updated: '최근 수정순', created: '최근 생성순' } as const

export function projectSearchFromParams(params: URLSearchParams): ProjectListSearch {
  const kind = params.get('kind')
  return {
    q: params.get('q')?.trim() ?? '',
    status: STATUS_PARAM[params.get('status') ?? ''] ?? null,
    kind: kind === 'personal' || kind === 'program' ? kind : null,
    sort: params.get('sort') === 'created' ? 'created' : 'updated',
  }
}

/** Writes onto the current params so unrelated ones survive; defaults are left out of the URL. */
export function writeProjectSearchParams(base: URLSearchParams, search: ProjectListSearch) {
  const next = new URLSearchParams(base)
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key))
  set('q', search.q.trim() || null)
  set('status', search.status?.toLowerCase() ?? null)
  set('kind', search.kind)
  set('sort', search.sort === 'updated' ? null : search.sort)
  return next
}

export const projectListQuery = (search: ProjectListSearch) => ({
  q: search.q || undefined,
  status: search.status?.toLowerCase(),
  kind: search.kind ?? undefined,
  sort: search.sort,
})
