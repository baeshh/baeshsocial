import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../../components/common/Badge'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { Textarea } from '../../components/common/Input'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import {
  APPLICATION_STATUS_META,
  DELIVERY_MODE_LABEL,
  PROGRAM_STATUS_META,
  RECRUITMENT_STATE_META,
  formatDateTime,
  formatPeriod,
  recruitmentDeadlineHint,
} from '../../lib/programs'
import { applyToProgram, getDiscoverableProgram, withdrawProgramApplication } from '../../services/programService'
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

function ApplyCard({ program }: { program: DiscoverableProgram }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const { recruitment, myStatus } = program
  const application = myStatus.application
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['programs', 'discover'] })
    void queryClient.invalidateQueries({ queryKey: ['programs', 'applications', 'me'] })
  }

  const apply = useMutation({
    mutationFn: () => applyToProgram(token!, program.id, message),
    onSuccess: () => {
      showToast('지원서를 제출했습니다. 결과는 알림으로 알려드립니다.')
      setMessage('')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const withdraw = useMutation({
    mutationFn: () => withdrawProgramApplication(token!, program.id),
    onSuccess: () => {
      showToast('지원을 취소했습니다.', 'info')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const manageLink = `/org/${program.organization.id}/programs/${program.id}`
  let body: ReactNode
  if (myStatus.isManager) {
    body = (
      <>
        <p className="text-sm text-ink-body">이 프로그램의 담당자입니다.</p>
        <Button className="mt-3 w-full" to={`${manageLink}?tab=applications`}>
          지원자 관리
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
  } else if (application && application.status !== 'withdrawn') {
    const meta = APPLICATION_STATUS_META[application.status]
    body = (
      <>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <span className="text-xs text-ink-muted">{formatDateTime(application.createdAt)} 지원</span>
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
        {application.status === 'rejected' && application.reviewNote ? (
          <p className="mt-3 rounded-xl bg-surface-muted/70 px-3 py-2 text-sm text-ink-body">{application.reviewNote}</p>
        ) : null}
      </>
    )
  } else if (recruitment.state === 'open') {
    body = (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          apply.mutate()
        }}
      >
        <Textarea
          className="min-h-28"
          label="지원 동기 (선택)"
          maxLength={2000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="참여하고 싶은 이유나 관련 경험을 적어 주세요."
          value={message}
        />
        <p className="text-xs text-ink-muted">
          지원서와 프로필은 이 프로그램 담당자만 봅니다. 선발되면 {program.organization.name}의 구성원으로 등록됩니다.
        </p>
        <Button className="w-full" disabled={apply.isPending} type="submit">
          {apply.isPending ? '제출 중…' : '지원하기'}
        </Button>
      </form>
    )
  } else {
    const text = {
      upcoming: `모집이 ${formatDateTime(recruitment.applyStartAt)}에 시작됩니다.`,
      selected: '참여자 선발이 완료된 프로그램이라 별도 지원을 받지 않습니다.',
      closed: '모집이 마감되었습니다.',
      open: '',
    }[recruitment.state]
    body = <p className="text-sm text-ink-body">{text}</p>
  }

  return (
    <Card className="rounded-2xl p-5 lg:sticky lg:top-24">
      <p className="text-sm font-bold text-ink-strong">참여 신청</p>
      <div className="mt-3">{body}</div>
    </Card>
  )
}

export function ProgramPublicPage() {
  const { programId = '' } = useParams()
  const token = useAuthStore((s) => s.token)
  const programQuery = useQuery({
    queryKey: ['programs', 'discover', 'detail', programId],
    queryFn: () => getDiscoverableProgram(token!, programId),
    enabled: Boolean(token && programId),
  })

  if (!token) {
    return (
      <AppLayout>
        <Card className="rounded-2xl p-6 text-sm text-ink-body">
          프로그램 정보를 보려면{' '}
          <Link className="font-semibold text-brand-600 hover:underline" to="/auth/login">
            로그인
          </Link>
          해 주세요.
        </Card>
      </AppLayout>
    )
  }
  if (programQuery.isLoading) {
    return (
      <AppLayout>
        <LoadingState label="프로그램을 불러오는 중입니다" />
      </AppLayout>
    )
  }
  if (programQuery.isError || !programQuery.data) {
    return (
      <AppLayout>
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {(programQuery.error as Error | null)?.message ?? '프로그램을 찾을 수 없습니다.'}
        </p>
      </AppLayout>
    )
  }

  const program = programQuery.data.program
  const { recruitment } = program
  const state = RECRUITMENT_STATE_META[recruitment.state]
  const hint = recruitmentDeadlineHint(recruitment)

  return (
    <AppLayout>
      <div className="space-y-6">
        <Link className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-brand-600" to="/opportunities">
          <ArrowLeft size={16} /> 프로그램 목록
        </Link>
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
            <Building2 size={15} /> {program.organization.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-strong">{program.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={state.tone}>{state.label}</Badge>
            {hint ? <span className="text-sm font-semibold text-accent-600">{hint}</span> : null}
            <Badge tone={PROGRAM_STATUS_META[program.status].tone}>{PROGRAM_STATUS_META[program.status].label}</Badge>
            {program.visibility === 'organization' ? <Badge>조직 내부 공개</Badge> : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card className="rounded-2xl p-5">
              <dl className="divide-y divide-surface-border">
                <InfoRow label="모집 대상">{recruitment.targetAudience ?? '제한 없음'}</InfoRow>
                <InfoRow label="선발 인원">
                  {recruitment.capacity ? `${recruitment.capacity}명` : '미정'}
                  {recruitment.mode === 'selected' ? ` (선발 완료 · 참여 ${program.participantCount}명)` : ''}
                </InfoRow>
                {recruitment.mode === 'recruiting' ? (
                  <>
                    <InfoRow label="모집 기간">
                      {recruitment.applyStartAt ? formatDateTime(recruitment.applyStartAt) : '공개 즉시'} ~ {formatDateTime(recruitment.applyEndAt)}
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
              </dl>
            </Card>
            {program.description ? (
              <Card className="rounded-2xl p-5">
                <p className="text-sm font-bold text-ink-strong">프로그램 소개</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink-body">{program.description}</p>
              </Card>
            ) : null}
          </div>
          <ApplyCard program={program} />
        </div>
      </div>
    </AppLayout>
  )
}
