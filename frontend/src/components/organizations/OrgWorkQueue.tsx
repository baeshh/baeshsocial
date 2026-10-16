import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardCheck, Lock, Megaphone, UserPlus, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { takesApplications } from '../../lib/programs'
import { getOrganizationPrograms } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import type { OrganizationDashboard } from '../../types/organization'
import { Card } from '../common/Card'

const DAY = 24 * 60 * 60 * 1000

type QueueItem = { id: string; icon: ReactNode; title: string; detail: string; to: string; urgent: boolean }

function Tile({ label, value, caption, to }: { label: string; value: ReactNode; caption: string; to: string }) {
  return (
    <Link
      className="group rounded-2xl border border-surface-border bg-white p-4 transition hover:border-brand-200 hover:shadow-card sm:p-5"
      to={to}
    >
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className="mt-1.5 text-3xl font-bold tabular-nums text-ink-strong">{value}</p>
      <p className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-muted">
        {caption}
        <ArrowRight aria-hidden className="shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-brand-600" size={14} />
      </p>
    </Link>
  )
}

/** Operations home: what needs attention now, each item linking straight to the screen that handles it. */
export function OrgWorkQueue({ dashboard }: { dashboard: OrganizationDashboard }) {
  const token = useAuthStore((state) => state.token)
  const [now] = useState(() => Date.now())
  const { organization, stats, institution } = dashboard
  const orgPath = `/org/${organization.id}`

  const programsQuery = useQuery({
    queryKey: ['programs', 'org', organization.id],
    queryFn: () => getOrganizationPrograms(token!, organization.id),
    enabled: Boolean(token) && institution.scope === 'staff',
  })

  if (institution.scope !== 'staff') return null

  const recruiting = (programsQuery.data?.programs ?? [])
    .filter((program) => program.myAccess.isStaff && takesApplications(program.recruitment.mode) && program.recruitment.state === 'open')
    .sort((a, b) => (a.recruitment.applyEndAt ?? '9999').localeCompare(b.recruitment.applyEndAt ?? '9999'))

  const items: QueueItem[] = []
  if (stats.pendingRequests) {
    items.push({
      id: 'join-requests',
      icon: <UserPlus size={18} />,
      title: `가입 신청 ${stats.pendingRequests}건`,
      detail: '조직 구성원 가입을 승인하거나 거절하세요.',
      to: `${orgPath}?tab=members`,
      urgent: true,
    })
  }
  for (const program of institution.programs) {
    if (!program.pendingEvidence) continue
    items.push({
      id: `evidence-${program.id}`,
      icon: <ClipboardCheck size={18} />,
      title: `증빙 ${program.pendingEvidence}건 검토`,
      detail: program.title,
      to: `${orgPath}/programs/${program.id}?tab=review`,
      urgent: true,
    })
  }
  for (const program of recruiting) {
    const end = program.recruitment.applyEndAt ? new Date(program.recruitment.applyEndAt).getTime() : null
    const daysLeft = end === null ? null : Math.max(0, Math.ceil((end - now) / DAY))
    items.push({
      id: `recruiting-${program.id}`,
      icon: <Megaphone size={18} />,
      title: daysLeft === null ? '모집 중 · 상시' : daysLeft === 0 ? '오늘 모집 마감' : `모집 마감 D-${daysLeft}`,
      detail: `${program.title} · 지원자 확인`,
      to: `${orgPath}/programs/${program.id}?tab=applications`,
      urgent: daysLeft !== null && daysLeft <= 7,
    })
  }

  const singleReviewProgram = institution.programs.filter((program) => program.pendingEvidence).length === 1
    ? institution.programs.find((program) => program.pendingEvidence)
    : null

  return (
    <section aria-labelledby="org-work-queue" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          caption="제출된 증빙 기준"
          label="증빙 검토 대기"
          to={singleReviewProgram ? `${orgPath}/programs/${singleReviewProgram.id}?tab=review` : `${orgPath}?tab=programs`}
          value={institution.totals.pendingReview}
        />
        <Tile
          caption={stats.pendingRequests === null ? '관리자·담당자만 확인' : '승인 대기 중'}
          label="가입 신청"
          to={`${orgPath}?tab=members`}
          value={stats.pendingRequests === null ? <Lock aria-label="권한 없음" className="mt-1 text-ink-muted" size={24} /> : stats.pendingRequests}
        />
        <Tile
          caption={programsQuery.isLoading ? '불러오는 중' : '지원 받는 프로그램'}
          label="모집 중"
          to={`${orgPath}?tab=programs`}
          value={programsQuery.isLoading ? '–' : recruiting.length}
        />
        <Tile caption={`프로그램 ${institution.totals.programCount}개 합계`} label="참여자" to={`${orgPath}?tab=programs`} value={institution.totals.participantCount} />
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-surface-border px-5 py-4">
          <h2 className="text-base font-bold text-ink-strong" id="org-work-queue">
            처리할 작업
          </h2>
          <span className="text-xs text-ink-muted">{items.length ? `${items.length}건` : null}</span>
        </div>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-6 text-sm text-ink-muted">
            <Users aria-hidden size={16} />
            지금 처리할 작업이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {items.map((item) => (
              <li key={item.id}>
                <Link className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-surface-muted/60" to={item.to}>
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      item.urgent ? 'bg-warning-50 text-warning-700' : 'bg-brand-50 text-brand-600',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-strong">{item.title}</span>
                    <span className="block truncate text-xs text-ink-muted">{item.detail}</span>
                  </span>
                  <ArrowRight aria-hidden className="shrink-0 text-ink-muted" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}
