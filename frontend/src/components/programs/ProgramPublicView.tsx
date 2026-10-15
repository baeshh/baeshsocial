import { Building2, Link2 } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DELIVERY_MODE_LABEL,
  PROGRAM_BENEFIT_LABEL,
  PROGRAM_CATEGORY_LABEL,
  RECRUITMENT_STATE_META,
  formatAudiences,
  formatDateTime,
  formatGrades,
  formatPeriod,
  recruitmentDeadlineHint,
} from '../../lib/programs'
import type { DiscoverableProgram } from '../../types/program'
import { Badge } from '../common/Badge'
import { Card } from '../common/Card'

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2.5 text-sm">
      <dt className="font-medium text-ink-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink-strong">{children}</dd>
    </div>
  )
}

/**
 * `auto` follows the viewport like the real page; `mobile`/`desktop` pin one layout so the creation wizard can preview
 * both inside a narrower frame.
 */
export type ProgramViewLayout = 'auto' | 'mobile' | 'desktop'

const GRID_CLASS: Record<ProgramViewLayout, string> = {
  auto: 'lg:grid-cols-[1fr_320px]',
  mobile: '',
  desktop: 'grid-cols-[1fr_280px]',
}

/** The recruitment page applicants see. Shared by the public program page and the wizard preview. */
export function ProgramPublicView({
  program,
  layout = 'auto',
  heading: Heading = 'h1',
  apply,
  aside,
}: {
  program: DiscoverableProgram
  layout?: ProgramViewLayout
  heading?: 'h1' | 'h2'
  apply?: ReactNode
  aside: ReactNode
}) {
  const { recruitment } = program
  const state = RECRUITMENT_STATE_META[recruitment.state]
  const hint = recruitmentDeadlineHint(recruitment)
  const takesApplications = recruitment.mode === 'open' || recruitment.mode === 'mixed'
  const audience = formatAudiences(recruitment)
  const eligibility = recruitment.eligibility
  const grades = formatGrades(eligibility?.grades)

  return (
    <div className="space-y-6">
      {recruitment.coverImageUrl ? (
        <img alt="" className="aspect-[16/5] w-full rounded-2xl border border-surface-border object-cover" src={recruitment.coverImageUrl} />
      ) : null}
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
          <Building2 size={15} /> {program.organization.name}
        </p>
        <Heading className="mt-1 break-words text-2xl font-bold tracking-tight text-ink-strong">{program.title}</Heading>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {hint ? <span className="text-sm font-semibold text-accent-600">{hint}</span> : null}
          {recruitment.category ? <Badge tone="gray">{PROGRAM_CATEGORY_LABEL[recruitment.category]}</Badge> : null}
          {program.visibility === 'organization' ? <Badge>조직 내부 공개</Badge> : null}
          {program.visibility === 'unlisted' ? (
            <Badge>
              <Link2 className="mr-1 inline" size={12} />
              링크 공개
            </Badge>
          ) : null}
        </div>
      </div>

      <div className={`grid gap-6 ${GRID_CLASS[layout]}`}>
        <div className="min-w-0 space-y-6">
          <Card className="rounded-2xl p-5">
            <dl className="divide-y divide-surface-border">
              <InfoRow label="지원 대상">{audience ?? '제한 없음'}</InfoRow>
              {eligibility?.schools ? <InfoRow label="소속">{eligibility.schools}</InfoRow> : null}
              {grades ? <InfoRow label="학년">{grades}</InfoRow> : null}
              {eligibility?.majors ? <InfoRow label="전공·직무">{eligibility.majors}</InfoRow> : null}
              {eligibility?.regions ? <InfoRow label="지역">{eligibility.regions}</InfoRow> : null}
              {eligibility?.requirements ? <InfoRow label="자격 요건">{eligibility.requirements}</InfoRow> : null}
              <InfoRow label="모집 인원">
                {recruitment.capacity ? `${recruitment.capacity}명` : '미정'}
                {recruitment.mode === 'mixed' && recruitment.openSeats !== null ? ` (추가 모집 ${recruitment.openSeats}명)` : ''}
              </InfoRow>
              {takesApplications ? (
                <>
                  <InfoRow label="모집 기간">
                    {recruitment.applyStartAt ? formatDateTime(recruitment.applyStartAt) : '게시 즉시'} ~ {formatDateTime(recruitment.applyEndAt)}
                    {recruitment.closedEarlyAt ? ' (조기 마감)' : ''}
                  </InfoRow>
                  {recruitment.announceAt ? <InfoRow label="발표">{formatDateTime(recruitment.announceAt)}</InfoRow> : null}
                  {recruitment.selectionProcess ? <InfoRow label="선발 절차">{recruitment.selectionProcess}</InfoRow> : null}
                </>
              ) : null}
              <InfoRow label="운영 기간">
                {program.term ? `${program.term} · ` : ''}
                {formatPeriod(program.startDate, program.endDate)}
              </InfoRow>
              {recruitment.deliveryMode || recruitment.location ? (
                <InfoRow label="진행 방식">
                  {[recruitment.deliveryMode ? DELIVERY_MODE_LABEL[recruitment.deliveryMode] : null, recruitment.location].filter(Boolean).join(' · ')}
                </InfoRow>
              ) : null}
              {recruitment.benefits.length || recruitment.benefitsNote ? (
                <InfoRow label="참여 혜택">
                  {[recruitment.benefits.map((benefit) => PROGRAM_BENEFIT_LABEL[benefit]).join(', '), recruitment.benefitsNote]
                    .filter(Boolean)
                    .join('\n')}
                </InfoRow>
              ) : null}
            </dl>
          </Card>
          {program.description ? (
            <Card className="rounded-2xl p-5">
              <p className="text-sm font-bold text-ink-strong">프로그램 소개</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-body">{program.description}</p>
            </Card>
          ) : null}
          {apply ? (
            <Card className="scroll-mt-24 rounded-2xl p-5" id="apply">
              <p className="text-sm font-bold text-ink-strong">지원서</p>
              <div className="mt-4">{apply}</div>
            </Card>
          ) : null}
        </div>
        {aside}
      </div>
    </div>
  )
}
