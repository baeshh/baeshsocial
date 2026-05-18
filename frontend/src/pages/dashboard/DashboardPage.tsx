import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../../components/layout/AppLayout'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs } from '../../components/common/Tabs'
import { logout } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'

export function DashboardPage() {
  const { token, user, clearSession } = useAuthStore()
  const [activeTab, setActiveTab] = useState('overview')
  const logoutMutation = useMutation({
    mutationFn: () => logout(token),
    onSettled: clearSession,
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">
              {user ? `${user.name}님의 활동` : '내 활동'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              계정, 역할, 최근 진행 상황을 확인하고 주요 메뉴로 바로 이동합니다.
            </p>
          </div>
          <Button
            className="rounded-full"
            disabled={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
            variant="secondary"
          >
            로그아웃
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-surface-border shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Role</p>
            <p className="mt-2 text-xl font-bold text-ink-strong">{user?.role ?? '—'}</p>
          </Card>
          <Card className="rounded-2xl border-surface-border shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Email</p>
            <p className="mt-2 break-all text-xl font-bold text-ink-strong">{user?.email ?? '—'}</p>
          </Card>
          <Card className="rounded-2xl border-surface-border shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Auth</p>
            <p className="mt-2 text-xl font-bold text-ink-strong">JWT Bearer</p>
          </Card>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button className="h-auto justify-center rounded-2xl py-4" to="/profile" variant="secondary">
            프로필
          </Button>
          <Button className="h-auto justify-center rounded-2xl py-4" to="/network" variant="secondary">
            네트워크
          </Button>
          <Button className="h-auto justify-center rounded-2xl py-4" to="/projects" variant="secondary">
            프로젝트
          </Button>
          <Button className="h-auto justify-center rounded-2xl py-4" to="/opportunities" variant="secondary">
            Jobs
          </Button>
        </div>

        <Card className="rounded-2xl border-surface-border shadow-sm">
          <CardHeader>
            <CardTitle>요약</CardTitle>
            <CardDescription>Workspace 뷰와 컴포넌트 상태를 빠르게 점검합니다.</CardDescription>
          </CardHeader>
          <Tabs
            activeTab={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                id: 'overview',
                label: 'Overview',
                content: (
                  <p className="rounded-xl bg-surface-muted p-5 text-sm leading-relaxed text-ink-body">
                    Profile, Projects, Network, Jobs, AI Copilot은 상단 네비게이션에서 바로 전환할 수 있습니다.
                    모바일에서는 하단 탭을 사용하세요.
                  </p>
                ),
              },
              {
                id: 'loading',
                label: 'Loading',
                content: <LoadingState />,
              },
            ]}
          />
        </Card>

        <p className="text-center text-xs text-ink-muted">
          <Link className="font-semibold text-brand-600 hover:underline" to="/ai-copilot">
            AI Copilot
          </Link>
          으로 이동해 인사이트를 생성할 수 있습니다.
        </p>
      </div>
    </AppLayout>
  )
}
