import { Building2, CalendarDays, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDiscoverPrograms } from '../../hooks/useDiscoverPrograms'
import { APPLICATION_STATUS_META, RECRUITMENT_STATE_META, formatDateTime, formatPeriod, recruitmentDeadlineHint } from '../../lib/programs'
import type { DiscoverableProgram } from '../../types/program'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'
import { Pagination } from '../common/Pagination'

function ProgramDiscoverCard({ program }: { program: DiscoverableProgram }) {
  const { recruitment, myStatus } = program
  const state = RECRUITMENT_STATE_META[recruitment.state]
  const hint = recruitmentDeadlineHint(recruitment)
  const application = myStatus.application && myStatus.application.status !== 'withdrawn' ? myStatus.application : null
  return (
    <Link to={`/programs/${program.id}`}>
      <Card className="flex h-full flex-col rounded-2xl p-5 transition hover:border-brand-200 hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-ink-muted">
            <Building2 size={13} /> {program.organization.name}
          </p>
          <div className="flex shrink-0 gap-1">
            {myStatus.isParticipant ? <Badge tone="green">참여 중</Badge> : null}
            {!myStatus.isParticipant && application ? (
              <Badge tone={APPLICATION_STATUS_META[application.status].tone}>{APPLICATION_STATUS_META[application.status].label}</Badge>
            ) : null}
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-base font-bold text-ink-strong">{program.title}</p>
        {recruitment.targetAudience ? <p className="mt-1 line-clamp-1 text-sm text-ink-body">대상 · {recruitment.targetAudience}</p> : null}
        <div className="mt-auto space-y-1 pt-4 text-xs text-ink-muted">
          {recruitment.mode === 'recruiting' ? (
            <p className="flex items-center gap-1">
              <CalendarDays size={12} /> 모집 ~ {formatDateTime(recruitment.applyEndAt)}
              {hint ? <span className="ml-1 font-semibold text-accent-600">{hint}</span> : null}
            </p>
          ) : (
            <p className="flex items-center gap-1">
              <CalendarDays size={12} /> 운영 {formatPeriod(program.startDate, program.endDate)}
            </p>
          )}
          {recruitment.capacity ? (
            <p className="flex items-center gap-1">
              <Users size={12} /> 선발 {recruitment.capacity}명
            </p>
          ) : null}
        </div>
      </Card>
    </Link>
  )
}

export function InstitutionProgramsSection({ token, page, onPageChange }: { token: string; page: number; onPageChange: (page: number) => void }) {
  const query = useDiscoverPrograms(token, page)
  const data = query.data
  if (!data || data.total === 0) return null

  return (
    <section className="scroll-mt-40 space-y-3" id="institution-programs">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-surface-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-ink-strong">기관 프로그램</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            인증된 기관이 BAESH에서 직접 운영하는 프로그램입니다.{data.openCount ? ` 지금 ${data.openCount}개 모집 중` : ''}
          </p>
        </div>
        <p className="text-xs text-ink-muted">
          {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} / {data.total}개
        </p>
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
        {data.programs.map((program) => (
          <ProgramDiscoverCard key={program.id} program={program} />
        ))}
      </div>
      <Pagination
        disabled={query.isPlaceholderData}
        onPageChange={(next) => {
          onPageChange(next)
          document.getElementById('institution-programs')?.scrollIntoView({ behavior: 'smooth' })
        }}
        page={data.page}
        totalPages={data.totalPages}
      />
    </section>
  )
}
