import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/api'
import { deleteProject, getProjectDeletion, updateProject } from '../../../services/projectService'
import { showToast } from '../../../stores/toastStore'
import { Button } from '../../common/Button'
import { ProjectDeleteModal } from '../ProjectDeleteModal'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

function ArchiveButton({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, invalidate } = ctx
  const archive = useMutation({
    mutationFn: () => updateProject(token, project.id, { status: 'archived' }),
    onSuccess: () => {
      showToast('프로젝트를 보관했습니다.', 'success')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  if (project.status === 'ARCHIVED') return <p className="text-sm font-semibold text-ink-muted">보관된 프로젝트입니다.</p>
  return (
    <Button loading={archive.isPending} onClick={() => archive.mutate()} type="button" variant="secondary">
      <Archive aria-hidden size={16} />
      보관하기
    </Button>
  )
}

/**
 * Program projects and projects an institution has recorded are kept: the server refuses to delete them, so this
 * section explains why and offers archiving. Purely personal projects keep the delete action with its impact shown.
 */
export function ProjectRetentionSection({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, can } = ctx
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const canArchive = can('project.settings')
  const canDeleteRole = can('project.delete')

  const check = useQuery({
    queryKey: ['projects', project.id, 'deletion'],
    queryFn: () => getProjectDeletion(token, project.id),
    enabled: !project.program && canDeleteRole,
  })
  const remove = useMutation({
    mutationFn: ({ password, confirmTeamImpact }: { password: string; confirmTeamImpact: boolean }) =>
      deleteProject(token, project.id, password, confirmTeamImpact),
    onSuccess: () => {
      setDeleteOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      showToast('프로젝트를 삭제했습니다.', 'info')
      navigate('/projects')
    },
    onError: (error: Error) => {
      setDeleteError(error.message)
      if (error instanceof ApiError && error.status === 409) void check.refetch()
    },
  })

  if (project.program) {
    return (
      <ProjectSection
        description={`${project.program.organization.name} · ${project.program.title}의 공식 운영 기록입니다.`}
        title="기록 보존"
      >
        <p className="flex gap-2 text-sm leading-6 text-ink-body">
          <ShieldCheck aria-hidden className="mt-1 shrink-0 text-success-700" size={16} />
          <span>
            기관 프로그램 프로젝트는 팀원도 기관 담당자도 영구 삭제할 수 없습니다. 팀 구성, 작업·활동 기록, 제출된 증빙과 기관 검증 기록이 기관의 공식 기록으로 보존됩니다.
            {canArchive ? ' 더 이상 진행하지 않으면 보관하세요. 보관한 프로젝트는 목록의 ‘보관’에서 계속 볼 수 있습니다.' : ''}
          </span>
        </p>
        {canArchive ? (
          <div className="mt-3">
            <ArchiveButton ctx={ctx} />
          </div>
        ) : null}
      </ProjectSection>
    )
  }

  if (!canDeleteRole) return null
  const data = check.data
  const blocked = Boolean(data && data.blockers.length > 0)

  return (
    <ProjectSection
      className={blocked ? undefined : 'border-danger-100 bg-danger-50/40'}
      description={blocked ? '기관이 기록한 내용이 있어 이 프로젝트는 삭제할 수 없습니다.' : '프로젝트와 프로젝트에 남긴 모든 기록을 영구 삭제합니다. 복구할 수 없습니다.'}
      title={blocked ? '기록 보존' : '프로젝트 삭제'}
    >
      {check.isPending ? <p className="text-sm text-ink-muted">삭제 가능 여부를 확인하는 중…</p> : null}
      {check.isError ? <p className="text-sm text-danger-700" role="alert">{check.error.message}</p> : null}
      {data && blocked ? (
        <>
          <ul className="space-y-1.5 text-sm leading-6 text-ink-body">
            {data.blockers.map((blocker) => (
              <li className="flex gap-2" key={blocker.code}>
                <ShieldCheck aria-hidden className="mt-1 shrink-0 text-success-700" size={16} />
                {blocker.message}
              </li>
            ))}
          </ul>
          {canArchive ? (
            <div className="mt-3">
              <ArchiveButton ctx={ctx} />
            </div>
          ) : null}
        </>
      ) : null}
      {data && !blocked ? (
        <>
          <p className="text-sm leading-6 text-ink-body">
            작업 {data.impact.tasks}개, 활동 {data.impact.activities}개, 파일 {data.impact.files}개, 외부 링크 {data.impact.links}개가 함께 삭제됩니다.
            {data.impact.otherMembers > 0 ? ` 다른 팀원 ${data.impact.otherMembers}명도 이 프로젝트를 잃습니다. 보관하면 모두의 기록이 그대로 남습니다.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canArchive ? <ArchiveButton ctx={ctx} /> : null}
            <Button
              onClick={() => {
                setDeleteError(null)
                setDeleteOpen(true)
              }}
              type="button"
              variant="danger"
            >
              <Trash2 aria-hidden size={16} />
              프로젝트 삭제
            </Button>
          </div>
        </>
      ) : null}
      <ProjectDeleteModal
        error={deleteError}
        isPending={remove.isPending}
        onClose={() => {
          setDeleteOpen(false)
          setDeleteError(null)
        }}
        onConfirm={(password, confirmTeamImpact) => remove.mutate({ password, confirmTeamImpact })}
        open={deleteOpen}
        otherMembers={data?.impact.otherMembers ?? 0}
        projectTitle={project.title}
      />
    </ProjectSection>
  )
}
