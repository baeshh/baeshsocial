import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PROGRAM_STATUS_META, formatPeriod } from '../../lib/programs'
import { getParticipatingPrograms } from '../../services/programService'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'

export function MyParticipatingPrograms({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['programs', 'participating'],
    queryFn: () => getParticipatingPrograms(token),
  })
  const programs = query.data?.programs ?? []
  if (programs.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-bold text-ink-strong">참여 중인 프로그램</h2>
      <p className="mt-1 text-sm text-ink-muted">프로그램에 참여해도 운영 기관의 구성원이 되지는 않습니다. 팀 프로젝트와 활동 증빙은 각 프로그램에서 관리합니다.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {programs.map((program) => {
          const status = PROGRAM_STATUS_META[program.status]
          return (
            <Link key={program.id} to={`/org/${program.organization.id}/programs/${program.id}`}>
              <Card className="rounded-2xl p-4 transition hover:border-brand-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink-muted">{program.organization.name}</p>
                    <p className="mt-0.5 truncate font-bold text-ink-strong">{program.title}</p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {program.term ? `${program.term} · ` : ''}
                  {formatPeriod(program.startDate, program.endDate)}
                </p>
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
