import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../common/Button'
import { ACCESS_STATE_META } from '../../lib/commercial'
import { getOrgBilling } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'

/** Shown to org staff when the contract ended or a limit is nearly used up. */
export function OrgBillingBanner({ orgId, onOpenBilling }: { orgId: string; onOpenBilling: () => void }) {
  const token = useAuthStore((state) => state.token)
  const { data } = useQuery({ queryKey: ['organizations', orgId, 'billing'], queryFn: () => getOrgBilling(token!, orgId), enabled: Boolean(token) })
  if (!data) return null

  const blocked = !data.canCreate
  const critical = data.warnings.filter((warning) => warning.level === 'critical')
  if (!blocked && critical.length === 0 && data.state !== 'past_due') return null

  const message = blocked
    ? ACCESS_STATE_META[data.state].description
    : data.state === 'past_due'
      ? ACCESS_STATE_META.past_due.description
      : critical.map((warning) => warning.message).join(' ')

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-3 text-sm text-red-800">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
        <p>
          <span className="font-semibold">{blocked ? `요금제 ${ACCESS_STATE_META[data.state].label}` : '사용량 한도 임박'}</span> · {message}
        </p>
      </div>
      <Button className="min-h-9 px-4" onClick={onOpenBilling} variant="secondary">
        요금제·사용량 보기
      </Button>
    </div>
  )
}
