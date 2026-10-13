import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { revokeEvidence } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Evidence } from '../../types/program'
import { Button } from '../common/Button'

/** Staff-only: withdraws an approval. The verified record is revoked and the evidence returns to 반려. */
export function EvidenceRevokeAction({ evidence }: { evidence: Evidence }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const revoke = useMutation({
    mutationFn: () => revokeEvidence(token!, evidence.id, reason.trim()),
    onSuccess: () => {
      showToast('승인을 취소했습니다. 작성자 프로필의 검증 표시가 해제됩니다.', 'info')
      setOpen(false)
      setReason('')
      void queryClient.invalidateQueries({ queryKey: ['evidence'] })
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="ghost">
        승인 취소
      </Button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
      <textarea
        aria-label="승인 취소 사유"
        autoFocus
        className="min-h-11 flex-1 resize-y rounded-2xl border border-red-200 px-4 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
        maxLength={1000}
        onChange={(event) => setReason(event.target.value)}
        placeholder="승인 취소 사유 (5자 이상, 작성자에게 전달됩니다)"
        rows={1}
        value={reason}
      />
      <div className="flex gap-2">
        <Button
          disabled={revoke.isPending}
          onClick={() => {
            if (reason.trim().length < 5) {
              showToast('승인 취소 사유를 5자 이상 입력해 주세요.', 'error')
              return
            }
            revoke.mutate()
          }}
          variant="danger"
        >
          취소 확정
        </Button>
        <Button disabled={revoke.isPending} onClick={() => setOpen(false)} variant="ghost">
          닫기
        </Button>
      </div>
    </div>
  )
}
