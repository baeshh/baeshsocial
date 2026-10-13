import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { APPLICATION_STATUS_META, formatDateTime } from '../../lib/programs'
import { getMyProgramApplications } from '../../services/programService'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'
import { OfferResponse } from './OfferResponse'

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
            <Card className="rounded-2xl p-4 transition hover:border-brand-200" key={application.id}>
              <Link className="flex items-start justify-between gap-2" to={link}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink-muted">{application.program.organizationName}</p>
                  <p className="mt-0.5 truncate font-bold text-ink-strong hover:text-brand-600">{application.program.title}</p>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </Link>
              {application.status === 'draft' ? (
                <p className="mt-2 text-xs font-medium text-accent-600">
                  작성 중 · {formatDateTime(application.updatedAt)} 저장
                  {application.program.applyEndAt ? ` · ${formatDateTime(application.program.applyEndAt)}까지 제출` : ''}
                </p>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">{formatDateTime(application.submittedAt ?? application.createdAt)} 제출</p>
              )}
              {application.status === 'rejected' && application.reviewNote ? (
                <p className="mt-2 rounded-xl bg-surface-muted/70 px-3 py-2 text-sm text-ink-body">{application.reviewNote}</p>
              ) : null}
              <OfferResponse application={application} programId={application.program.id} programTitle={application.program.title} />
            </Card>
          )
        })}
      </div>
    </section>
  )
}
