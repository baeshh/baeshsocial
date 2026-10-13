import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, FolderKanban, GraduationCap, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasOrgRole } from '../../lib/organizations'
import { PROGRAM_STATUS_META, PROGRAM_VISIBILITY_META, RECRUITMENT_STATE_META, formatPeriod } from '../../lib/programs'
import { useManagerCandidates } from '../../hooks/useManagerCandidates'
import { createProgram, getOrganizationPrograms } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Organization, OrganizationRole } from '../../types/organization'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'
import { emptyProgramForm, toProgramPayload } from '../../lib/programForm'
import { ProgramFormFields } from './ProgramFormFields'

type Props = { organization: Organization; myRole: OrganizationRole }

export function OrgProgramsPanel({ organization, myRole }: Props) {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyProgramForm)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = organization.verificationStatus === 'approved' && hasOrgRole(myRole, 'admin')
  const managerCandidates = useManagerCandidates(organization.id, createOpen && isAdmin)

  const programsQuery = useQuery({
    queryKey: ['programs', 'org', organization.id],
    queryFn: () => getOrganizationPrograms(token!, organization.id),
    enabled: Boolean(token),
  })

  const create = useMutation({
    mutationFn: () =>
      createProgram(token!, organization.id, {
        ...toProgramPayload(form),
        managerUserIds: isAdmin ? form.managerUserIds : [],
      }),
    onSuccess: ({ program }) => {
      showToast('프로그램을 만들었습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations', organization.id, 'dashboard'] })
      setCreateOpen(false)
      setForm(emptyProgramForm())
      navigate(`/org/${organization.id}/programs/${program.id}`)
    },
    onError: (err: Error) => setError(err.message),
  })

  if (programsQuery.isLoading) return <LoadingState />
  if (programsQuery.isError || !programsQuery.data) {
    return <p className="text-sm text-red-700">{(programsQuery.error as Error | null)?.message}</p>
  }

  const { programs, canCreate } = programsQuery.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {canCreate
            ? '프로그램 안에서 팀 프로젝트를 만들고, 학생을 배정하고, 활동 증빙을 검토합니다.'
            : organization.verificationStatus !== 'approved'
              ? '조직 인증이 승인되면 프로그램을 개설할 수 있습니다.'
              : '참여 중인 프로그램과 조직에 공개된 프로그램이 표시됩니다.'}
        </p>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1" size={16} /> 프로그램 만들기
          </Button>
        ) : null}
      </div>

      {programs.length === 0 ? (
        <EmptyState
          description={canCreate ? '예: 2026 AI 캡스톤, SW 창업 캠프처럼 운영 단위를 먼저 만들어 주세요.' : '담당자가 프로그램에 등록하면 이곳에 표시됩니다.'}
          title="아직 프로그램이 없습니다"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {programs.map((program) => {
            const status = PROGRAM_STATUS_META[program.status]
            const member = program.myAccess.isStaff || program.myAccess.isParticipant
            return (
              <Card className="flex flex-col rounded-2xl p-5" key={program.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-ink-strong">{program.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                      <CalendarDays size={12} />
                      {program.term ? `${program.term} · ` : ''}
                      {formatPeriod(program.startDate, program.endDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge tone={RECRUITMENT_STATE_META[program.recruitment.state].tone}>
                      {RECRUITMENT_STATE_META[program.recruitment.state].label}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  {PROGRAM_VISIBILITY_META[program.visibility].label}
                  {program.recruitment.targetAudience ? ` · 대상 ${program.recruitment.targetAudience}` : ''}
                  {program.recruitment.capacity ? ` · 선발 ${program.recruitment.capacity}명` : ''}
                </p>
                {member ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink-body">
                      <span className="flex items-center gap-1">
                        <FolderKanban size={14} /> 프로젝트 {program.projectCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <GraduationCap size={14} /> 학생 {program.participantCount}
                      </span>
                      {program.pendingEvidence ? (
                        <span className="font-semibold text-accent-600">검토 대기 {program.pendingEvidence}</span>
                      ) : null}
                    </div>
                    <p className="mt-2 truncate text-xs text-ink-muted">
                      담당 {program.managers.length ? program.managers.map((m) => m.name).join(', ') : '미지정'}
                    </p>
                  </>
                ) : program.description ? (
                  <p className="mt-3 line-clamp-2 text-sm text-ink-body">{program.description}</p>
                ) : null}
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <Button
                    className="min-h-9 px-4"
                    to={member ? `/org/${organization.id}/programs/${program.id}` : `/programs/${program.id}`}
                    variant="secondary"
                  >
                    {program.myAccess.isStaff ? '관리하기' : member ? '보기' : program.recruitment.state === 'open' ? '지원하기' : '자세히 보기'}
                  </Button>
                  {program.myAccess.isParticipant ? <Badge tone="blue">참여 중</Badge> : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        description="프로그램은 기관이 운영하는 프로젝트 묶음입니다. 개인 프로젝트에는 영향을 주지 않습니다."
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        title="프로그램 만들기"
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            create.mutate()
          }}
        >
          <ProgramFormFields
            canEditManagers={isAdmin}
            managerCandidates={managerCandidates}
            onChange={setForm}
            value={form}
          />
          {!isAdmin ? <p className="text-xs text-ink-muted">만든 사람은 자동으로 이 프로그램의 담당자가 됩니다.</p> : null}
          {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={create.isPending} type="submit">
              {create.isPending ? '만드는 중…' : '만들기'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
