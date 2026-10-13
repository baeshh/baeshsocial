import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { AdminNav, StatCard } from '../../components/admin/AdminNav'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { formatDateTime } from '../../lib/commercial'
import { formatBytes } from '../../lib/programs'
import { opsAlertDrill, opsErrors, opsMetrics, opsOverview, opsResolveError, opsRuns, opsUsage } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { OpsMetrics, OpsRun } from '../../types/commercial'

const RUN_LABEL: Record<OpsRun['kind'], string> = {
  db_backup: 'DB 백업',
  restore_drill: '복원 훈련',
  file_backup_check: '파일 백업 점검',
  deploy: '배포',
  rollback: '롤백',
  incident_drill: '장애 알림 훈련',
}

const pct = (value: number) => `${(value * 100).toFixed(value < 0.01 && value > 0 ? 2 : 1)}%`
const usd = (value: number) => `$${value.toFixed(2)}`
const uptime = (sec: number) => (sec >= 86_400 ? `${Math.floor(sec / 86_400)}일 ${Math.floor((sec % 86_400) / 3600)}시간` : `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분`)

function TrafficChart({ metrics, hours, asOf }: { metrics: OpsMetrics; hours: number; asOf: number }) {
  if (metrics.series.length === 0) return <p className="text-sm text-ink-muted">기록된 요청이 없습니다.</p>
  const bucketMs = metrics.unit === 'minute' ? 60_000 : 3_600_000
  const count = Math.round((hours * 3_600_000) / bucketMs)
  const byBucket = new Map(metrics.series.map((point) => [Math.floor(new Date(point.t).getTime() / bucketMs), point]))
  const last = Math.floor(asOf / bucketMs)
  const slots = Array.from({ length: count }, (_, index) => {
    const bucket = last - count + 1 + index
    return byBucket.get(bucket) ?? { t: new Date(bucket * bucketMs).toISOString(), requests: 0, errors: 0, clientErrors: 0, avgMs: 0, p95Ms: 0 }
  })
  const max = Math.max(1, ...slots.map((point) => point.requests))
  return (
    <div className="flex h-40 items-end gap-px">
      {slots.map((point) => (
        <div
          className="flex h-full flex-1 flex-col justify-end"
          key={point.t}
          title={`${new Date(point.t).toLocaleString('ko-KR')} · 요청 ${point.requests} · 5xx ${point.errors} · 4xx ${point.clientErrors} · 평균 ${point.avgMs}ms · p95 ${point.p95Ms}ms`}
        >
          <div className="w-full bg-red-400" style={{ height: `${(point.errors / max) * 100}%` }} />
          <div className="w-full bg-brand-500" style={{ height: `${((point.requests - point.errors) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

function RunStatus({ run, label, fresh }: { run: OpsRun | null; label: string; fresh?: boolean }) {
  const ok = run && (fresh ?? true)
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-surface-border p-4">
      {ok ? <CheckCircle2 className="shrink-0 text-emerald-600" size={20} /> : <XCircle className="shrink-0 text-red-600" size={20} />}
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink-strong">{label}</p>
        <p className="text-xs text-ink-muted">
          {run ? `${formatDateTime(run.startedAt)} · ${run.environment}${run.sizeBytes ? ` · ${formatBytes(run.sizeBytes)}` : ''}` : '기록 없음'}
          {run && fresh === false ? ' · 기한 초과' : ''}
        </p>
        {run?.message ? <p className="mt-0.5 truncate text-xs text-ink-body">{run.message}</p> : null}
      </div>
    </div>
  )
}

export function AdminOpsPage() {
  const token = useAuthStore((state) => state.token)!
  const queryClient = useQueryClient()
  const [hours, setHours] = useState(24)
  const [runKind, setRunKind] = useState('all')
  const overview = useQuery({ queryKey: ['admin', 'ops', 'overview'], queryFn: () => opsOverview(token), refetchInterval: 30_000 })
  const metrics = useQuery({ queryKey: ['admin', 'ops', 'metrics', hours], queryFn: () => opsMetrics(token, hours), refetchInterval: 60_000 })
  const errors = useQuery({ queryKey: ['admin', 'ops', 'errors'], queryFn: () => opsErrors(token, 'open') })
  const runs = useQuery({ queryKey: ['admin', 'ops', 'runs', runKind], queryFn: () => opsRuns(token, runKind) })
  const usage = useQuery({ queryKey: ['admin', 'ops', 'usage'], queryFn: () => opsUsage(token) })

  const resolve = useMutation({
    mutationFn: (id: string) => opsResolveError(token, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'ops'] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const drill = useMutation({
    mutationFn: () => opsAlertDrill(token),
    onSuccess: (data) => {
      showToast(data.delivered ? '테스트 알림을 보냈습니다. 알림 채널에서 수신을 확인하세요.' : data.run.message ?? '알림을 보내지 못했습니다.', data.delivered ? 'success' : 'info')
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ops', 'runs'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const data = overview.data

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminNav description="서버·DB·오류율·업로드·AI 비용·백업 상태를 한 화면에서 확인합니다. 30초마다 갱신됩니다." title="운영 관제" />

        {overview.isLoading ? <LoadingState /> : null}
        {data ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="blue">
                {data.app.environment} · v{data.app.version.slice(0, 10)}
              </Badge>
              <Badge>
                {data.host.hostname} · 가동 {uptime(data.app.uptimeSec)}
              </Badge>
              <Badge tone={data.app.sentry ? 'green' : 'gray'}>Sentry {data.app.sentry ? '연결됨' : '미설정'}</Badge>
              <Badge tone={data.app.alertsConfigured ? 'green' : 'red'}>알림 웹훅 {data.app.alertsConfigured ? '설정됨' : '미설정'}</Badge>
              <Badge tone={data.app.jobsEnabled ? 'green' : 'gray'}>스케줄러 {data.app.jobsEnabled ? '동작' : '꺼짐'}</Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              <StatCard hint={`24시간 ${data.traffic.last24h.requests.toLocaleString('ko-KR')}`} label="요청 (1시간)" value={data.traffic.lastHour.requests.toLocaleString('ko-KR')} />
              <StatCard
                hint={`24시간 ${pct(data.traffic.last24h.errorRate)}`}
                label="5xx 오류율 (1시간)"
                tone={data.traffic.lastHour.errorRate >= 0.05 ? 'red' : undefined}
                value={pct(data.traffic.lastHour.errorRate)}
              />
              <StatCard hint={`평균 ${data.traffic.lastHour.avgMs}ms`} label="응답 p95 (1시간)" value={`${data.traffic.lastHour.p95Ms}ms`} />
              <StatCard
                hint={`24시간 ${data.uploads.requests}건`}
                label="업로드 실패율"
                tone={data.uploads.failureRate >= 0.1 ? 'red' : undefined}
                value={pct(data.uploads.failureRate)}
              />
              <StatCard hint={`이번 달 ${usd(data.ai.costMonthUsd)}${data.ai.monthlyBudgetUsd ? ` / ${usd(data.ai.monthlyBudgetUsd)}` : ''}`} label="AI 비용 (24시간)" value={usd(data.ai.costTodayUsd)} />
              <StatCard hint={`미해결 오류 ${data.errors.open}건`} label="활성 사용자 (24시간)" value={String(data.users.active24h)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>서버</CardTitle>
                </CardHeader>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">CPU 부하 (1/5/15분)</dt>
                    <dd className="font-semibold text-ink-strong">
                      {data.host.loadAvg.map((value) => value.toFixed(2)).join(' / ')} · {data.host.cpus}코어
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">메모리 (호스트)</dt>
                    <dd className="font-semibold text-ink-strong">
                      {formatBytes(data.host.totalMem - data.host.freeMem)} / {formatBytes(data.host.totalMem)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">API 프로세스 RSS</dt>
                    <dd className="font-semibold text-ink-strong">{formatBytes(data.app.memory.rss)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Node</dt>
                    <dd className="text-ink-strong">{data.app.node}</dd>
                  </div>
                </dl>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>데이터베이스</CardTitle>
                </CardHeader>
                {data.db.ok ? (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">응답</dt>
                      <dd className="font-semibold text-ink-strong">{data.db.latencyMs}ms</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">크기</dt>
                      <dd className="font-semibold text-ink-strong">{formatBytes(data.db.sizeBytes ?? 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">연결</dt>
                      <dd className="font-semibold text-ink-strong">
                        {Object.values(data.db.connections ?? {}).reduce((sum, value) => sum + value, 0)} / {data.db.maxConnections}
                        <span className="ml-1 text-xs font-normal text-ink-muted">(활성 {data.db.connections?.active ?? 0})</span>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-red-700">DB 연결 실패: {data.db.error}</p>
                )}
              </Card>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>백업·복구</CardTitle>
                    <Button className="min-h-8 gap-1 px-3" disabled={drill.isPending} onClick={() => drill.mutate()} variant="secondary">
                      <BellRing size={14} /> 알림 훈련
                    </Button>
                  </div>
                </CardHeader>
                <div className="space-y-2">
                  <RunStatus fresh={data.backups.backupFresh} label="최근 DB 백업 (26시간 이내)" run={data.backups.lastBackup} />
                  <RunStatus fresh={data.backups.restoreDrillFresh} label="최근 복원 검증 (35일 이내)" run={data.backups.lastRestoreDrill} />
                  <RunStatus label="파일(S3) 보호 점검" run={data.backups.lastFileBackupCheck} />
                </div>
              </Card>
            </div>
          </>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>트래픽 · 오류</CardTitle>
              <select aria-label="기간" className="h-9 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setHours(Number(e.target.value))} value={hours}>
                <option value={6}>최근 6시간 (분 단위)</option>
                <option value={24}>최근 24시간</option>
                <option value={168}>최근 7일</option>
              </select>
            </div>
            <CardDescription>파란색 정상 응답 · 빨간색 5xx</CardDescription>
          </CardHeader>
          {metrics.data ? <TrafficChart asOf={metrics.dataUpdatedAt} hours={hours} metrics={metrics.data} /> : <LoadingState />}
          {metrics.data && metrics.data.routes.length > 0 ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-ink-muted">
                  <tr>
                    <th className="py-2">경로</th>
                    <th>요청</th>
                    <th>5xx</th>
                    <th>4xx</th>
                    <th>평균</th>
                    <th>p95</th>
                    <th>최대</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {metrics.data.routes.slice(0, 15).map((route) => (
                    <tr key={`${route.method} ${route.route}`}>
                      <td className="py-2 font-mono text-xs text-ink-strong">
                        {route.method} {route.route}
                      </td>
                      <td>{route.requests.toLocaleString('ko-KR')}</td>
                      <td className={route.errors ? 'font-semibold text-red-700' : ''}>{route.errors}</td>
                      <td>{route.clientErrors}</td>
                      <td>{route.avgMs}ms</td>
                      <td>{route.p95Ms}ms</td>
                      <td>{route.maxMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>미해결 오류 {errors.data?.errors.length ?? 0}</CardTitle>
              <CardDescription>같은 원인의 오류는 하나로 묶입니다. 비밀값은 저장 전에 제거됩니다.</CardDescription>
            </CardHeader>
            {errors.data?.errors.length === 0 ? (
              <p className="text-sm text-ink-muted">미해결 오류가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-surface-border text-sm">
                {(errors.data?.errors ?? []).map((error) => (
                  <li className="flex items-start gap-3 py-3" key={error.id}>
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-semibold text-ink-strong">{error.message}</p>
                      <p className="text-xs text-ink-muted">
                        {error.method} {error.route ?? '—'} · {error.count}회 · 최근 {formatDateTime(error.lastSeenAt)}
                        {error.lastRequestId ? ` · req ${error.lastRequestId.slice(0, 8)}` : ''}
                      </p>
                    </div>
                    <Button className="min-h-8 px-3" disabled={resolve.isPending} onClick={() => resolve.mutate(error.id)} variant="ghost">
                      해결
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>운영 작업 기록</CardTitle>
                <select aria-label="작업 종류" className="h-9 rounded-full border border-surface-border bg-white px-3 text-sm" onChange={(e) => setRunKind(e.target.value)} value={runKind}>
                  <option value="all">전체</option>
                  {Object.entries(RUN_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <CardDescription>백업·복원 훈련·배포·롤백 스크립트가 직접 보고합니다.</CardDescription>
            </CardHeader>
            <ul className="max-h-96 divide-y divide-surface-border overflow-y-auto text-sm">
              {(runs.data?.runs ?? []).map((run) => (
                <li className="flex items-start gap-3 py-2.5" key={run.id}>
                  <Badge tone={run.status === 'success' ? 'green' : run.status === 'failure' ? 'red' : 'gray'}>{RUN_LABEL[run.kind]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink-strong">{run.message ?? run.status}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDateTime(run.startedAt)} · {run.environment}
                      {run.durationSec !== null ? ` · ${run.durationSec}s` : ''}
                    </p>
                  </div>
                </li>
              ))}
              {runs.data?.runs.length === 0 ? <li className="py-3 text-ink-muted">기록이 없습니다.</li> : null}
            </ul>
          </Card>
        </div>

        {usage.data ? (
          <Card>
            <CardHeader>
              <CardTitle>사용 현황</CardTitle>
              <CardDescription>
                DAU {usage.data.activeUsers.dau} · WAU {usage.data.activeUsers.wau} · MAU {usage.data.activeUsers.mau} · 최근 30일 가입{' '}
                {usage.data.signups.reduce((sum, row) => sum + row.count, 0)}명
              </CardDescription>
            </CardHeader>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2">기관 (최근 7일)</th>
                  <th>증빙 제출</th>
                  <th>AI 호출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {usage.data.organizations.slice(0, 10).map((org) => (
                  <tr key={org.id}>
                    <td className="py-2 font-semibold text-ink-strong">{org.name}</td>
                    <td>{org.evidence7d}</td>
                    <td>{org.aiCalls7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : null}
      </div>
    </AppLayout>
  )
}
