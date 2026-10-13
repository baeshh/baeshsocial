import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { APPLICATION_STATUS_META, formatDateTime } from '../../lib/programs'
import { getMyProgramApplications } from '../../services/programService'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'

export function MyProgramApplications({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['programs', 'applications', 'me'],
    queryFn: () => getMyProgramApplications(token),
  })
  const applications = query.data?.applications ?? []
  if (applications.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-bold text-ink-strong">기관 프로그램 지원</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {applications.map((application) => {
          const meta = APPLICATION_STATUS_META[application.status]
          const link = application.program.isParticipant
            ? `/org/${application.program.organizationId}/programs/${application.program.id}`
            : `/programs/${application.program.id}`
          return (
            <Link key={application.id} to={link}>
              <Card className="rounded-2xl p-4 transition hover:border-brand-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink-muted">{application.program.organizationName}</p>
                    <p className="mt-0.5 truncate font-bold text-ink-strong">{application.program.title}</p>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-2 text-xs text-ink-muted">{formatDateTime(application.createdAt)} 지원</p>
                {application.status === 'rejected' && application.reviewNote ? (
                  <p className="mt-2 rounded-xl bg-surface-muted/70 px-3 py-2 text-sm text-ink-body">{application.reviewNote}</p>
                ) : null}
              </Card>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
