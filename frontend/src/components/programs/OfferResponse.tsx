import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNow } from '../../hooks/useNow'
import { formatDateTime, offerTimeLeft } from '../../lib/programs'
import { confirmProgramOffer, declineProgramOffer } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import { Button } from '../common/Button'

type OfferApplication = { status: string; offerExpiresAt: string | null; lapsed: boolean; respondedAt: string | null }

/** What the applicant sees after a decision: confirm/decline an offer, or where it stands. */
export function OfferResponse({ programId, programTitle, application }: { programId: string; programTitle: string; application: OfferApplication }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const now = useNow()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['programs'] })
  const confirm = useMutation({
    mutationFn: () => confirmProgramOffer(token!, programId),
    onSuccess: () => {
      showToast(`${programTitle} 참여를 확정했습니다.`, 'success')
      refresh()
    },
    onError: (error: Error) => {
      showToast(error.message, 'error')
      refresh()
    },
  })
  const decline = useMutation({
    mutationFn: () => declineProgramOffer(token!, programId),
    onSuccess: () => {
      showToast('참여를 포기했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (application.status === 'waitlisted') {
    return <p className="mt-2 text-sm text-ink-body">대기자로 등록되었습니다. 자리가 나면 순서대로 합격이 제안되고 알림으로 알려 드립니다.</p>
  }
  if (application.status === 'declined') {
    return (
      <p className="mt-2 text-sm text-ink-muted">
        {application.lapsed ? '응답 기한까지 참여를 확정하지 않아 합격이 취소되었습니다.' : '참여를 포기했습니다.'}
      </p>
    )
  }
  if (application.status !== 'accepted') return null

  const timeLeft = offerTimeLeft(application.offerExpiresAt, now)
  if (timeLeft.expired) return <p className="mt-2 text-sm text-ink-muted">응답 기한이 지나 확정할 수 없습니다. 운영 기관에 문의해 주세요.</p>
  const busy = confirm.isPending || decline.isPending

  return (
    <div className="mt-2 space-y-2">
      <p className="text-sm text-ink-body">
        합격했습니다. {application.offerExpiresAt ? `${formatDateTime(application.offerExpiresAt)}까지 ` : ''}참여를 확정해야 참여자로 등록됩니다.
        {application.offerExpiresAt ? ' 기한이 지나면 자리가 대기자에게 넘어갑니다.' : null}
      </p>
      {application.offerExpiresAt ? (
        <p className={timeLeft.urgent ? 'text-xs font-semibold text-warning-700' : 'text-xs font-semibold text-ink-muted'}>
          {timeLeft.label}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button className="min-h-9 flex-1 px-4" disabled={busy} onClick={() => confirm.mutate()}>
          참여 확정
        </Button>
        <Button
          className="min-h-9 px-4"
          disabled={busy}
          onClick={() => {
            if (window.confirm('참여를 포기하면 다시 되돌릴 수 없고, 자리는 대기자에게 넘어갑니다. 포기할까요?')) decline.mutate()
          }}
          variant="secondary"
        >
          포기
        </Button>
      </div>
    </div>
  )
}
