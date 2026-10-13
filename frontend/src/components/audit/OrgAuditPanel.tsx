import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { AuditLogTable } from './AuditLogTable'
import { getOrgAuditLogs } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'

const ACTION_FILTERS = [
  { value: '', label: '전체' },
  { value: 'evidence.', label: '증빙 승인·다운로드' },
  { value: 'report.', label: '보고서' },
  { value: 'program.', label: '프로그램' },
  { value: 'org.', label: '구성원·초대' },
  { value: 'billing.', label: '계약' },
]

export function OrgAuditPanel({ orgId }: { orgId: string }) {
  const token = useAuthStore((state) => state.token)
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('all')
  const query = useInfiniteQuery({
    queryKey: ['organizations', orgId, 'audit', action, outcome],
    queryFn: ({ pageParam }) => getOrgAuditLogs(token!, orgId, { action: action || undefined, outcome, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(token),
  })
  const logs = query.data?.pages.flatMap((page) => page.logs) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>감사 로그</CardTitle>
        <CardDescription>증빙 승인·반려, 파일 다운로드, 보고서 생성, 구성원·권한 변경, 접근 거부 기록입니다. 3년간 보관됩니다.</CardDescription>
      </CardHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="작업 분류" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(event) => setAction(event.target.value)} value={action}>
          {ACTION_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <select aria-label="결과" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(event) => setOutcome(event.target.value)} value={outcome}>
          <option value="all">모든 결과</option>
          <option value="success">성공</option>
          <option value="denied">거부</option>
          <option value="failure">실패</option>
        </select>
      </div>
      {query.isLoading ? <LoadingState /> : query.isError ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : <AuditLogTable logs={logs} />}
      {query.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} variant="secondary">
            더 보기
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
