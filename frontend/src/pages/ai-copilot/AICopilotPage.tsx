import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BriefcaseBusiness, FileDown, FileText, Gauge, Loader2, Search, Sparkles, UserRound } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ClaimList, SourceTable } from '../../components/ai/ClaimList'
import { PortfolioView } from '../../components/ai/PortfolioView'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { Select } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { Tabs } from '../../components/common/Tabs'
import { AppLayout } from '../../components/layout/AppLayout'
import {
  createOpportunityMatch,
  createProfileInsight,
  createProjectInsight,
  downloadPortfolioPdf,
  generatePortfolio,
  getAiQuota,
  getLatestPortfolio,
  getMyAnalyses,
} from '../../services/insightService'
import { getOpportunities } from '../../services/opportunityService'
import { getProjects } from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { InsightResponse, PortfolioResponse } from '../../types/insights'

const TYPE_LABEL: Record<string, string> = {
  PROFILE_INSIGHT: '역량 분석',
  PROJECT_INSIGHT: '프로젝트 분석',
  OPPORTUNITY_MATCH: '기회 매칭',
  PORTFOLIO_GENERATOR: 'AI 포트폴리오',
  REPORT_NARRATIVE: '보고서 서술',
  TALENT_MATCH_EXPLANATION: '인재 추천 설명',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function useInvalidateAi() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['ai-analyses'] })
    void queryClient.invalidateQueries({ queryKey: ['ai-quota'] })
  }
}

function PortfolioTab() {
  const token = useAuthStore((state) => state.token)
  const invalidate = useInvalidateAi()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)

  const projectsQuery = useQuery({ queryKey: ['projects', 'options'], queryFn: () => getProjects(token!, { limit: 50 }), enabled: Boolean(token) })
  const latestQuery = useQuery({ queryKey: ['ai-portfolio', 'latest'], queryFn: () => getLatestPortfolio(token!), enabled: Boolean(token) })
  const generate = useMutation({
    mutationFn: () => generatePortfolio(token!, selected),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai-portfolio', 'latest'], data)
      invalidate()
      showToast('포트폴리오를 생성했습니다.')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const latest = latestQuery.data && latestQuery.data.portfolio ? (latestQuery.data as PortfolioResponse) : null
  const projects = projectsQuery.data?.projects ?? []

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-brand-600">
            <FileText size={20} />
            <CardTitle>AI 포트폴리오 만들기</CardTitle>
          </div>
          <CardDescription>
            BAESH에 기록한 프로젝트 목표·역할·태스크·활동·외부 산출물·기관 검증 기록을 연결해 포트폴리오 초안을 만듭니다. 모든 문장에 근거가 표시되며,
            데이터에 없는 수치나 성과가 들어간 문장은 자동으로 제외됩니다.
          </CardDescription>
        </CardHeader>
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-ink-strong">포함할 프로젝트 (선택하지 않으면 최근 6개)</p>
          {projectsQuery.isLoading ? <LoadingState /> : null}
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {projects.map((project) => {
              const checked = selected.includes(project.id)
              return (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-muted" key={project.id}>
                  <input
                    checked={checked}
                    className="accent-brand-600"
                    disabled={!checked && selected.length >= 6}
                    onChange={() => setSelected(checked ? selected.filter((id) => id !== project.id) : [...selected, project.id])}
                    type="checkbox"
                  />
                  <span className="truncate text-ink-body">{project.title}</span>
                </label>
              )
            })}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="gap-2" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            {latest ? '다시 생성' : '포트폴리오 생성'}
          </Button>
          {latest ? (
            <Button
              className="gap-2"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadPortfolioPdf(token!, latest.analysisId)
                } catch (error) {
                  showToast((error as Error).message, 'error')
                } finally {
                  setDownloading(false)
                }
              }}
              variant="secondary"
            >
              {downloading ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
              PDF 다운로드
            </Button>
          ) : null}
        </div>
        <p className="mt-4 text-xs leading-5 text-ink-muted">
          출력 형식: 웹 보기(오른쪽) · PDF · 이력서 요약(복사). 초록색 표시는 기관 담당자가 승인한 증빙에 근거한 문장입니다.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>포트폴리오</CardTitle>
          {latest ? (
            <CardDescription>
              {latest.meta.createdAt ? `${formatDate(latest.meta.createdAt)} 생성 · ` : ''}
              {latest.meta.provider === 'mock' ? '규칙 기반 초안' : `${latest.meta.provider} · ${latest.meta.model}`}
            </CardDescription>
          ) : null}
        </CardHeader>
        {latestQuery.isLoading ? <LoadingState /> : null}
        {latest ? (
          <PortfolioView portfolio={latest.portfolio} validation={latest.validation} />
        ) : latestQuery.isLoading ? null : (
          <EmptyState description="왼쪽에서 포트폴리오를 생성하면 여기에 표시됩니다." title="아직 생성한 포트폴리오가 없습니다" />
        )}
      </Card>
    </div>
  )
}

function InsightView({ data }: { data: InsightResponse }) {
  const sources = useMemo(() => new Map(data.insight.sources.map((s) => [s.ref, s])), [data.insight.sources])
  const [showSources, setShowSources] = useState(false)
  return (
    <div className="space-y-5">
      {data.match ? (
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">기술 일치율 (서버 계산)</p>
          <p className="mt-1 text-3xl font-bold text-ink-strong">{data.match.score === null ? '–' : `${data.match.score}%`}</p>
          <p className="mt-1 text-xs text-ink-muted">{data.match.basis}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.match.matched.map((skill) => (
              <Badge key={skill} tone="green">{skill}</Badge>
            ))}
            {data.match.missing.map((skill) => (
              <Badge key={skill} tone="red">{skill}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      <p className="rounded-2xl bg-surface-muted p-5 leading-7 text-ink-body">{data.insight.summary}</p>
      <div>
        <h3 className="font-bold text-ink-strong">강점</h3>
        <div className="mt-2">
          <ClaimList claims={data.insight.strengths} empty="근거가 확인된 강점이 아직 없습니다." sources={sources} />
        </div>
      </div>
      {data.insight.gaps.length ? (
        <div>
          <h3 className="font-bold text-ink-strong">보완할 점</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-body">
            {data.insight.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.insight.recommendations.length ? (
        <div>
          <h3 className="font-bold text-ink-strong">추천 행동</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-body">
            {data.insight.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span>{data.meta.provider === 'mock' ? '규칙 기반 분석' : `${data.meta.provider} · ${data.meta.model}`}</span>
        {data.validation.dropped ? <Badge tone="red">근거 부족 문장 {data.validation.dropped}개 제외</Badge> : null}
        <button className="font-semibold hover:text-ink-strong" onClick={() => setShowSources((v) => !v)} type="button">
          {showSources ? '근거 숨기기' : '근거 자료 보기'}
        </button>
      </div>
      {showSources ? <SourceTable sources={data.insight.sources} /> : null}
    </div>
  )
}

function ActionPanel({ title, description, icon, disabled, pending, onRun }: { title: string; description: string; icon: ReactNode; disabled: boolean; pending: boolean; onRun: () => void }) {
  return (
    <div className="rounded-3xl border border-surface-border p-5">
      <div className="flex items-center gap-2 text-brand-600">{icon}</div>
      <h3 className="mt-3 text-lg font-bold text-ink-strong">{title}</h3>
      <p className="mt-2 leading-7 text-ink-body">{description}</p>
      <Button className="mt-5 gap-2" disabled={disabled || pending} onClick={onRun}>
        {pending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
        분석 실행
      </Button>
    </div>
  )
}

function InsightTab() {
  const token = useAuthStore((state) => state.token)
  const invalidate = useInvalidateAi()
  const [mode, setMode] = useState('profile')
  const [projectId, setProjectId] = useState('')
  const [opportunityId, setOpportunityId] = useState('')
  const [result, setResult] = useState<InsightResponse | null>(null)

  const projectsQuery = useQuery({ queryKey: ['projects', 'options'], queryFn: () => getProjects(token!, { limit: 50 }), enabled: Boolean(token) })
  const opportunitiesQuery = useQuery({ queryKey: ['opportunities', 'ai'], queryFn: () => getOpportunities(token!), enabled: Boolean(token) })
  const run = useMutation({
    mutationFn: (kind: string) =>
      kind === 'project' ? createProjectInsight(token!, projectId) : kind === 'opportunity' ? createOpportunityMatch(token!, opportunityId) : createProfileInsight(token!),
    onSuccess: (data) => {
      setResult(data)
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <Tabs
          activeTab={mode}
          onChange={setMode}
          tabs={[
            {
              id: 'profile',
              label: '역량 분석',
              content: (
                <ActionPanel
                  description="내 프로젝트·태스크·활동·검증 기록을 근거로 강점과 보완할 점을 정리합니다."
                  disabled={false}
                  icon={<UserRound size={20} />}
                  onRun={() => run.mutate('profile')}
                  pending={run.isPending}
                  title="역량 분석"
                />
              ),
            },
            {
              id: 'project',
              label: '프로젝트 분석',
              content: (
                <div className="space-y-4">
                  <Select label="프로젝트" onChange={(e) => setProjectId(e.target.value)} value={projectId}>
                    <option value="">프로젝트 선택</option>
                    {(projectsQuery.data?.projects ?? []).map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Select>
                  <ActionPanel
                    description="참여 중인 프로젝트에서 나의 기여와 보완할 기록을 분석합니다."
                    disabled={!projectId}
                    icon={<BriefcaseBusiness size={20} />}
                    onRun={() => run.mutate('project')}
                    pending={run.isPending}
                    title="프로젝트 분석"
                  />
                </div>
              ),
            },
            {
              id: 'opportunity',
              label: '기회 매칭',
              content: (
                <div className="space-y-4">
                  <Select label="기회" onChange={(e) => setOpportunityId(e.target.value)} value={opportunityId}>
                    <option value="">기회 선택</option>
                    {(opportunitiesQuery.data?.opportunities ?? []).map((opportunity) => (
                      <option key={opportunity.id} value={opportunity.id}>
                        {opportunity.title}
                      </option>
                    ))}
                  </Select>
                  <ActionPanel
                    description="요구 기술과 내 기록을 비교합니다. 일치율은 서버가 계산하고, AI는 설명만 작성합니다."
                    disabled={!opportunityId}
                    icon={<Search size={20} />}
                    onRun={() => run.mutate('opportunity')}
                    pending={run.isPending}
                    title="기회 매칭"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>분석 결과</CardTitle>
        </CardHeader>
        {result ? <InsightView data={result} /> : <EmptyState description="왼쪽에서 분석을 실행하면 결과가 여기에 표시됩니다." title="아직 분석 결과가 없습니다" />}
      </Card>
    </div>
  )
}

export function AICopilotPage() {
  const token = useAuthStore((state) => state.token)
  const [tab, setTab] = useState('portfolio')
  const quotaQuery = useQuery({ queryKey: ['ai-quota'], queryFn: () => getAiQuota(token!), enabled: Boolean(token) })
  const analysesQuery = useQuery({ queryKey: ['ai-analyses'], queryFn: () => getMyAnalyses(token!), enabled: Boolean(token) })
  const quota = quotaQuery.data?.quota

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">AI Copilot</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-body">
              BAESH에 쌓인 내 기록만으로 포트폴리오와 분석을 만듭니다. AI가 쓴 모든 문장은 근거 기록과 연결되며, 확인되지 않은 수치·성과는 자동으로 걸러집니다.
            </p>
          </div>
          {quota ? (
            <div className="flex items-center gap-2 rounded-2xl border border-surface-border bg-white px-4 py-2 text-sm">
              <Gauge className="text-brand-600" size={16} />
              <span className="text-ink-body">
                {quota.window} 남은 사용 <b className="text-ink-strong">{quota.remaining}</b>/{quota.limit}
              </span>
              <Badge>{quota.provider === 'mock' ? '규칙 엔진' : quota.model}</Badge>
            </div>
          ) : null}
        </div>

        <Tabs
          activeTab={tab}
          onChange={setTab}
          tabs={[
            { id: 'portfolio', label: 'AI 포트폴리오', content: <PortfolioTab /> },
            { id: 'insights', label: '분석', content: <InsightTab /> },
          ]}
          variant="underline"
        />

        <Card>
          <CardHeader>
            <CardTitle>AI 사용 이력</CardTitle>
          </CardHeader>
          {analysesQuery.isLoading ? <LoadingState /> : null}
          {analysesQuery.data?.analyses.length === 0 ? <EmptyState description="AI 기능을 사용하면 이력이 남습니다." title="이력이 없습니다" /> : null}
          <ul className="divide-y divide-surface-border">
            {analysesQuery.data?.analyses.map((analysis) => (
              <li className="flex flex-wrap items-center gap-2 py-2.5 text-sm" key={analysis.id}>
                <Badge tone="purple">{TYPE_LABEL[analysis.type] ?? analysis.type}</Badge>
                <span className="text-ink-body">{analysis.provider === 'mock' ? '규칙 엔진' : `${analysis.provider} · ${analysis.model}`}</span>
                <span className="ml-auto text-xs text-ink-muted">{formatDate(analysis.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppLayout>
  )
}
