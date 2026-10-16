import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { EnrollmentManagePanel } from '../../components/institution/EnrollmentManagePanel'
import { OpportunityCreateForm } from '../../components/jobs/OpportunityCreateForm'
import { AppLayout } from '../../components/layout/AppLayout'
import { canPostOpportunities } from '../../lib/opportunityPermissions'
import { useAuthStore } from '../../stores/authStore'

/**
 * Posting opportunities and handling their sign-ups, kept off the job seeker's Jobs page. The account role
 * comes from the server session; every request is checked again by the API.
 */
export function OpportunityManagePage() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const allowed = canPostOpportunities(user?.role)

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-5">
        <Link className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-600" to="/opportunities">
          <ArrowLeft aria-hidden size={16} />
          기회 탐색으로
        </Link>
        <header>
          <h1 className="text-xl font-bold text-ink-strong sm:text-2xl">일반 공고 관리</h1>
          <p className="mt-1 text-sm text-ink-muted">
            기관·관리자 계정이 올린 공고와 참여 신청을 관리합니다. 모집·심사·선발까지 BAESH 안에서 운영하려면 조직 워크스페이스에서 프로그램을 만들어 주세요.
          </p>
        </header>
        {!user ? null : allowed && token ? (
          <>
            <OpportunityCreateForm token={token} />
            <EnrollmentManagePanel token={token} />
          </>
        ) : (
          <Card className="rounded-2xl text-center">
            <h2 className="text-base font-bold text-ink-strong">공고를 관리할 권한이 없습니다</h2>
            <p className="mt-1 text-sm text-ink-muted">기관 또는 관리자 계정만 일반 공고를 등록하고 참여 신청을 처리할 수 있습니다.</p>
            <Button className="mt-4" size="sm" to="/opportunities" variant="secondary">
              기회 탐색으로 이동
            </Button>
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
