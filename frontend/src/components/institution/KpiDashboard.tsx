import { ChevronDown, Info, Target } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { PeriodParams } from '../../services/insightService'
import type { KpiKey, KpiMetric, KpiResult } from '../../types/insights'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'

const RATE_CARDS: KpiKey[] = ['projectCompletionRate', 'participationRate', 'approvalRate', 'goalAchievementRate']
const DEFINITION_ORDER: KpiKey[] = [
  'projectCompletionRate',
  'participationRate',
  'submissionRate',
  'approvalRate',
  'averageProgress',
  'approvedEvidenceCount',
  'goalAchievementRate',
]
const STATUS_LABEL: Record<string, string> = { planning: '기획', active: '진행', completed: '완료', archived: '보관' }

const day = (iso: string) => iso.slice(0, 10)
const pct = (value: number | null) => (value === null ? '–' : `${value}%`)

function shiftDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function TargetBadge({ metric, unit = '%' }: { metric: KpiMetric; unit?: string }) {
  if (metric.target === null) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', metric.met ? 'text-emerald-700' : 'text-red-600')}>
      <Target size={12} />
      목표 {metric.target}
      {unit} · {metric.met ? '달성' : '미달'}
    </span>
  )
}

function MetricCard({
  label,
  value,
  hint,
  metric,
  definition,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  metric?: KpiMetric
  definition?: { numerator: string; denominator: string; basis: string }
}) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {definition ? (
          <span className="group relative text-ink-muted">
            <Info size={14} />
            <span className="pointer-events-none absolute right-0 top-5 z-20 hidden w-64 rounded-xl border border-surface-border bg-white p-3 text-xs font-normal normal-case leading-5 text-ink-body shadow-card group-hover:block">
              <b>분자</b> {definition.numerator}
              <br />
              <b>분모</b> {definition.denominator}
              <br />
              <b>기준</b> {definition.basis}
            </span>
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-bold text-ink-strong">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        {hint}
        {metric ? <TargetBadge metric={metric} /> : null}
      </div>
    </Card>
  )
}

function ProjectProgressChart({ result }: { result: KpiResult }) {
  const rows = [...result.projects].filter((p) => p.status !== 'archived').sort((a, b) => b.progress - a.progress)
  if (!rows.length) return <p className="text-sm text-ink-muted">운영 중인 프로젝트가 없습니다.</p>
  return (
    <ul className="space-y-2.5">
      {rows.map((project) => (
        <li className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_3rem]" key={project.id}>
          <span className="truncate font-medium text-ink-strong" title={project.title}>
            {project.teamName ?? project.title}
          </span>
          <span className="h-3 overflow-hidden rounded-full bg-surface-muted">
            <span
              className={cn('block h-full rounded-full', project.status === 'completed' ? 'bg-emerald-500' : 'bg-brand-600')}
              style={{ width: `${Math.max(2, Math.min(100, project.progress))}%` }}
            />
          </span>
          <span className="text-right font-semibold text-ink-strong">{project.progress}%</span>
        </li>
      ))}
    </ul>
  )
}

function TrendChart({ result }: { result: KpiResult }) {
  const buckets = result.trend.buckets
  if (!buckets.length) return null
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.submissions, b.approvals, b.activeStudents)))
  const width = 640
  const height = 160
  const step = width / buckets.length
  const barWidth = Math.max(3, Math.min(16, step / 2 - 3))
  const y = (value: number) => height - (value / max) * (height - 16)
  const line = buckets.map((b, i) => `${i === 0 ? 'M' : 'L'}${i * step + step / 2},${y(b.activeStudents)}`).join(' ')
  const labelEvery = Math.ceil(buckets.length / 10)
  return (
    <div>
      <svg className="w-full" role="img" viewBox={`0 0 ${width} ${height + 18}`}>
        <title>기간별 증빙 제출·승인 건수와 활동 참여자 수</title>
        <line stroke="#e2e8f0" x1="0" x2={width} y1={height} y2={height} />
        {buckets.map((b, i) => {
          const x = i * step + step / 2
          return (
            <g key={b.start}>
              <rect fill="#93c5fd" height={height - y(b.submissions)} rx="2" width={barWidth} x={x - barWidth - 1} y={y(b.submissions)}>
                <title>{`${b.start} 제출 ${b.submissions}건`}</title>
              </rect>
              <rect fill="#16a34a" height={height - y(b.approvals)} rx="2" width={barWidth} x={x + 1} y={y(b.approvals)}>
                <title>{`${b.start} 승인 ${b.approvals}건`}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text fill="#64748b" fontSize="10" textAnchor="middle" x={x} y={height + 14}>
                  {b.start.slice(5)}
                </text>
              ) : null}
            </g>
          )
        })}
        <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2" />
      </svg>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#93c5fd]" />증빙 제출</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#16a34a]" />증빙 승인</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#7c3aed]" />활동 참여자 수</span>
        <span>{result.trend.granularity === 'month' ? '월' : '주'} 단위 · 최대 {max}</span>
      </p>
    </div>
  )
}

export function PeriodFilter({ result, onChange }: { result: KpiResult | undefined; onChange: (period: PeriodParams) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const presets = [
    { label: '최근 30일', from: shiftDays(30) },
    { label: '최근 90일', from: shiftDays(90) },
  ]
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-ink-muted">
        시작일
        <input
          className="mt-1 block h-10 rounded-xl border border-surface-border px-3 text-sm text-ink-strong"
          onChange={(e) => setFrom(e.target.value)}
          type="date"
          value={from || (result ? day(result.period.from) : '')}
        />
      </label>
      <label className="text-xs font-semibold text-ink-muted">
        종료일
        <input
          className="mt-1 block h-10 rounded-xl border border-surface-border px-3 text-sm text-ink-strong"
          onChange={(e) => setTo(e.target.value)}
          type="date"
          value={to || (result ? day(result.period.to) : '')}
        />
      </label>
      <Button className="min-h-10 py-2" onClick={() => onChange({ from: from || undefined, to: to || undefined })} variant="secondary">
        적용
      </Button>
      {presets.map((preset) => (
        <Button
          className="min-h-10 py-2"
          key={preset.label}
          onClick={() => {
            setFrom(preset.from)
            setTo('')
            onChange({ from: preset.from })
          }}
          variant="ghost"
        >
          {preset.label}
        </Button>
      ))}
      <Button
        className="min-h-10 py-2"
        onClick={() => {
          setFrom('')
          setTo('')
          onChange({})
        }}
        variant="ghost"
      >
        운영 전체 기간
      </Button>
    </div>
  )
}

export function KpiDashboard({ result, aside }: { result: KpiResult; aside?: ReactNode }) {
  const [definitionsOpen, setDefinitionsOpen] = useState(false)
  const { totals, definitions: defs } = result
  const m = totals.metrics
  const c = totals.counts

  return (
    <div className="space-y-5">
      <p className="text-xs text-ink-muted">
        집계 기간 {day(result.period.from)} ~ {day(result.period.to)} · 모든 수치는 데이터베이스 기록을 요청 시점에 집계한 값입니다.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard hint={`완료 ${c.completedProjects}개`} label="운영 프로젝트" value={c.projects} />
        <MetricCard hint={`등록 ${c.uniqueStudents}명 중 기간 내 활동`} label="활동 참여자" value={c.activeStudents} />
        <MetricCard
          definition={defs.submissionRate}
          hint={`${m.submissionRate.numerator} / ${m.submissionRate.denominator}명`}
          label={defs.submissionRate.label}
          metric={m.submissionRate}
          value={pct(m.submissionRate.value)}
        />
        <MetricCard
          definition={defs.averageProgress}
          hint={`프로젝트 ${m.averageProgress.denominator}개 평균`}
          label={defs.averageProgress.label}
          metric={m.averageProgress}
          value={pct(m.averageProgress.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {RATE_CARDS.map((key) => (
          <MetricCard
            definition={defs[key]}
            hint={m[key].denominator ? `${m[key].numerator} / ${m[key].denominator}` : key === 'goalAchievementRate' ? '목표 미설정' : '대상 없음'}
            key={key}
            label={defs[key].label}
            metric={key === 'goalAchievementRate' ? undefined : m[key]}
            value={pct(m[key].value)}
          />
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        승인 증빙 {c.approvedEvidence}건 · 반려 {c.rejectedEvidence}건 · 검토 대기 {c.pendingEvidence}건 · 기간 내 검증 기록 발급 {totals.verifiedRecordsIssued}건
      </p>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>프로젝트별 진행률</CardTitle>
            <CardDescription>태스크가 있으면 완료 태스크 비율, 없으면 팀이 입력한 진행률입니다.</CardDescription>
          </CardHeader>
          <ProjectProgressChart result={result} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>증빙 제출·승인 추이</CardTitle>
            <CardDescription>제출 시각·검토 시각 기준으로 묶었습니다.</CardDescription>
          </CardHeader>
          <TrendChart result={result} />
        </Card>
      </div>

      {result.programs.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>프로그램별 비교</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-2">프로그램</th>
                  <th>프로젝트</th>
                  <th>등록 참여자</th>
                  <th>참여율</th>
                  <th>제출률</th>
                  <th>승인율</th>
                  <th>평균 진행률</th>
                  <th>목표 달성</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {result.programs.map((program) => (
                  <tr key={program.id}>
                    <td className="py-2.5 font-semibold text-ink-strong">
                      {program.title}
                      {program.term ? <span className="ml-1 text-xs font-normal text-ink-muted">{program.term}</span> : null}
                    </td>
                    <td>{program.counts.projects}</td>
                    <td>{program.counts.enrollments}</td>
                    <td>{pct(program.metrics.participationRate.value)}</td>
                    <td>{pct(program.metrics.submissionRate.value)}</td>
                    <td>{pct(program.metrics.approvalRate.value)}</td>
                    <td>{pct(program.metrics.averageProgress.value)}</td>
                    <td>
                      {program.metrics.goalAchievementRate.denominator ? (
                        <Badge tone={program.metrics.goalAchievementRate.value === 100 ? 'green' : 'gray'}>
                          {program.metrics.goalAchievementRate.numerator}/{program.metrics.goalAchievementRate.denominator}
                        </Badge>
                      ) : (
                        <span className="text-xs text-ink-muted">미설정</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>프로젝트별 참여 현황</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr>
                <th className="py-2">팀 · 프로젝트</th>
                <th>상태</th>
                <th>팀원</th>
                <th title="기간 내 활동 기록 또는 증빙을 작성한 등록 참여자 수">활동 참여자</th>
                <th>태스크</th>
                <th>기간 내 활동</th>
                <th>증빙 제출</th>
                <th>승인 / 반려 / 대기</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {result.projects.map((project) => (
                <tr key={project.id}>
                  <td className="py-2.5">
                    <p className="font-semibold text-ink-strong">{project.teamName ?? project.title}</p>
                    {project.teamName ? <p className="text-xs text-ink-muted">{project.title}</p> : null}
                  </td>
                  <td>{STATUS_LABEL[project.status] ?? project.status}</td>
                  <td>{project.memberCount}</td>
                  <td>{project.activeContributors}</td>
                  <td>
                    {project.tasks.done}/{project.tasks.total}
                  </td>
                  <td>{project.activitiesInPeriod}</td>
                  <td>{project.evidence.submitted}</td>
                  <td>
                    <span className="text-emerald-700">{project.evidence.approved}</span> / <span className="text-red-600">{project.evidence.rejected}</span> /{' '}
                    <span className="text-violet-700">{project.evidence.pending}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {aside}

      <Card>
        <button className="flex w-full items-center justify-between text-left" onClick={() => setDefinitionsOpen((open) => !open)} type="button">
          <span>
            <span className="block text-lg font-bold text-ink-strong">지표 산출 기준</span>
            <span className="text-sm text-ink-muted">각 지표의 분자·분모·집계 기준입니다. 결과보고서에도 같은 기준이 수록됩니다.</span>
          </span>
          <ChevronDown className={cn('shrink-0 transition', definitionsOpen && 'rotate-180')} size={18} />
        </button>
        {definitionsOpen ? (
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {DEFINITION_ORDER.map((key) => (
              <div className="rounded-2xl bg-surface-muted/60 p-4 text-sm" key={key}>
                <dt className="font-bold text-ink-strong">{defs[key].label}</dt>
                <dd className="mt-1 space-y-0.5 text-ink-body">
                  <p>분자: {defs[key].numerator}</p>
                  <p>분모: {defs[key].denominator}</p>
                  <p className="text-ink-muted">기준: {defs[key].basis}</p>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Card>
    </div>
  )
}
