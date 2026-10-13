import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, Link2 } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { BaeshLogo } from '../../components/common/BaeshLogo'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { ProgramApplicationForm } from '../../components/programs/ProgramApplicationForm'
import {
  APPLICATION_STATUS_META,
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
import { getDiscoverableProgram, withdrawProgramApplication } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { DiscoverableProgram } from '../../types/program'

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-2.5 text-sm">
      <dt className="font-medium text-ink-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink-strong">{children}</dd>
    </div>
  )
}

function Shell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  if (signedIn) return <AppLayout>{children}</AppLayout>
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
  return (
    <div className="min-h-screen bg-surface-canvas">
      <header className="border-b border-surface-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <BaeshLogo imageClassName="h-8 w-8" to="/" />
          <div className="flex gap-2">
            <Button className="rounded-full text-sm" to={`/auth/login?next=${next}`} variant="ghost">
              로그인
            </Button>
            <Button className="rounded-full text-sm" to={`/auth/register?next=${next}`}>
              회원가입
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  )
}

/** Whether the viewer may fill in (or keep editing) the application form right now. */
function canEditApplication(program: DiscoverableProgram) {
  const { recruitment, myStatus } = program
  if (myStatus.isManager || myStatus.isParticipant) return false
  if (recruitment.state !== 'open' && recruitment.state !== 'scheduled') return false
  const status = myStatus.application?.status
  return !status || status === 'draft' || status === 'withdrawn'
}

function StatusCard({ program, signedIn, onChanged }: { program: DiscoverableProgram; signedIn: boolean; onChanged: () => void }) {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()
  const { recruitment, myStatus } = program
  const application = myStatus.application
  const withdraw = useMutation({
    mutationFn: () => withdrawProgramApplication(token!, program.id),
    onSuccess: () => {
      showToast(application?.status === 'draft' ? '임시저장한 지원서를 삭제했습니다.' : '지원을 취소했습니다.', 'info')
      onChanged()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const manageLink = `/org/${program.organization.id}/programs/${program.id}`
  const takesApplications = recruitment.mode === 'open' || recruitment.mode === 'mixed'
  let body: ReactNode

  if (myStatus.isManager) {
    body = (
      <>
        <p className="text-sm text-ink-body">이 프로그램의 담당자입니다.</p>
        <Button className="mt-3 w-full" to={takesApplications ? `${manageLink}?tab=applications` : manageLink}>
          {takesApplications ? '지원자 관리' : '프로그램 관리'}
        </Button>
      </>
    )
  } else if (myStatus.isParticipant) {
    body = (
      <>
        <Badge tone="green">참여 중</Badge>
        <Button className="mt-3 w-full" to={manageLink}>
          프로그램으로 이동
        </Button>
      </>
    )
  } else if (application && application.status !== 'withdrawn' && application.status !== 'draft') {
    const meta = APPLICATION_STATUS_META[application.status]
    body = (
      <>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="text-xs text-ink-muted">{formatDateTime(application.submittedAt ?? application.createdAt)} 제출</span>
        </div>
        {application.status === 'pending' ? (
          <>
            <p className="mt-3 text-sm text-ink-body">
              담당자가 지원서를 검토하고 있습니다.
              {recruitment.announceAt ? ` 발표 예정: ${formatDateTime(recruitment.announceAt)}` : ''}
            </p>
            <Button className="mt-3 w-full" disabled={withdraw.isPending} onClick={() => withdraw.mutate()} variant="secondary">
              지원 취소
            </Button>
          </>
        ) : null}
        {application.status === 'accepted' ? <p className="mt-3 text-sm text-ink-body">선발되었습니다. 참여자로 등록됩니다.</p> : null}
        {application.status === 'rejected' && application.reviewNote ? (
          <p className="mt-3 rounded-xl bg-surface-muted/70 px-3 py-2 text-sm text-ink-body">{application.reviewNote}</p>
        ) : null}
      </>
    )
  } else if (recruitment.state === 'open' || recruitment.state === 'scheduled') {
    const scheduled = recruitment.state === 'scheduled'
    body = (
      <>
        <p className="text-sm text-ink-body">
          {scheduled
            ? `모집이 ${formatDateTime(recruitment.applyStartAt)}에 시작됩니다. 지원서는 미리 임시저장해 둘 수 있습니다.`
            : recruitment.applyEndAt
              ? `${formatDateTime(recruitment.applyEndAt)}까지 지원할 수 있습니다.`
              : '지금 지원할 수 있습니다.'}
        </p>
        {signedIn ? (
          <>
            <Button className="mt-3 w-full" onClick={() => document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })}>
              {application?.status === 'draft' ? '이어서 작성하기' : '지원서 작성하기'}
            </Button>
            {application?.status === 'draft' ? (
              <button
                className="mt-2 w-full text-center text-xs font-medium text-ink-muted hover:text-red-600"
                disabled={withdraw.isPending}
                onClick={() => {
                  if (window.confirm('임시저장한 지원서와 첨부파일을 삭제할까요?')) withdraw.mutate()
                }}
                type="button"
              >
                임시저장 지원서 삭제
              </button>
            ) : null}
          </>
        ) : (
          <Button className="mt-3 w-full" to={`/auth/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}>
            로그인하고 지원하기
          </Button>
        )}
      </>
    )
  } else {
    const text: Partial<Record<typeof recruitment.state, string>> = {
      closed: '모집이 마감되었습니다.',
      selected: '참여자 선발이 완료되었습니다.',
      invite_only: '초대받은 사람만 참여할 수 있는 프로그램입니다.',
      draft: '아직 게시되지 않은 프로그램입니다.',
    }
    body = (
      <>
        <p className="text-sm text-ink-body">
          {recruitment.mode === 'preselected' ? '참여자가 이미 선발된 프로그램이라 별도 지원을 받지 않습니다.' : text[recruitment.state]}
        </p>
        {takesApplications ? (
          <Button className="mt-3 w-full" disabled variant="secondary">
            모집 마감
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <Card className="self-start rounded-2xl p-5 lg:sticky lg:top-24">
      <p className="text-sm font-bold text-ink-strong">참여 신청</p>
      <div className="mt-3">{body}</div>
    </Card>
  )
}

export function ProgramPublicPage() {
  const { programId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const shareToken = searchParams.get('t')
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const signedIn = Boolean(token)
  const programQuery = useQuery({
    queryKey: ['programs', 'discover', 'detail', programId, shareToken, signedIn],
    queryFn: () => getDiscoverableProgram(token, programId, shareToken),
    enabled: Boolean(programId),
    retry: false,
  })
  const program = programQuery.data?.program
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['programs', 'discover'] })
  const { hash } = useLocation()
  const loaded = Boolean(program)

  useEffect(() => {
    if (program) document.title = `${program.title} · ${program.organization.name} · BAESH`
    return () => {
      document.title = 'BAESH'
    }
  }, [program])

  useEffect(() => {
    if (loaded && hash === '#apply') document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' })
  }, [loaded, hash])

  if (programQuery.isLoading) {
    return (
      <Shell signedIn={signedIn}>
        <LoadingState label="프로그램을 불러오는 중입니다" />
      </Shell>
    )
  }
  if (programQuery.isError || !program) {
    return (
      <Shell signedIn={signedIn}>
        <Card className="rounded-2xl p-6 text-center">
          <p className="text-lg font-semibold text-ink-strong">프로그램을 찾을 수 없습니다</p>
          <p className="mt-2 text-sm text-ink-muted">
            비공개 프로그램이거나 링크가 만료되었을 수 있습니다.{signedIn ? '' : ' 기관 구성원이라면 로그인해 주세요.'}
          </p>
        </Card>
      </Shell>
    )
  }

  const { recruitment } = program
  const state = RECRUITMENT_STATE_META[recruitment.state]
  const hint = recruitmentDeadlineHint(recruitment)
  const takesApplications = recruitment.mode === 'open' || recruitment.mode === 'mixed'
  const audience = formatAudiences(recruitment)
  const eligibility = recruitment.eligibility
  const grades = formatGrades(eligibility?.grades)
  const showForm = signedIn && canEditApplication(program)

  return (
    <Shell signedIn={signedIn}>
      <div className="space-y-6">
        {signedIn ? (
          <Link className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-600" to="/opportunities">
            <ArrowLeft size={16} /> 프로그램 목록
          </Link>
        ) : null}
        {recruitment.coverImageUrl ? (
          <img alt="" className="aspect-[16/5] w-full rounded-2xl border border-surface-border object-cover" src={recruitment.coverImageUrl} />
        ) : null}
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
            <Building2 size={15} /> {program.organization.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong">{program.title}</h1>
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

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card className="rounded-2xl p-5">
              <dl className="divide-y divide-surface-border">
                <InfoRow label="지원 대상">{audience ?? '제한 없음'}</InfoRow>
                {eligibility?.schools ? <InfoRow label="학교">{eligibility.schools}</InfoRow> : null}
                {grades ? <InfoRow label="학년">{grades}</InfoRow> : null}
                {eligibility?.majors ? <InfoRow label="전공">{eligibility.majors}</InfoRow> : null}
                {eligibility?.regions ? <InfoRow label="거주 지역">{eligibility.regions}</InfoRow> : null}
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
            {showForm && token ? (
              <Card className="scroll-mt-24 rounded-2xl p-5" id="apply">
                <p className="text-sm font-bold text-ink-strong">지원서</p>
                <div className="mt-4">
                  <ProgramApplicationForm
                    key={program.id}
                    onChanged={refresh}
                    program={program}
                    shareToken={shareToken}
                    token={token}
                  />
                </div>
              </Card>
            ) : null}
          </div>
          <StatusCard onChanged={refresh} program={program} signedIn={signedIn} />
        </div>
      </div>
    </Shell>
  )
}
