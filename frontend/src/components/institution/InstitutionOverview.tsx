import { ArrowRight, ClipboardCheck, FolderKanban, GraduationCap, Layers, Send, ShieldCheck, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PROGRAM_STATUS_META, PROJECT_STATUS_LABEL, formatDate, percent } from '../../lib/programs'
import type { InstitutionDashboard } from '../../types/program'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'

type Props = {
  orgId: string
  institution: InstitutionDashboard
  programFilter: string | null
  onProgramFilterChange: (programId: string | null) => void
  onOpenPrograms: () => void
}

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-3xl font-bold text-ink-strong">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </Card>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold text-ink-strong">{value}%</span>
    </div>
  )
}

function Participation({ orgId, entries }: { orgId: string; entries: InstitutionDashboard['myParticipation'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>내 참여 프로그램</CardTitle>
        <CardDescription>기관이 운영하는 프로그램에서 배정받은 팀과 활동 증빙을 확인하세요.</CardDescription>
      </CardHeader>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">아직 참여 중인 프로그램이 없습니다. 담당자가 참여자로 등록하면 이곳에 표시됩니다.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {entries.map((entry) => (
            <li className="flex flex-wrap items-center gap-3 py-3" key={entry.programId}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-strong">
                  {entry.programTitle}
                  {entry.term ? <span className="ml-2 text-xs font-medium text-ink-muted">{entry.term}</span> : null}
                </p>
                <p className="text-xs text-ink-muted">
                  {entry.team
                    ? `${entry.team.teamName ?? entry.team.title} · ${entry.team.teamRole === 'leader' ? '팀장' : '팀원'}`
                    : '팀 배정 대기 중'}
                </p>
              </div>
              <Badge tone={PROGRAM_STATUS_META[entry.programStatus].tone}>{PROGRAM_STATUS_META[entry.programStatus].label}</Badge>
              {entry.team ? (
                <Button className="min-h-9 px-4" to={`/projects/${entry.team.id}?tab=evidence`} variant="secondary">
                  활동 증빙
                </Button>
              ) : (
                <Button className="min-h-9 px-4" to={`/org/${orgId}/programs/${entry.programId}`} variant="ghost">
                  프로그램 보기
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function InstitutionOverview({ orgId, institution, programFilter, onProgramFilterChange, onOpenPrograms }: Props) {
  if (institution.scope === 'participant') {
    return <Participation entries={institution.myParticipation} orgId={orgId} />
  }

  const { totals, programs, projects } = institution

  if (programs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>프로그램 운영 현황</CardTitle>
          <CardDescription>교육·캡스톤·사내 프로그램을 개설하면 프로젝트·참여자·증빙 현황이 이곳에 모입니다.</CardDescription>
        </CardHeader>
        <Button className="w-fit" onClick={onOpenPrograms}>
          첫 프로그램 만들기
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-ink-strong">프로그램 운영 현황</h2>
        <select
          aria-label="프로그램 필터"
          className="h-10 rounded-full border border-surface-border bg-white px-4 text-sm font-semibold text-ink-strong"
          onChange={(event) => onProgramFilterChange(event.target.value || null)}
          value={programFilter ?? ''}
        >
          <option value="">전체 프로그램 ({programs.length})</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.title}
              {program.term ? ` · ${program.term}` : ''}
            </option>
          ))}
        </select>
        {!institution.isOrgAdmin ? <span className="text-xs text-ink-muted">담당 프로그램만 표시됩니다.</span> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Layers size={14} />} label="프로그램" value={totals.programCount} />
        <Kpi icon={<FolderKanban size={14} />} label="프로젝트" value={totals.projectCount} hint={`평균 진행률 ${percent(totals.averageProgress)}`} />
        <Kpi icon={<GraduationCap size={14} />} label="참여자" value={totals.participantCount} />
        <Kpi icon={<ClipboardCheck size={14} />} label="검토 대기" value={totals.pendingReview} hint="제출된 증빙" />
        <Kpi
          icon={<Send size={14} />}
          label="증빙 제출률"
          value={percent(totals.submissionRate)}
          hint={`${totals.submittedParticipants} / ${totals.participantCount}명 제출`}
        />
        <Kpi
          icon={<ShieldCheck size={14} />}
          label="승인률"
          value={percent(totals.approvalRate)}
          hint={`승인 ${totals.evidence.approved} · 반려 ${totals.evidence.rejected}`}
        />
        <Kpi icon={<TrendingUp size={14} />} label="승인된 증빙" value={totals.evidence.approved} hint="검증 기록으로 발급" />
        <Kpi icon={<ClipboardCheck size={14} />} label="전체 제출" value={totals.evidence.submitted + totals.evidence.approved + totals.evidence.rejected} />
      </div>

      {!programFilter ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-surface-border px-6 py-4">
            <CardTitle className="text-lg">프로그램별 현황</CardTitle>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-muted/60 text-left text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-6 py-3">프로그램</th>
                  <th className="px-3 py-3">상태</th>
                  <th className="px-3 py-3 text-right">프로젝트</th>
                  <th className="px-3 py-3 text-right">참여자</th>
                  <th className="px-3 py-3 text-right">검토 대기</th>
                  <th className="px-3 py-3 text-right">제출률</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {programs.map((program) => (
                  <tr key={program.id}>
                    <td className="px-6 py-3">
                      <p className="font-semibold text-ink-strong">{program.title}</p>
                      <p className="text-xs text-ink-muted">{program.term ?? formatDate(program.startDate)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={PROGRAM_STATUS_META[program.status].tone}>{PROGRAM_STATUS_META[program.status].label}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right">{program.projectCount}</td>
                    <td className="px-3 py-3 text-right">{program.participantCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-accent-600">{program.pendingEvidence}</td>
                    <td className="px-3 py-3 text-right">{percent(program.submissionRate)}</td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                        to={`/org/${orgId}/programs/${program.id}`}
                      >
                        관리 <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-6 py-4">
          <CardTitle className="text-lg">프로젝트별 진행 현황</CardTitle>
          {programFilter ? (
            <Link className="text-xs font-semibold text-brand-600 hover:underline" to={`/org/${orgId}/programs/${programFilter}`}>
              프로그램 관리로 이동
            </Link>
          ) : null}
        </div>
        {projects.length === 0 ? (
          <p className="px-6 py-6 text-sm text-ink-muted">아직 프로젝트가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-surface-muted/60 text-left text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-6 py-3">팀 · 프로젝트</th>
                  {!programFilter ? <th className="px-3 py-3">프로그램</th> : null}
                  <th className="px-3 py-3 text-right">팀원</th>
                  <th className="px-3 py-3">진행률</th>
                  <th className="px-3 py-3 text-right">태스크</th>
                  <th className="px-3 py-3 text-right">대기 / 승인 / 반려</th>
                  <th className="px-6 py-3">최근 제출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-6 py-3">
                      <Link className="font-semibold text-ink-strong hover:text-brand-600" to={`/projects/${project.id}?tab=evidence`}>
                        {project.teamName ? `${project.teamName} · ` : ''}
                        {project.title}
                      </Link>
                      <p className="text-xs text-ink-muted">{PROJECT_STATUS_LABEL[project.status]}</p>
                    </td>
                    {!programFilter ? <td className="px-3 py-3 text-xs text-ink-body">{project.programTitle}</td> : null}
                    <td className="px-3 py-3 text-right">{project.memberCount}</td>
                    <td className="px-3 py-3">
                      <ProgressBar value={project.progress} />
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      {project.tasks.done} / {project.tasks.total}
                    </td>
                    <td className="px-3 py-3 text-right text-xs">
                      <span className="font-semibold text-accent-600">{project.evidence.submitted}</span>
                      {' / '}
                      <span className="font-semibold text-emerald-700">{project.evidence.approved}</span>
                      {' / '}
                      <span className="font-semibold text-red-600">{project.evidence.rejected}</span>
                    </td>
                    <td className="px-6 py-3 text-xs text-ink-muted">{formatDate(project.lastSubmittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {institution.myParticipation.length > 0 ? <Participation entries={institution.myParticipation} orgId={orgId} /> : null}
    </div>
  )
}
