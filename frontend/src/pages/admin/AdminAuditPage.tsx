import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { AdminNav, StatCard } from '../../components/admin/AdminNav'
import { AuditLogTable } from '../../components/audit/AuditLogTable'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { adminGetAuditLogs } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { ErrorState } from '../../components/common/ErrorState'

const ACTION_PREFIXES = [
  { value: '', label: '전체 작업' },
  { value: 'auth.', label: '로그인·세션' },
  { value: 'admin.', label: '관리자 조치' },
  { value: 'org.', label: '조직·초대·권한' },
  { value: 'evidence.', label: '증빙' },
  { value: 'report.', label: '보고서' },
  { value: 'billing.', label: '과금·계약' },
  { value: 'ops.', label: '운영' },
  { value: 'talent.', label: '인재 검색' },
]

export function AdminAuditPage() {
  const token = useAuthStore((state) => state.token)!
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('all')
  const [actor, setActor] = useState('')
  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit', action, outcome, actor],
    queryFn: ({ pageParam }) => adminGetAuditLogs(token, { action: action || undefined, outcome, actor: actor || undefined, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
  const logs = query.data?.pages.flatMap((page) => page.logs) ?? []
  const denied24h = query.data?.pages[0]?.stats?.denied24h

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminNav description="승인·삭제·다운로드·권한 변경·접근 거부를 포함한 전체 감사 기록입니다. 3년간 보관됩니다." title="감사 로그" />
        {denied24h !== undefined ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard hint="다른 조직 자료 접근 시도 등" label="최근 24시간 거부" tone={denied24h > 20 ? 'red' : undefined} value={`${denied24h}건`} />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <select aria-label="작업" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setAction(e.target.value)} value={action}>
            {ACTION_PREFIXES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select aria-label="결과" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setOutcome(e.target.value)} value={outcome}>
            <option value="all">모든 결과</option>
            <option value="success">성공</option>
            <option value="denied">거부</option>
            <option value="failure">실패</option>
          </select>
          <input aria-label="수행자 이메일" className="h-10 w-64 rounded-full border border-surface-border bg-white px-4 text-sm" onChange={(e) => setActor(e.target.value)} placeholder="수행자 이메일" value={actor} />
        </div>
        <Card>
          {query.isLoading ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <AuditLogTable logs={logs} showNetwork showOrg />}
          {query.hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} variant="secondary">
                더 보기
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </AppLayout>
  )
}
