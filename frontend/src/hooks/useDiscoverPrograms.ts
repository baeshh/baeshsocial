import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { discoverPrograms } from '../services/programService'

export const DISCOVER_PAGE_SIZE = 6

export function useDiscoverPrograms(token: string | null, page: number) {
  return useQuery({
    queryKey: ['programs', 'discover', page],
    queryFn: () => discoverPrograms(token!, { page, pageSize: DISCOVER_PAGE_SIZE }),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })
}
