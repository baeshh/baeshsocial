import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Badge } from '../../components/common/Badge'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { AdminTabs } from '../../components/admin/AdminNav'
import { getAiUsage } from '../../services/insightService'
import { useAuthStore } from '../../stores/authStore'
import type { AiUsageReport } from '../../types/insights'

const FEATURE_LABEL: Record<string, string> = {
  portfolio: 'AI 포트폴리오',
  insight_profile: '역량 분석',
  insight_project: '프로젝트 분석',
  insight_opportunity: '기회 매칭',
  report_narrative: '보고서 서술',
  talent_explanation: '인재 추천 설명',
}
const STATUS_LABEL: Record<string, string> = {
  success: '성공',
  invalid_output: '형식 오류',
  provider_error: '제공자 오류',
  timeout: '시간 초과',
  rate_limited: '사용 한도',
  budget_exceeded: '예산 초과',
}

const usd = (value: number) => `$${value.toFixed(value >= 1 ? 2 : 4)}`
const num = (value: number) => value.toLocaleString('ko-KR')

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="rounded-2xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink-strong">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </Card>
  )
}

function DailyChart({ daily }: { daily: AiUsageReport['daily'] }) {
  if (!daily.length) return <p className="text-sm text-ink-muted">기간 내 호출이 없습니다.</p>
  const max = Math.max(1, ...daily.map((d) => d.calls))
  return (
    <div className="flex h-40 items-end gap-1">
      {daily.map((d) => (
        <div className="flex h-full max-w-12 flex-1 flex-col justify-end" key={d.day} title={`${d.day} · 호출 ${d.calls} · 오류 ${d.errors} · ${usd(d.costUsd)}`}>
          <div className="w-full rounded-t bg-red-400" style={{ height: `${(d.errors / max) * 100}%` }} />
          <div className="w-full bg-brand-500" style={{ height: `${((d.calls - d.errors) / max) * 100}%` }} />
          <span className="mt-1 truncate text-center text-[9px] text-ink-muted">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export function AdminAIUsagePage() {
  const token = useAuthStore((s) => s.token)
  const [days, setDays] = useState(30)
  const query = useQuery({ queryKey: ['admin', 'ai-usage', days], queryFn: () => getAiUsage(token!, days), enabled: Boolean(token) })
  const data = query.data

  return (
    <AppLayout>
      <div className="space-y-6">
        <AdminTabs />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">AI 운영 관리</h1>
            <p className="mt-2 text-sm text-ink-body">AI 호출 비용·품질·사용량·오류를 확인합니다. 오류 메시지에서 API 키 등 비밀값은 저장 전에 제거됩니다.</p>
          </div>
          <select
            aria-label="기간"
            className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm font-semibold"
            onChange={(e) => setDays(Number(e.target.value))}
            value={days}
          >
            {[7, 30, 90].map((d) => (
              <option key={d} value={d}>
                최근 {d}일
              </option>
            ))}
          </select>
        </div>

        {query.isLoading ? <LoadingState /> : null}
        {query.isError ? <p className="text-sm text-red-700">{(query.error as Error).message}</p> : null}

        {data ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone={data.config.provider === 'mock' ? 'gray' : 'blue'}>
                {data.config.provider === 'mock' ? '규칙 엔진(API 키 없음)' : `${data.config.provider} · ${data.config.model}`}
              </Badge>
              <Badge>사용자당 24시간 {data.config.dailyLimitPerUser}회</Badge>
              <Badge>
                이번 달 비용 {usd(data.config.monthToDateCostUsd)}
                {data.config.monthlyBudgetUsd ? ` / 예산 ${usd(data.config.monthlyBudgetUsd)}` : ' · 예산 미설정'}
              </Badge>
              <Badge>
                시간 제한 {data.config.timeoutMs / 1000}초 · 재시도 {data.config.maxRetries}회
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Stat hint={`성공 ${num(data.totals.success)}`} label="호출" value={num(data.totals.calls)} />
              <Stat label="성공률" value={data.totals.successRate === null ? '–' : `${data.totals.successRate}%`} />
              <Stat hint={`입력 ${num(data.totals.inputTokens)} · 출력 ${num(data.totals.outputTokens)} 토큰`} label="비용" value={usd(data.totals.costUsd)} />
              <Stat hint={`평균 ${data.totals.latency.avg ?? '–'}ms`} label="지연 p50 / p95" value={`${data.totals.latency.p50 ?? '–'} / ${data.totals.latency.p95 ?? '–'}ms`} />
              <Stat hint="근거 없음·확인 안 된 수치로 제외된 문장" label="품질 검증 제외" value={num(data.totals.validationIssues)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>일별 호출</CardTitle>
                  <CardDescription>파란색 성공 · 빨간색 오류</CardDescription>
                </CardHeader>
                <DailyChart daily={data.daily} />
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>상태별</CardTitle>
                </CardHeader>
                <ul className="space-y-2 text-sm">
                  {Object.entries(data.byStatus).map(([status, count]) => (
                    <li className="flex justify-between" key={status}>
                      <span className="text-ink-body">{STATUS_LABEL[status] ?? status}</span>
                      <span className="font-semibold text-ink-strong">{num(count)}</span>
                    </li>
                  ))}
                </ul>
                <h3 className="mt-5 text-sm font-bold text-ink-strong">모델별</h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {data.byModel.map((row) => (
                    <li className="flex justify-between gap-2" key={`${row.provider}-${row.model}`}>
                      <span className="truncate text-ink-body">
                        {row.provider} · {row.model}
                      </span>
                      <span className="shrink-0 text-ink-strong">
                        {num(row.calls)}회 · {usd(row.costUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>기능별 품질·비용</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-left text-xs text-ink-muted">
                    <tr>
                      <th className="py-2">기능</th>
                      <th>호출</th>
                      <th>성공률</th>
                      <th>평균 지연</th>
                      <th>호출당 제외 문장</th>
                      <th>토큰(입력/출력)</th>
                      <th>비용</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {data.byFeature.map((row) => (
                      <tr key={row.feature}>
                        <td className="py-2.5 font-semibold text-ink-strong">{FEATURE_LABEL[row.feature] ?? row.feature}</td>
                        <td>{num(row.calls)}</td>
                        <td>{row.successRate === null ? '–' : `${row.successRate}%`}</td>
                        <td>{row.avgLatencyMs === null ? '–' : `${row.avgLatencyMs}ms`}</td>
                        <td>{row.issuesPerCall ?? '–'}</td>
                        <td>
                          {num(row.inputTokens)} / {num(row.outputTokens)}
                        </td>
                        <td>{usd(row.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>사용량 상위 사용자</CardTitle>
                </CardHeader>
                <ul className="divide-y divide-surface-border text-sm">
                  {data.topUsers.map((user) => (
                    <li className="flex justify-between gap-2 py-2" key={user.userId ?? user.name}>
                      <span className="truncate">
                        <span className="font-semibold text-ink-strong">{user.name}</span>
                        <span className="ml-1 text-xs text-ink-muted">{user.email}</span>
                      </span>
                      <span className="shrink-0 text-ink-strong">
                        {num(user.calls)}회 · {usd(user.costUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>최근 오류</CardTitle>
                </CardHeader>
                {data.recentErrors.length === 0 ? (
                  <p className="text-sm text-ink-muted">기간 내 오류가 없습니다.</p>
                ) : (
                  <ul className="divide-y divide-surface-border text-sm">
                    {data.recentErrors.map((error) => (
                      <li className="py-2" key={error.id}>
                        <p className="flex flex-wrap items-center gap-2">
                          <Badge tone="red">{STATUS_LABEL[error.status] ?? error.status}</Badge>
                          <span className="font-semibold text-ink-strong">{FEATURE_LABEL[error.feature] ?? error.feature}</span>
                          <span className="text-xs text-ink-muted">
                            {error.model} · 시도 {error.attempts}회 · {new Date(error.createdAt).toLocaleString('ko-KR')}
                          </span>
                        </p>
                        {error.errorMessage ? <p className="mt-1 break-all text-xs text-ink-body">{error.errorCode}: {error.errorMessage}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
