import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { discoverPrograms, type DiscoverProgramsParams } from '../services/programService'
import { useViewerKey } from './useViewerKey'

export const DISCOVER_PAGE_SIZE = 6

/** Works signed out too: anonymous visitors see public programs only. Pass `null` to skip the request. */
export function useDiscoverPrograms(token: string | null, page: number, filters: Omit<DiscoverProgramsParams, 'page' | 'pageSize'> | null = {}) {
  const { viewerKey, ready } = useViewerKey()
  return useQuery({
    queryKey: ['programs', 'discover', viewerKey, page, filters],
    queryFn: () => discoverPrograms(token, { page, pageSize: DISCOVER_PAGE_SIZE, ...filters }),
    placeholderData: keepPreviousData,
    enabled: ready && filters !== null,
  })
}
