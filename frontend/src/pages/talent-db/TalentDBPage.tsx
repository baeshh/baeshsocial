import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, ExternalLink, Loader2, Mail, Search, ShieldCheck, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/common/Avatar'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../../components/common/Card'
import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { ManagementAppShell } from '../../components/layout/ManagementAppShell'
import { ShellSkeleton } from '../../components/layout/ShellSkeleton'
import { buildOrgNav } from '../../components/organizations/orgNavigation'
import { ORG_ROLE_LABEL, ORG_TYPE_META } from '../../lib/organizations'
import { useMyOrganizations } from '../../hooks/useMyOrganizations'
import { cn } from '../../lib/cn'
import { getTalentMeta, getTalentSearch, getTalentSearches, runTalentSearch, setMatchFeedback } from '../../services/insightService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { TalentBreakdownKey, TalentResult, TalentSearch } from '../../types/insights'

const PART_META: Record<TalentBreakdownKey, { label: string; color: string }> = {
  skills: { label: '기술', color: 'bg-brand-600' },
  projects: { label: '관련 프로젝트', color: 'bg-sky-400' },
  verified: { label: '검증 성과', color: 'bg-emerald-500' },
  recency: { label: '최근성', color: 'bg-violet-400' },
}
const PARTS: TalentBreakdownKey[] = ['skills', 'projects', 'verified', 'recency']
const FEEDBACK = [
  { id: 'shortlisted', label: '관심 후보', icon: Bookmark },
  { id: 'contacted', label: '연락함', icon: Mail },
  { id: 'not_a_fit', label: '맞지 않음', icon: ThumbsDown },
] as const

const splitTags = (value: string) => [...new Set(value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean))]

function ResultCard({ result, orgId, searchId }: { result: TalentResult; orgId: string; searchId: string }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const feedback = useMutation({
    mutationFn: (value: (typeof FEEDBACK)[number]['id'] | null) => setMatchFeedback(token!, orgId, searchId, result.id, value),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['talent', orgId, 'search', searchId] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (result.withdrawn) {
    return (
      <Card className="rounded-2xl p-5 text-sm text-ink-muted">
        #{result.rank} ·{' '}
        {result.reason === 'not_shareable'
          ? '후보가 공개 범위를 바꿔 이 검색 조건에 맞는 공개 정보가 남아 있지 않아 더 이상 표시되지 않습니다.'
          : '이 후보는 인재 검색 동의를 철회해 더 이상 표시되지 않습니다.'}
      </Card>
    )
  }

  const { candidate, evidence } = result
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="w-8 pt-1 text-lg font-bold text-ink-muted">#{result.rank}</span>
        <Avatar name={candidate.name} src={candidate.avatarUrl} />
        <div className="min-w-0 flex-1">
          <Link className="font-bold text-ink-strong hover:text-brand-600" to={`/profile/${candidate.id}`}>
            {candidate.name}
          </Link>
          <p className="text-sm text-ink-muted">{[candidate.headline, candidate.school].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="w-full sm:w-56">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-ink-muted">규칙 점수</span>
            <span className="text-2xl font-bold text-ink-strong">{result.score}</span>
          </div>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-surface-muted">
            {PARTS.map((part) => (
              <span
                className={PART_META[part].color}
                key={part}
                style={{ width: `${result.breakdown[part].points}%` }}
                title={`${PART_META[part].label} ${result.breakdown[part].points}점 (가중치 ${result.breakdown[part].weight * 100}%)`}
              />
            ))}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-ink-muted">
            {PARTS.map((part) => (
              <span key={part}>
                {PART_META[part].label} {result.breakdown[part].points}
              </span>
            ))}
          </p>
        </div>
      </div>

      {result.recalculated ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800" role="note">
          후보가 검색 이후 일부 프로젝트·기록의 공개를 거둬, 지금 공개된 정보만으로 점수와 추천 이유를 다시 계산했습니다.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {evidence.matchedSkills.map((m) => (
              <Badge key={m.skill} title={`근거: ${m.backedBy.join(', ')}`} tone={m.backedBy.includes('프로필') ? 'gray' : 'green'}>
                {m.skill}
                {m.backedBy.includes('프로필') ? ' (프로필)' : ''}
              </Badge>
            ))}
            {evidence.missingSkills.map((skill) => (
              <Badge className="line-through" key={skill} tone="red">
                {skill}
              </Badge>
            ))}
          </div>
          {evidence.projects.length ? (
            <div>
              <p className="text-xs font-semibold text-ink-muted">관련 프로젝트</p>
              <ul className="mt-1 space-y-1 text-sm">
                {evidence.projects.slice(0, 3).map((project) => (
                  <li className="flex items-center gap-2" key={project.id}>
                    {project.public ? (
                      <Link className="truncate font-medium text-ink-strong hover:text-brand-600" to={`/projects/${project.id}`}>
                        {project.title}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-ink-strong">{project.title}</span>
                    )}
                    <span className="shrink-0 text-xs text-ink-muted">관련도 {Math.round(project.relevance * 100)}%</span>
                    {!project.public ? <Badge tone="green">검증된 프로젝트</Badge> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evidence.verified.length ? (
            <div>
              <p className="text-xs font-semibold text-ink-muted">기관 검증 기록</p>
              <ul className="mt-1 space-y-1 text-sm">
                {evidence.verified.slice(0, 3).map((record) => (
                  <li className="flex items-start gap-1.5" key={record.id}>
                    <ShieldCheck className={cn('mt-0.5 shrink-0', record.relevant ? 'text-emerald-600' : 'text-ink-muted')} size={14} />
                    <span>
                      <span className="font-medium text-ink-strong">{record.title}</span>
                      <span className="text-xs text-ink-muted">
                        {' '}
                        · {record.organization ?? '기관'}
                        {record.program ? ` · ${record.program}` : ''} · {record.verifiedAt.slice(0, 10)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-surface-muted/60 p-4">
          <p className="text-xs font-semibold text-ink-muted">
            추천 이유 {result.explanationSource === 'ai' ? `· AI 작성 (${result.explanationModel ?? ''})` : result.explanationSource === 'rule' ? '· 규칙 기반' : ''}
          </p>
          {result.explanation ? (
            <>
              <ul className="mt-2 space-y-1 text-sm text-ink-body">
                {result.explanation.reasons.map((claim) => (
                  <li key={claim.text}>
                    • {claim.text}
                    {claim.verified ? <ShieldCheck className="ml-1 inline text-emerald-600" size={13} /> : null}
                  </li>
                ))}
              </ul>
              {result.explanation.cautions.length ? (
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {result.explanation.cautions.map((claim) => (
                    <li key={claim.text}>! {claim.text}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">상위 5명에게만 추천 이유를 작성합니다. 왼쪽 근거 데이터를 확인하세요.</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-3">
        {FEEDBACK.map(({ id, label, icon: Icon }) => (
          <button
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
              result.feedback === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-surface-border text-ink-body hover:border-brand-200',
            )}
            disabled={feedback.isPending}
            key={id}
            onClick={() => feedback.mutate(result.feedback === id ? null : id)}
            type="button"
          >
            <Icon size={13} /> {label}
          </button>
        ))}
        <Link className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-brand-600" to={`/profile/${candidate.id}`}>
          프로필 보기 <ExternalLink size={12} />
        </Link>
      </div>
    </Card>
  )
}

export function TalentDBPage() {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { activeMemberships, isLoading } = useMyOrganizations()
  const companies = activeMemberships.filter((m) => m.organization.type === 'company' && m.organization.verificationStatus === 'approved')
  const membership = companies.find((m) => m.organization.id === params.get('org')) ?? companies[0] ?? null
  const orgId = membership?.organization.id ?? ''
  const searchId = params.get('search') ?? ''

  const [title, setTitle] = useState('')
  const [skills, setSkills] = useState('')
  const [keywords, setKeywords] = useState('')

  const metaQuery = useQuery({ queryKey: ['talent', orgId, 'meta'], queryFn: () => getTalentMeta(token!, orgId), enabled: Boolean(token && orgId) })
  const searchesQuery = useQuery({ queryKey: ['talent', orgId, 'searches'], queryFn: () => getTalentSearches(token!, orgId), enabled: Boolean(token && orgId) })
  const searchQuery = useQuery({
    queryKey: ['talent', orgId, 'search', searchId],
    queryFn: () => getTalentSearch(token!, orgId, searchId),
    enabled: Boolean(token && orgId && searchId),
  })
  const run = useMutation({
    mutationFn: () => runTalentSearch(token!, orgId, { title: title.trim() || undefined, skills: splitTags(skills), keywords: splitTags(keywords) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['talent', orgId, 'search', data.search.id], data)
      void queryClient.invalidateQueries({ queryKey: ['talent', orgId, 'searches'] })
      setParams({ org: orgId, search: data.search.id }, { replace: true })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const openSearch = (search: TalentSearch) => setParams({ org: orgId, search: search.id }, { replace: true })

  if (isLoading) {
    return <ShellSkeleton label="조직 권한을 확인하는 중입니다" />
  }

  if (!membership) {
    return (
      <AppLayout>
        <EmptyState
          action={<Button to="/organizations">조직 둘러보기</Button>}
          description="인재 검색은 플랫폼 인증을 받은 기업 조직의 구성원만 사용할 수 있습니다. 기업 조직을 등록하거나 소속 기업의 승인을 받아 주세요."
          title="승인된 기업 조직이 필요합니다"
        />
      </AppLayout>
    )
  }

  const meta = metaQuery.data
  const current = searchQuery.data

  const orgMeta = ORG_TYPE_META[membership.organization.type]
  return (
    <ManagementAppShell
      nav={buildOrgNav(
        { orgId, orgType: membership.organization.type, role: membership.role, approved: true },
        { active: 'talent' },
      )}
      workspace={{
        name: membership.organization.name,
        caption: `${orgMeta.label} · ${ORG_ROLE_LABEL[membership.role]}`,
        icon: orgMeta.icon,
        homeTo: `/org/${orgId}`,
      }}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-strong">인재 검색</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-body">
              인재 검색에 동의한 사용자의 전체 공개 프로젝트와 공개를 허용한 기관 검증 기록만으로 후보를 찾습니다. 후보가 프로필에서 숨기거나 공개를 거둔 정보는 저장된 검색에서도 빠집니다.
              점수는 규칙으로 계산하고, AI는 추천 이유만 근거와 함께 설명합니다.
            </p>
          </div>
          {companies.length > 1 ? (
            <select
              aria-label="기업 선택"
              className="h-10 rounded-full border border-surface-border bg-white px-3 text-sm font-semibold"
              onChange={(e) => setParams({ org: e.target.value }, { replace: true })}
              value={orgId}
            >
              {companies.map((m) => (
                <option key={m.organization.id} value={m.organization.id}>
                  {m.organization.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>검색 조건</CardTitle>
              </CardHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!splitTags(skills).length) {
                    showToast('요구 기술을 1개 이상 입력하세요.', 'error')
                    return
                  }
                  run.mutate()
                }}
              >
                <label className="block text-sm font-semibold text-ink-strong">
                  검색 이름
                  <input className="mt-1.5 h-10 w-full rounded-xl border border-surface-border px-3 text-sm" maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="예: 프론트엔드 신입" value={title} />
                </label>
                <label className="block text-sm font-semibold text-ink-strong">
                  요구 기술 (쉼표로 구분)
                  <input className="mt-1.5 h-10 w-full rounded-xl border border-surface-border px-3 text-sm" onChange={(e) => setSkills(e.target.value)} placeholder="React, TypeScript" value={skills} />
                </label>
                <label className="block text-sm font-semibold text-ink-strong">
                  키워드 (선택)
                  <input className="mt-1.5 h-10 w-full rounded-xl border border-surface-border px-3 text-sm" onChange={(e) => setKeywords(e.target.value)} placeholder="대시보드, 헬스케어" value={keywords} />
                </label>
                <Button className="w-full gap-2" disabled={run.isPending} type="submit">
                  {run.isPending ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                  후보 찾기
                </Button>
              </form>
            </Card>

            {meta ? (
              <Card>
                <CardHeader>
                  <CardTitle>점수 기준</CardTitle>
                  <CardDescription>초기 가중치는 실험적 가정이며, 채용 피드백으로 보정할 예정입니다. ({meta.scoringVersion})</CardDescription>
                </CardHeader>
                <ul className="space-y-2.5 text-sm">
                  {PARTS.map((part) => (
                    <li key={part}>
                      <p className="flex items-center gap-2 font-semibold text-ink-strong">
                        <span className={cn('h-2.5 w-2.5 rounded-sm', PART_META[part].color)} />
                        {PART_META[part].label} {Math.round(meta.weights[part] * 100)}%
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-ink-muted">{meta.basis[part]}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>최근 검색</CardTitle>
              </CardHeader>
              {searchesQuery.data?.searches.length ? (
                <ul className="space-y-1">
                  {searchesQuery.data.searches.map((search) => (
                    <li key={search.id}>
                      <button
                        className={cn('w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface-muted', search.id === searchId && 'bg-brand-50')}
                        onClick={() => openSearch(search)}
                        type="button"
                      >
                        <span className="block font-semibold text-ink-strong">{search.title}</span>
                        <span className="text-xs text-ink-muted">
                          후보 {search.candidateCount}명 · {new Date(search.createdAt).toLocaleDateString('ko-KR')}
                          {search.createdBy ? ` · ${search.createdBy.name}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">아직 검색 기록이 없습니다.</p>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            {searchQuery.isLoading ? <LoadingState label="검색 결과를 불러오는 중입니다" /> : null}
            {current ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-ink-strong">{current.search.title}</h2>
                  {current.search.criteria.skills.map((skill) => (
                    <Badge key={skill} tone="blue">{skill}</Badge>
                  ))}
                  {current.search.criteria.keywords.map((keyword) => (
                    <Badge key={keyword}>{keyword}</Badge>
                  ))}
                  <span className="ml-auto text-sm text-ink-muted">후보 {current.search.candidateCount}명</span>
                </div>
                {current.results.length === 0 ? (
                  <EmptyState description="조건에 맞는 공개·검증 데이터를 가진 동의 후보가 없습니다. 기술 조건을 줄여 보세요." title="후보가 없습니다" />
                ) : (
                  current.results.map((result) => <ResultCard key={result.id} orgId={orgId} result={result} searchId={current.search.id} />)
                )}
              </>
            ) : !searchId ? (
              <EmptyState description="왼쪽에서 요구 기술을 입력하고 후보를 찾아보세요." title="검색을 시작하세요" />
            ) : null}
          </div>
        </div>
      </div>
    </ManagementAppShell>
  )
}
