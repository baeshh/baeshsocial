import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { discoverPrograms } from '../services/programService'
import type { ProgramCategory } from '../types/program'

export const DISCOVER_PAGE_SIZE = 6

/** Works signed out too: anonymous visitors see public programs only. */
export function useDiscoverPrograms(
  token: string | null,
  page: number,
  filters: { category?: ProgramCategory | null; openOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: ['programs', 'discover', token ? 'member' : 'anonymous', page, filters.category ?? null, Boolean(filters.openOnly)],
    queryFn: () => discoverPrograms(token, { page, pageSize: DISCOVER_PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
  })
}
