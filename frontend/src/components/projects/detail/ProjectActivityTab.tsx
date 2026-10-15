import { useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ACTIVITY_TYPE_LABEL, dateTimeLabel, WRITABLE_ACTIVITY_TYPES } from '../../../lib/projectDisplay'
import { emptyToNull } from '../../../lib/projectForm'
import { addProjectActivity, type ActivityPayload } from '../../../services/projectService'
import { showToast } from '../../../stores/toastStore'
import type { ProjectActivityType } from '../../../types/project'
import { Avatar } from '../../common/Avatar'
import { Button } from '../../common/Button'
import { Input, Select, Textarea } from '../../common/Input'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const emptyForm = { type: 'UPDATE' as ProjectActivityType, title: '', description: '' }

/** `composeRequest` changes each time a quick action asks for the form; 0 means no request. */
export function ProjectActivityTab({ ctx, composeRequest }: { ctx: ProjectDetailContext; composeRequest: number }) {
  const { project, token, can, invalidate } = ctx
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [seenRequest, setSeenRequest] = useState(0)
  if (composeRequest !== seenRequest) {
    setSeenRequest(composeRequest)
    if (composeRequest) setFormOpen(true)
  }
  const canWrite = can('activities.create')

  const create = useMutation({
    mutationFn: () =>
      addProjectActivity(token, project.id, {
        type: form.type.toLowerCase() as ActivityPayload['type'],
        title: form.title,
        description: emptyToNull(form.description),
      }),
    onSuccess: () => {
      setForm(emptyForm)
      setFormOpen(false)
      showToast('활동을 기록했습니다.', 'success')
      invalidate()
    },
  })

  return (
    <ProjectSection
      actions={
        canWrite && !formOpen ? (
          <Button onClick={() => setFormOpen(true)} size="sm" type="button">
            <Plus aria-hidden size={15} />
            활동 기록
          </Button>
        ) : null
      }
      description={
        project.program
          ? '팀이 남기는 진행 기록입니다. 기관 검증이 필요한 활동은 ‘증빙’에서 자료를 첨부해 제출하세요.'
          : '팀이 남기는 진행 기록입니다. 기관 검증을 거치지 않은 자기 기록입니다.'
      }
      title="활동 기록"
    >
      {formOpen ? (
        <form
          aria-label="새 활동"
          className="mb-4 grid gap-3 rounded-xl border border-brand-100 bg-brand-50/30 p-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Select label="유형" onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ProjectActivityType }))} value={form.type}>
            {WRITABLE_ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
          <Input autoFocus label="제목" maxLength={200} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required value={form.title} />
          <div className="sm:col-span-2">
            <Textarea
              className="min-h-20"
              label="내용 (선택)"
              maxLength={1000}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              value={form.description}
            />
          </div>
          {create.error ? (
            <p className="text-sm font-medium text-danger-700 sm:col-span-2" role="alert">
              {create.error.message}
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button
              onClick={() => {
                setFormOpen(false)
                setForm(emptyForm)
              }}
              type="button"
              variant="secondary"
            >
              취소
            </Button>
            <Button loading={create.isPending} type="submit">
              기록하기
            </Button>
          </div>
        </form>
      ) : null}

      {project.activities.length === 0 ? (
        <p className="rounded-xl bg-surface-muted/60 p-4 text-sm text-ink-muted">아직 활동 기록이 없습니다.</p>
      ) : (
        <ol aria-label="활동 목록" className="space-y-3">
          {project.activities.map((activity) => (
            <li className="flex gap-3" key={activity.id}>
              <Avatar name={activity.user?.name ?? '?'} size="sm" src={activity.user?.avatarUrl} />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-muted/50 p-3">
                <p className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink-body">{ACTIVITY_TYPE_LABEL[activity.type]}</span> · {activity.user?.name ?? '알 수 없음'} ·{' '}
                  <time dateTime={activity.createdAt}>{dateTimeLabel(activity.createdAt)}</time>
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink-strong">{activity.title}</p>
                {activity.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-body">{activity.description}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
      {project.activities.length >= 20 ? <p className="mt-3 text-xs text-ink-muted">최근 20개 활동만 표시합니다.</p> : null}
    </ProjectSection>
  )
}
