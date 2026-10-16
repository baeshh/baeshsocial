import type { QueryKey } from '@tanstack/react-query'

/**
 * Like `keepPreviousData`, but only while the previous query belongs to the same `scope` (a query key prefix
 * such as `['organizations', orgId]`). Moving to another organization, program or person shows a loading
 * state instead of the previous one's data under the new header.
 */
export function keepPreviousDataWithin(scope: QueryKey) {
  return <T>(previousData: T | undefined, previousQuery?: { queryKey: QueryKey }): T | undefined => {
    const previousKey = previousQuery?.queryKey
    if (!previousKey) return undefined
    return scope.every((part, index) => Object.is(previousKey[index], part)) ? previousData : undefined
  }
}
