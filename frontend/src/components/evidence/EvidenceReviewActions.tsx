import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { reviewEvidence } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Evidence } from '../../types/program'
import { Button } from '../common/Button'

export function EvidenceReviewActions({ evidence }: { evidence: Evidence }) {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')

  const review = useMutation({
    mutationFn: (decision: 'approve' | 'reject') => reviewEvidence(token!, evidence.id, decision, note.trim() || undefined),
    onSuccess: (_data, decision) => {
      showToast(decision === 'approve' ? '승인했습니다. 작성자 프로필에 검증 기록이 추가됩니다.' : '반려했습니다.', decision === 'approve' ? 'success' : 'info')
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['evidence'] })
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
      <textarea
        aria-label="검토 의견"
        className="min-h-11 flex-1 resize-y rounded-2xl border border-surface-border px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        maxLength={2000}
        onChange={(event) => setNote(event.target.value)}
        placeholder="검토 의견 (반려 시 필수)"
        rows={1}
        value={note}
      />
      <div className="flex gap-2">
        <Button disabled={review.isPending} onClick={() => review.mutate('approve')}>
          승인
        </Button>
        <Button
          disabled={review.isPending}
          onClick={() => {
            if (note.trim().length < 2) {
              showToast('반려 사유를 입력해 주세요.', 'error')
              return
            }
            review.mutate('reject')
          }}
          variant="danger"
        >
          반려
        </Button>
      </div>
    </div>
  )
}
