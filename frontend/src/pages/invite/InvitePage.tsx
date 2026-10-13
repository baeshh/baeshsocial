import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { MY_ORGANIZATIONS_QUERY_KEY } from '../../hooks/useMyOrganizations'
import { formatDate } from '../../lib/programs'
import { acceptInvite, previewInvite } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { useOrgContextStore } from '../../stores/orgContextStore'
import { showToast } from '../../stores/toastStore'

const ROLE_LABEL: Record<string, string> = { admin: '관리자', manager: '담당자', member: '참여자' }

export function InvitePage() {
  const { token: inviteToken = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token, user } = useAuthStore()
  const setActiveOrg = useOrgContextStore((state) => state.setActiveOrg)
  const query = useQuery({ queryKey: ['invite', inviteToken], queryFn: () => previewInvite(inviteToken), retry: false })

  const accept = useMutation({
    mutationFn: () => acceptInvite(token!, inviteToken),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: MY_ORGANIZATIONS_QUERY_KEY })
      setActiveOrg(result.organizationId)
      showToast(`${result.organizationName}에 합류했습니다.`)
      navigate(result.programId ? `/org/${result.organizationId}/programs/${result.programId}` : `/org/${result.organizationId}`)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const invite = query.data?.invite
  const pending = invite?.status === 'pending'
  const next = encodeURIComponent(inviteToken)

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <Link className="text-sm font-semibold text-brand-600" to="/">
          BAESH
        </Link>
        {query.isLoading ? (
          <LoadingState label="초대 정보를 확인하는 중입니다" />
        ) : query.isError || !invite ? (
          <>
            <h1 className="mt-6 text-2xl font-bold text-ink-strong">초대를 열 수 없습니다</h1>
            <p className="mt-3 text-ink-body">{(query.error as Error | null)?.message ?? '초대 링크가 올바르지 않습니다.'}</p>
          </>
        ) : (
          <>
            <span className="mt-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Building2 size={24} />
            </span>
            <h1 className="mt-4 text-2xl font-bold text-ink-strong">{invite.organization.name}</h1>
            <p className="mt-2 text-ink-body">
              {invite.invitedBy ? `${invite.invitedBy}님이 ` : ''}
              {invite.program ? `「${invite.program.title}」 프로그램에 ` : ''}
              {ROLE_LABEL[invite.role] ?? invite.role}(으)로 초대했습니다.
            </p>
            <dl className="mt-5 space-y-1.5 rounded-2xl bg-surface-muted p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">초대받은 이메일</dt>
                <dd className="font-semibold text-ink-strong">{invite.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">유효 기간</dt>
                <dd className="text-ink-strong">{formatDate(invite.expiresAt)}까지</dd>
              </div>
            </dl>

            {!pending ? (
              <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {invite.status === 'expired' ? '만료된 초대입니다. 담당자에게 재발송을 요청해 주세요.' : '이미 사용되었거나 취소된 초대입니다.'}
              </p>
            ) : token ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-ink-muted">{user ? `${user.email} 계정으로 수락합니다. 초대받은 이메일과 같아야 합니다.` : ''}</p>
                <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
                  {accept.isPending ? '처리 중…' : '초대 수락'}
                </Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-2">
                <Button to={`/auth/register?invite=${next}`}>가입하고 수락</Button>
                <Button to={`/auth/login?invite=${next}`} variant="secondary">
                  이미 계정이 있어요 · 로그인
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </main>
  )
}
