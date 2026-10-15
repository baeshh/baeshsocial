import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../../lib/cn'
import { VISIBILITY_META } from '../../../lib/programs'
import { PROJECT_STATUS_META, PROJECT_STATUSES } from '../../../lib/projectDisplay'
import { emptyToNull, splitTags } from '../../../lib/projectForm'
import { updateProject, updateProjectVisibility, type ProjectPayload } from '../../../services/projectService'
import { showToast } from '../../../stores/toastStore'
import type { Project } from '../../../types/project'
import { Button } from '../../common/Button'
import { Input, Select, Textarea } from '../../common/Input'
import { ProjectRolesPanel } from '../ProjectRolesPanel'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

type Visibility = keyof typeof VISIBILITY_META

const infoFrom = (project: Project) => ({
  title: project.title,
  description: project.description ?? '',
  objective: project.objective ?? '',
  readme: project.readme ?? '',
  skills: project.skills.join(', '),
})

function BasicInfoForm({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, invalidate } = ctx
  const [form, setForm] = useState(() => infoFrom(project))
  const save = useMutation({
    mutationFn: () =>
      updateProject(token, project.id, {
        title: form.title,
        description: emptyToNull(form.description),
        objective: emptyToNull(form.objective),
        readme: emptyToNull(form.readme),
        skills: splitTags(form.skills),
      }),
    onSuccess: () => {
      showToast('기본 정보를 저장했습니다.', 'success')
      invalidate()
    },
  })

  return (
    <ProjectSection title="기본 정보">
      <form
        aria-label="기본 정보"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Input label="프로젝트명" maxLength={160} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required value={form.title} />
        <Textarea className="min-h-20" label="한 줄 설명" maxLength={1200} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={2} value={form.description} />
        <Textarea className="min-h-20" label="목표" maxLength={1200} onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))} rows={2} value={form.objective} />
        <Input helperText="쉼표로 구분합니다." label="기술스택" onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))} value={form.skills} />
        <Textarea label="README" maxLength={8000} onChange={(event) => setForm((prev) => ({ ...prev, readme: event.target.value }))} rows={4} value={form.readme} />
        {save.error ? (
          <p className="text-sm font-medium text-danger-700" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <Button loading={save.isPending} type="submit">
          기본 정보 저장
        </Button>
      </form>
    </ProjectSection>
  )
}

function ProgressForm({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, invalidate } = ctx
  const [form, setForm] = useState({ progress: project.progress, status: project.status })
  const save = useMutation({
    mutationFn: () =>
      updateProject(token, project.id, {
        progress: form.progress,
        status: form.status.toLowerCase() as ProjectPayload['status'],
      }),
    onSuccess: () => {
      showToast('진행 상태를 저장했습니다.', 'success')
      invalidate()
    },
  })

  return (
    <ProjectSection description="진행률은 작업 완료 수로 자동 계산되지 않습니다. 팀이 판단한 진행 정도를 직접 입력하세요." title="진행 상태">
      <form
        aria-label="진행 상태"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Select label="단계" onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Project['status'] }))} value={form.status}>
          {PROJECT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PROJECT_STATUS_META[status].label}
            </option>
          ))}
        </Select>
        <Input
          label="진행률 (%)"
          max={100}
          min={0}
          onChange={(event) => setForm((prev) => ({ ...prev, progress: Number(event.target.value) }))}
          required
          type="number"
          value={form.progress}
        />
        {save.error ? (
          <p className="text-sm font-medium text-danger-700 sm:col-span-2" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button loading={save.isPending} type="submit">
            진행 상태 저장
          </Button>
        </div>
      </form>
    </ProjectSection>
  )
}

function VisibilitySection({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, token, invalidate } = ctx
  const change = useMutation({
    mutationFn: (visibility: Visibility) => updateProjectVisibility(token, project.id, visibility),
    onSuccess: () => {
      showToast('공개 범위를 변경했습니다.')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <ProjectSection description="프로젝트 내용의 공개 범위입니다. 인증 기록의 프로필 공개 범위는 프로필의 기록별 설정에서 따로 정합니다." title="공개 범위">
      <div aria-label="공개 범위" className="grid gap-2 sm:grid-cols-3" role="group">
        {(Object.keys(VISIBILITY_META) as Visibility[]).map((option) => {
          const active = project.visibility === option.toUpperCase()
          const blocked = option === 'public' && Boolean(project.program) && !project.program?.allowPublicProjects
          return (
            <button
              aria-pressed={active}
              className={cn(
                'rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40',
                active ? 'border-brand-600 bg-brand-50' : 'border-surface-border hover:border-brand-200',
                blocked && 'cursor-not-allowed opacity-50',
              )}
              disabled={blocked || active || change.isPending}
              key={option}
              onClick={() => change.mutate(option)}
              type="button"
            >
              <span className="block text-sm font-bold text-ink-strong">{VISIBILITY_META[option].label}</span>
              <span className="mt-1 block text-xs text-ink-muted">{blocked ? '이 기관 프로그램은 전체 공개를 허용하지 않습니다.' : VISIBILITY_META[option].description}</span>
            </button>
          )
        })}
      </div>
    </ProjectSection>
  )
}

export function ProjectSettingsTab({ ctx, onDelete }: { ctx: ProjectDetailContext; onDelete: () => void }) {
  const { project, can } = ctx
  return (
    <div className="space-y-4">
      {can('project.edit') ? <BasicInfoForm ctx={ctx} key={`info-${project.updatedAt}`} /> : null}
      {can('project.settings') ? <ProgressForm ctx={ctx} key={`progress-${project.updatedAt}`} /> : null}
      {can('project.settings') ? <VisibilitySection ctx={ctx} /> : null}
      {can('roles.manage') ? <ProjectRolesPanel onUpdated={ctx.invalidate} projectId={project.id} roles={project.roles ?? []} token={ctx.token} /> : null}
      {can('project.delete') ? (
        <ProjectSection className="border-danger-100 bg-danger-50/40" description="프로젝트와 프로젝트에 남긴 모든 기록을 영구 삭제합니다. 복구할 수 없습니다." title="프로젝트 삭제">
          <Button onClick={onDelete} type="button" variant="danger">
            <Trash2 aria-hidden size={16} />
            프로젝트 삭제
          </Button>
        </ProjectSection>
      ) : null}
    </div>
  )
}
