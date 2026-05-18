import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Bot, BriefcaseBusiness, FileText, Search, Sparkles, UserRound } from 'lucide-react'
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
  createPortfolioText,
  createProfileInsight,
  createProjectInsight,
  getMyAnalyses,
} from '../../services/aiService'
import { getOpportunities } from '../../services/opportunityService'
import { getProjects } from '../../services/projectService'
import { useAuthStore } from '../../stores/authStore'
import type { AIOutput } from '../../types/ai'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function AICopilotPage() {
  const token = useAuthStore((state) => state.token)
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedOpportunityId, setSelectedOpportunityId] = useState('')
  const [latestOutput, setLatestOutput] = useState<AIOutput | null>(null)

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => getProjects(token ?? ''),
    enabled: Boolean(token),
  })
  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', 'ai'],
    queryFn: () => getOpportunities(token ?? ''),
    enabled: Boolean(token),
  })
  const analysesQuery = useQuery({
    queryKey: ['ai-analyses'],
    queryFn: () => getMyAnalyses(token ?? ''),
    enabled: Boolean(token),
  })

  const onSuccess = (output: AIOutput) => {
    setLatestOutput(output)
    queryClient.invalidateQueries({ queryKey: ['ai-analyses'] })
  }

  const profileMutation = useMutation({
    mutationFn: () => createProfileInsight(token ?? ''),
    onSuccess: ({ output }) => onSuccess(output),
  })
  const projectMutation = useMutation({
    mutationFn: () => createProjectInsight(token ?? '', selectedProjectId),
    onSuccess: ({ output }) => onSuccess(output),
  })
  const opportunityMutation = useMutation({
    mutationFn: () => createOpportunityMatch(token ?? '', selectedOpportunityId),
    onSuccess: ({ output }) => onSuccess(output),
  })
  const portfolioMutation = useMutation({
    mutationFn: () => createPortfolioText(token ?? '', selectedProjectId),
    onSuccess: ({ output }) => onSuccess(output),
  })

  const projects = projectsQuery.data?.projects ?? []
  const opportunities = opportunitiesQuery.data?.opportunities ?? []

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-strong">AI Copilot</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-body">
            프로필·프로젝트·기회 데이터를 분석하고 <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">AIAnalysis</code>에
            저장합니다. API 키가 없으면 안내용 스텁 응답으로 동작할 수 있습니다.
          </p>
        </div>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-brand-600">
                <Bot size={20} />
                <CardTitle>분석 실행</CardTitle>
              </div>
              <CardDescription>원하는 분석 유형을 선택하고 결과를 저장합니다.</CardDescription>
            </CardHeader>
            <Tabs
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={[
                {
                  id: 'profile',
                  label: 'Profile Insight',
                  content: (
                    <ActionPanel
                      description="프로필, 기술스택, 프로젝트 이력을 기반으로 강점과 성장 방향을 분석합니다."
                      disabled={profileMutation.isPending}
                      icon={<UserRound size={20} />}
                      onRun={() => profileMutation.mutate()}
                      title="사용자 강점 분석"
                    />
                  ),
                },
                {
                  id: 'project',
                  label: 'Project Insight',
                  content: (
                    <div className="space-y-4">
                      <Select
                        label="프로젝트"
                        onChange={(event) => setSelectedProjectId(event.target.value)}
                        value={selectedProjectId}
                      >
                        <option value="">프로젝트 선택</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </Select>
                      <ActionPanel
                        description="프로젝트 설명, 태스크, 활동, 파일을 기반으로 건강도와 리스크를 분석합니다."
                        disabled={!selectedProjectId || projectMutation.isPending}
                        icon={<BriefcaseBusiness size={20} />}
                        onRun={() => projectMutation.mutate()}
                        title="프로젝트 건강도 분석"
                      />
                    </div>
                  ),
                },
                {
                  id: 'opportunity',
                  label: 'Opportunity Match',
                  content: (
                    <div className="space-y-4">
                      <Select
                        label="기회"
                        onChange={(event) => setSelectedOpportunityId(event.target.value)}
                        value={selectedOpportunityId}
                      >
                        <option value="">기회 선택</option>
                        {opportunities.map((opportunity) => (
                          <option key={opportunity.id} value={opportunity.id}>
                            {opportunity.title}
                          </option>
                        ))}
                      </Select>
                      <ActionPanel
                        description="프로필 기술스택과 기회 요구 역량을 비교해 매칭 점수와 추천 이유를 생성합니다."
                        disabled={!selectedOpportunityId || opportunityMutation.isPending}
                        icon={<Search size={20} />}
                        onRun={() => opportunityMutation.mutate()}
                        title="기회 매칭 분석"
                      />
                    </div>
                  ),
                },
                {
                  id: 'portfolio',
                  label: 'Portfolio Generator',
                  content: (
                    <div className="space-y-4">
                      <Select
                        label="프로젝트"
                        onChange={(event) => setSelectedProjectId(event.target.value)}
                        value={selectedProjectId}
                      >
                        <option value="">프로젝트 선택</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </Select>
                      <ActionPanel
                        description="프로젝트 데이터를 기반으로 포트폴리오에 바로 쓸 수 있는 문장을 생성합니다."
                        disabled={!selectedProjectId || portfolioMutation.isPending}
                        icon={<FileText size={20} />}
                        onRun={() => portfolioMutation.mutate()}
                        title="포트폴리오 문장 생성"
                      />
                    </div>
                  ),
                },
              ]}
            />
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-brand-600">
                <Sparkles size={20} />
                <CardTitle>최근 결과</CardTitle>
              </div>
              <CardDescription>방금 생성한 AI 분석 결과입니다.</CardDescription>
            </CardHeader>
            {latestOutput ? <AIOutputCard output={latestOutput} /> : (
              <EmptyState description="왼쪽에서 분석을 실행하면 결과가 여기에 표시됩니다." title="아직 생성된 결과가 없습니다" />
            )}
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>AI 분석 이력</CardTitle>
            <CardDescription>저장된 `AIAnalysis` 레코드입니다.</CardDescription>
          </CardHeader>
          {analysesQuery.isLoading ? <LoadingState /> : null}
          {analysesQuery.data?.analyses.length === 0 ? (
            <EmptyState description="분석을 실행하면 이력에 저장됩니다." title="분석 이력이 없습니다" />
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {analysesQuery.data?.analyses.map((analysis) => (
              <div className="rounded-2xl border border-surface-border p-4" key={analysis.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="purple">{analysis.type}</Badge>
                  <Badge>{analysis.provider} · {analysis.model}</Badge>
                </div>
                <p className="mt-3 font-bold text-ink-strong">{analysis.output.summary}</p>
                <p className="mt-2 text-sm text-ink-muted">{formatDate(analysis.createdAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}

type ActionPanelProps = {
  title: string
  description: string
  icon: ReactNode
  disabled: boolean
  onRun: () => void
}

function ActionPanel({ title, description, icon, disabled, onRun }: ActionPanelProps) {
  return (
    <div className="rounded-3xl border border-surface-border p-5">
      <div className="flex items-center gap-2 text-brand-600">{icon}</div>
      <h3 className="mt-3 text-lg font-bold text-ink-strong">{title}</h3>
      <p className="mt-2 leading-7 text-ink-body">{description}</p>
      <Button className="mt-5 gap-2" disabled={disabled} onClick={onRun}>
        <Sparkles size={16} />
        분석 실행
      </Button>
    </div>
  )
}

function AIOutputCard({ output }: { output: AIOutput }) {
  return (
    <div className="space-y-5">
      {output.matchScore !== undefined ? (
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="text-sm font-semibold text-brand-700">Match Score</p>
          <p className="mt-1 text-3xl font-bold text-ink-strong">{output.matchScore}</p>
        </div>
      ) : null}
      <p className="rounded-2xl bg-surface-muted p-5 leading-7 text-ink-body">{output.summary}</p>
      {output.generatedText ? (
        <div className="rounded-2xl border border-brand-100 bg-white p-5">
          <p className="text-sm font-semibold text-brand-700">Generated Portfolio Text</p>
          <p className="mt-2 leading-7 text-ink-body">{output.generatedText}</p>
        </div>
      ) : null}
      <ResultList title="Strengths" items={output.strengths} tone="green" />
      <ResultList title="Gaps" items={output.gaps} tone="red" />
      <ResultList title="Recommendations" items={output.recommendations} tone="blue" />
    </div>
  )
}

function ResultList({ title, items, tone }: { title: string; items: string[]; tone: 'blue' | 'green' | 'red' }) {
  return (
    <div>
      <h3 className="font-bold text-ink-strong">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} tone={tone}>{item}</Badge>
        ))}
      </div>
    </div>
  )
}
