import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getOrganizationKpis, getProgramKpis, updateKpiTargets, type PeriodParams } from '../../services/insightService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { KpiResult, KpiTargetKey, KpiTargets } from '../../types/insights'
import type { Program } from '../../types/program'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { LoadingState } from '../common/LoadingState'
import { KpiDashboard, PeriodFilter } from './KpiDashboard'

const TARGET_FIELDS: Array<{ key: KpiTargetKey; unit: string; max: number }> = [
  { key: 'participationRate', unit: '%', max: 100 },
  { key: 'submissionRate', unit: '%', max: 100 },
  { key: 'approvalRate', unit: '%', max: 100 },
  { key: 'averageProgress', unit: '%', max: 100 },
  { key: 'projectCompletionRate', unit: '%', max: 100 },
  { key: 'approvedEvidenceCount', unit: '건', max: 100000 },
]

function TargetsEditor({ program, result }: { program: Program; result: KpiResult }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const current = result.programs.find((p) => p.id === program.id)?.targets ?? {}
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(TARGET_FIELDS.map(({ key }) => [key, current[key] === undefined || current[key] === null ? '' : String(current[key])])),
  )

  const save = useMutation({
    mutationFn: () => {
      const targets: KpiTargets = {}
      for (const { key } of TARGET_FIELDS) {
        const raw = draft[key]?.trim()
        targets[key] = raw ? Number(raw) : null
      }
      return updateKpiTargets(token!, program.id, targets)
    },
    onSuccess: () => {
      showToast('KPI 목표를 저장했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['kpis'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const readOnly = program.status === 'archived'
  return (
    <Card>
      <CardHeader>
        <CardTitle>프로그램 KPI 목표</CardTitle>
        <CardDescription>목표를 설정한 지표만 달성 여부와 목표 달성률(달성한 목표 수 ÷ 설정한 목표 수)에 반영됩니다. 비워 두면 목표 없음입니다.</CardDescription>
      </CardHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TARGET_FIELDS.map(({ key, unit, max }) => (
          <label className="text-sm font-semibold text-ink-strong" key={key}>
            {result.definitions[key].label}
            <span className="mt-1.5 flex items-center gap-2">
              <input
                className="h-10 w-full rounded-xl border border-surface-border px-3 text-sm"
                disabled={readOnly}
                inputMode="numeric"
                max={max}
                min={0}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value.replace(/[^\d]/g, '') }))}
                placeholder="목표 없음"
                value={draft[key]}
              />
              <span className="text-xs text-ink-muted">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      {readOnly ? null : (
        <Button className="mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
          목표 저장
        </Button>
      )}
    </Card>
  )
}

export function ProgramKpiPanel({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const [period, setPeriod] = useState<PeriodParams>({})
  const query = useQuery({
    queryKey: ['kpis', 'program', program.id, period],
    queryFn: () => getProgramKpis(token!, program.id, period),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-5">
      <PeriodFilter onChange={setPeriod} result={query.data} />
      {query.isLoading ? <LoadingState label="성과 지표를 집계하는 중입니다" /> : null}
      {query.isError ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}
      {query.data ? (
        <KpiDashboard aside={<TargetsEditor key={query.data.generatedAt.slice(0, 16)} program={program} result={query.data} />} result={query.data} />
      ) : null}
    </div>
  )
}

export function OrgKpiPanel({ orgId }: { orgId: string }) {
  const token = useAuthStore((s) => s.token)
  const [period, setPeriod] = useState<PeriodParams>({})
  const query = useQuery({
    queryKey: ['kpis', 'org', orgId, period],
    queryFn: () => getOrganizationKpis(token!, orgId, period),
    enabled: Boolean(token),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-5">
      <PeriodFilter onChange={setPeriod} result={query.data} />
      {query.isLoading ? <LoadingState label="성과 지표를 집계하는 중입니다" /> : null}
      {query.isError ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}
      {query.data && query.data.programs.length === 0 ? (
        <EmptyState description="관리 권한이 있는 프로그램이 생기면 성과 지표가 집계됩니다." title="집계할 프로그램이 없습니다" />
      ) : null}
      {query.data && query.data.programs.length > 0 ? (
        <>
          <p className="text-sm text-ink-muted">
            {query.data.isOrgAdmin ? '조직의 모든 프로그램' : '담당 프로그램'} {query.data.programs.length}개를 합산했습니다.
          </p>
          <KpiDashboard result={query.data} />
        </>
      ) : null}
    </div>
  )
}
