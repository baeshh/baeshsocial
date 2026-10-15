import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { VISIBILITY_META } from '../../lib/programs'
import { emptyToNull, splitTags } from '../../lib/projectForm'
import { createProject } from '../../services/projectService'
import { showToast } from '../../stores/toastStore'
import { Button } from '../common/Button'
import { Input, Select, Textarea } from '../common/Input'
import { Modal } from '../common/Modal'

type Visibility = keyof typeof VISIBILITY_META

const emptyForm = { title: '', description: '', objective: '', readme: '', skills: '', visibility: 'private' as Visibility }

/** Creates a personal project and opens it, so the next step (tasks, team) is right there. */
export function ProjectCreateModal({ token, open, onClose }: { token: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const create = useMutation({
    mutationFn: () =>
      createProject(token, {
        title: form.title,
        description: emptyToNull(form.description),
        objective: emptyToNull(form.objective),
        readme: emptyToNull(form.readme),
        visibility: form.visibility,
        skills: splitTags(form.skills),
      }),
    onSuccess: ({ project }) => {
      setForm(emptyForm)
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      showToast('프로젝트를 만들었습니다.', 'success')
      navigate(`/projects/${project.id}`)
    },
  })

  return (
    <Modal description="개인 프로젝트로 만들어집니다. 기관 프로그램 프로젝트는 프로그램에서 등록하거나 연결 요청할 수 있습니다." onClose={onClose} open={open} title="새 프로젝트">
      <form
        className="space-y-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <Input
          label="프로젝트명"
          maxLength={160}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="예: BAESH 플랫폼 리뉴얼"
          required
          value={form.title}
        />
        <Textarea
          label="한 줄 설명"
          maxLength={1200}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          rows={2}
          value={form.description}
        />
        <Textarea
          label="목표"
          maxLength={1200}
          onChange={(event) => setForm((prev) => ({ ...prev, objective: event.target.value }))}
          rows={2}
          value={form.objective}
        />
        <Input
          helperText="쉼표로 구분합니다."
          label="기술스택"
          onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))}
          placeholder="React, Node.js, PostgreSQL"
          value={form.skills}
        />
        <Select
          helperText={VISIBILITY_META[form.visibility].description}
          label="공개 범위"
          onChange={(event) => setForm((prev) => ({ ...prev, visibility: event.target.value as Visibility }))}
          value={form.visibility}
        >
          {(Object.keys(VISIBILITY_META) as Visibility[]).map((option) => (
            <option key={option} value={option}>
              {VISIBILITY_META[option].label}
            </option>
          ))}
        </Select>
        <Textarea
          label="README (선택)"
          maxLength={8000}
          onChange={(event) => setForm((prev) => ({ ...prev, readme: event.target.value }))}
          placeholder="팀원과 공유할 상세 문서"
          rows={3}
          value={form.readme}
        />
        {create.error ? (
          <p className="rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">
            {create.error.message}
          </p>
        ) : null}
        <div className="flex gap-3 pt-1">
          <Button className="min-h-11 flex-1" onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button className="min-h-11 flex-[2]" loading={create.isPending} type="submit">
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  )
}
