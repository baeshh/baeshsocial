import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import { saveOpportunity, unsaveOpportunity } from '../../services/opportunityService'
import { showToast } from '../../stores/toastStore'
import type { Opportunity } from '../../types/opportunity'

/** Toggles the viewer's own bookmark on a posted opportunity. */
export function SaveOpportunityButton({
  opportunity,
  token,
  compact = false,
}: {
  opportunity: Pick<Opportunity, 'id' | 'title' | 'saved'>
  token: string
  /** Icon only, for cards. */
  compact?: boolean
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => (opportunity.saved ? unsaveOpportunity(token, opportunity.id) : saveOpportunity(token, opportunity.id)),
    onSuccess: () => {
      showToast(opportunity.saved ? '저장을 취소했습니다.' : '공고를 저장했습니다. ‘저장한 공고만’ 필터로 다시 볼 수 있습니다.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const icon = <Bookmark aria-hidden className={opportunity.saved ? 'fill-current' : ''} size={compact ? 18 : 16} />
  if (compact) {
    return (
      <button
        aria-label={`${opportunity.title} 저장`}
        aria-pressed={opportunity.saved}
        className={`-mr-1.5 -mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-muted disabled:opacity-50 ${
          opportunity.saved ? 'text-brand-600' : 'text-ink-muted'
        }`}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        title={opportunity.saved ? '저장 취소' : '저장하기'}
        type="button"
      >
        {icon}
      </button>
    )
  }
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-50 ${
        opportunity.saved ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-surface-border bg-white text-ink-strong hover:border-brand-200'
      }`}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      type="button"
    >
      {icon}
      {opportunity.saved ? '저장됨' : '저장하기'}
    </button>
  )
}
