import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'
import { cn } from '../../lib/cn'
import { getOnboarding } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'

export function OrgOnboardingPanel({ orgId, onOpenTab }: { orgId: string; onOpenTab: (tab: string) => void }) {
  const token = useAuthStore((state) => state.token)
  const query = useQuery({ queryKey: ['organizations', orgId, 'onboarding'], queryFn: () => getOnboarding(token!, orgId), enabled: Boolean(token) })

  if (query.isLoading) return <LoadingState />
  if (query.isError || !query.data) return <p className="text-sm text-red-700">{(query.error as Error | null)?.message ?? '불러오지 못했습니다.'}</p>

  const { steps, completed, total, nextStep } = query.data
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          도입 체크리스트 · {completed}/{total}
        </CardTitle>
        <CardDescription>기관 인증부터 첫 결과보고서까지, 실제 운영을 시작하는 데 필요한 단계입니다. 완료 여부는 실제 데이터로 판단합니다.</CardDescription>
      </CardHeader>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(completed / total) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3',
              step.key === nextStep ? 'border-brand-200 bg-brand-50' : 'border-surface-border',
            )}
            key={step.key}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                step.done ? 'bg-emerald-500 text-white' : 'bg-surface-muted text-ink-muted',
              )}
            >
              {step.done ? <Check size={15} /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('font-semibold', step.done ? 'text-ink-body' : 'text-ink-strong')}>
                {step.title}
                {typeof step.count === 'number' && step.count > 0 ? <span className="ml-1.5 text-xs font-medium text-ink-muted">{step.count}</span> : null}
                {step.pending ? <span className="ml-1.5 text-xs font-medium text-amber-700">대기 {step.pending}</span> : null}
              </p>
              <p className="text-xs text-ink-muted">{step.description}</p>
            </div>
            {!step.done ? (
              <Button className="min-h-9 px-4" onClick={() => onOpenTab(step.tab)} variant={step.key === nextStep ? 'primary' : 'secondary'}>
                이동
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  )
}
