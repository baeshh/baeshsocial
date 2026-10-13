import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { AdminNav } from '../../components/admin/AdminNav'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { formatDateTime } from '../../lib/commercial'
import { adminActivateUser, adminChangeRole, adminGetUsers, adminRevokeUserSessions, adminSuspendUser } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'

const ROLE_LABEL = { user: '일반', company: '기업', institution: '기관', admin: '플랫폼 관리자' } as const

export function AdminUsersPage() {
  const token = useAuthStore((state) => state.token)!
  const me = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [role, setRole] = useState('all')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['admin', 'users', q, status, role, page],
    queryFn: () => adminGetUsers(token, { q: q || undefined, status, role, page }),
    placeholderData: keepPreviousData,
  })
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: () => {
      showToast('반영했습니다. 변경은 해당 사용자의 다음 요청부터 즉시 적용됩니다.')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminNav description="계정 정지·권한 변경은 기존 로그인에도 즉시 적용되며, 정지 시 모든 세션이 종료됩니다." title="사용자 관리" />
        <div className="flex flex-wrap gap-2">
          <input
            className="h-10 w-64 rounded-full border border-surface-border bg-white px-4 text-sm"
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="이메일·이름 검색"
            value={q}
          />
          <select aria-label="상태" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setStatus(e.target.value)} value={status}>
            <option value="all">모든 상태</option>
            <option value="active">정상</option>
            <option value="suspended">정지</option>
          </select>
          <select aria-label="권한" className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setRole(e.target.value)} value={role}>
            <option value="all">모든 권한</option>
            {Object.entries(ROLE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Card className="p-0">
          {query.isLoading ? (
            <LoadingState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">사용자</th>
                    <th>권한</th>
                    <th>상태</th>
                    <th>조직</th>
                    <th>활성 세션</th>
                    <th>최근 로그인</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {(data?.users ?? []).map((user) => {
                    const isMe = user.id === me?.id
                    return (
                      <tr key={user.id}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-ink-strong">{user.name}</p>
                          <p className="text-xs text-ink-muted">{user.email}</p>
                        </td>
                        <td>
                          <select
                            aria-label={`${user.name} 권한`}
                            className="h-8 rounded-full border border-surface-border bg-white px-2 text-xs"
                            disabled={isMe || run.isPending}
                            onChange={(e) => {
                              const next = e.target.value
                              if (window.confirm(`${user.email}의 권한을 ${ROLE_LABEL[next as keyof typeof ROLE_LABEL]}(으)로 바꿀까요?`)) {
                                run.mutate(() => adminChangeRole(token, user.id, next))
                              }
                            }}
                            value={user.role}
                          >
                            {Object.entries(ROLE_LABEL).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {user.status === 'suspended' ? (
                            <span title={user.suspendReason ?? ''}>
                              <Badge tone="red">정지</Badge>
                            </span>
                          ) : (
                            <Badge tone="green">정상</Badge>
                          )}
                        </td>
                        <td>{user.organizations}</td>
                        <td>{user.activeSessions}</td>
                        <td className="text-xs text-ink-muted">{formatDateTime(user.lastLoginAt)}</td>
                        <td className="whitespace-nowrap pr-4 text-right">
                          {!isMe && user.activeSessions > 0 ? (
                            <Button className="min-h-8 px-3" disabled={run.isPending} onClick={() => run.mutate(() => adminRevokeUserSessions(token, user.id))} variant="ghost">
                              로그아웃
                            </Button>
                          ) : null}
                          {isMe ? null : user.status === 'suspended' ? (
                            <Button className="min-h-8 px-3" disabled={run.isPending} onClick={() => run.mutate(() => adminActivateUser(token, user.id))} variant="secondary">
                              정지 해제
                            </Button>
                          ) : (
                            <Button
                              className="min-h-8 px-3"
                              disabled={run.isPending}
                              onClick={() => {
                                const reason = window.prompt(`${user.email} 계정을 정지합니다. 사유를 입력하세요.`)
                                if (reason && reason.trim().length >= 2) run.mutate(() => adminSuspendUser(token, user.id, reason.trim()))
                              }}
                              variant="danger"
                            >
                              정지
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button className="min-h-9 px-4" disabled={page <= 1} onClick={() => setPage(page - 1)} variant="secondary">
            이전
          </Button>
          <span>
            {page} / {pages} · 총 {data?.total ?? 0}명
          </span>
          <Button className="min-h-9 px-4" disabled={page >= pages} onClick={() => setPage(page + 1)} variant="secondary">
            다음
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}
