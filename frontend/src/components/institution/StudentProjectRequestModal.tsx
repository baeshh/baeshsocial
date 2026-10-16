import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { VISIBILITY_META, formatDate } from '../../lib/programs'
import { createProjectRequest, getLinkableProjects, type ProjectRequestPayload } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program, ProjectVisibility } from '../../types/program'
import { Button } from '../common/Button'
import { Input, Select, Textarea } from '../common/Input'
import { LoadingState } from '../common/LoadingState'
import { Modal } from '../common/Modal'

type Mode = 'new' | 'existing'

export function StudentProjectRequestModal({ program, onClose }: { program: Program; onClose: () => void }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('new')
  const [title, setTitle] = useState('')
  const [teamName, setTeamName] = useState('')
  const [objective, setObjective] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ProjectVisibility>('team')
  const [message, setMessage] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const linkableQuery = useQuery({
    queryKey: ['programs', program.id, 'linkable-projects'],
    queryFn: () => getLinkableProjects(token!, program.id),
    enabled: Boolean(token) && mode === 'existing',
  })

  const submit = useMutation({
    mutationFn: () => {
      const payload: ProjectRequestPayload =
        mode === 'new'
          ? {
              mode,
              title: title.trim(),
              teamName: teamName.trim() || null,
              objective: objective.trim() || null,
              description: description.trim() || null,
              visibility,
              message: message.trim() || null,
            }
          : { mode, projectId, teamName: teamName.trim() || null, message: message.trim() || null }
      return createProjectRequest(token!, program.id, payload)
    },
    onSuccess: ({ registration }) => {
      showToast(
        registration.status === 'approved'
          ? '프로그램 프로젝트로 등록되었습니다.'
          : '등록 요청을 보냈습니다. 담당자가 승인하면 프로그램 프로젝트가 됩니다.',
      )
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  const approvalNote = program.policy.requireProjectApproval
    ? '담당자 승인 후 프로그램 프로젝트로 등록됩니다. 승인 전까지는 내 개인 프로젝트로 유지됩니다.'
    : '이 프로그램은 바로 등록됩니다.'

  return (
    <Modal description={approvalNote} onClose={onClose} open title={`${program.title}에 프로젝트 등록`} wide>
      <div className="mb-4 flex gap-1 rounded-full border border-surface-border bg-white p-1">
        {(
          [
            ['new', '새 프로젝트 만들기'],
            ['existing', '기존 프로젝트 연결'],
          ] as const
        ).map(([id, label]) => (
          <button
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              mode === id ? 'bg-brand-600 text-white' : 'text-ink-body hover:bg-surface-muted'
            }`}
            key={id}
            onClick={() => {
              setMode(id)
              setError(null)
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          submit.mutate()
        }}
      >
        {mode === 'new' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Input label="팀 이름" maxLength={60} onChange={(e) => setTeamName(e.target.value)} placeholder="알파팀" value={teamName} />
              <Input label="프로젝트 이름" maxLength={120} minLength={2} onChange={(e) => setTitle(e.target.value)} required value={title} />
            </div>
            <Textarea label="프로젝트 목표" maxLength={2000} onChange={(e) => setObjective(e.target.value)} value={objective} />
            <Textarea label="설명" maxLength={4000} onChange={(e) => setDescription(e.target.value)} value={description} />
            <Select
              helperText={VISIBILITY_META[visibility].description}
              label="공개 범위"
              onChange={(e) => setVisibility(e.target.value as ProjectVisibility)}
              value={visibility}
            >
              {(Object.keys(VISIBILITY_META) as ProjectVisibility[]).map((key) => (
                <option disabled={key === 'public' && !program.policy.allowPublicProjects} key={key} value={key}>
                  {VISIBILITY_META[key].label}
                  {key === 'public' && !program.policy.allowPublicProjects ? ' (이 프로그램에서 허용 안 함)' : ''}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              프로젝트를 복사하지 않고 그대로 연결합니다. 태스크·파일·활동 기록·GitHub 링크와 팀원이 유지되며, 팀원 모두 이 프로그램의 참여자여야
              합니다.
            </p>
            {linkableQuery.isLoading ? (
              <LoadingState />
            ) : (linkableQuery.data?.projects ?? []).length === 0 ? (
              <p className="rounded-2xl bg-surface-muted/60 p-4 text-sm text-ink-muted">연결할 수 있는 개인 프로젝트가 없습니다. 내가 만들었거나 리더인 프로젝트만 표시됩니다.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-surface-border overflow-y-auto rounded-2xl border border-surface-border">
                {linkableQuery.data!.projects.map((project) => (
                  <li key={project.id}>
                    <label
                      className={`flex items-start gap-3 px-4 py-3 ${project.blockedReason ? 'opacity-60' : 'cursor-pointer hover:bg-surface-muted/50'}`}
                    >
                      <input
                        checked={projectId === project.id}
                        className="mt-1"
                        disabled={Boolean(project.blockedReason)}
                        name="linkable-project"
                        onChange={() => setProjectId(project.id)}
                        type="radio"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-strong">{project.title}</span>
                        <span className="block text-xs text-ink-muted">
                          팀원 {project.counts.members} · 태스크 {project.counts.tasks} · 링크 {project.counts.externalLinks} ·{' '}
                          {VISIBILITY_META[project.visibility].label} · {formatDate(project.updatedAt)}
                        </span>
                        {project.blockedReason ? <span className="block text-xs font-medium text-red-600">{project.blockedReason}</span> : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <Input label="팀 이름 (선택)" maxLength={60} onChange={(e) => setTeamName(e.target.value)} value={teamName} />
          </>
        )}
        <Textarea label="담당자에게 남길 말 (선택)" maxLength={1000} onChange={(e) => setMessage(e.target.value)} value={message} />
        {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700" role="alert">{error}</p> : null}
        <div className="flex justify-end">
          <Button disabled={submit.isPending || (mode === 'existing' && !projectId)} type="submit">
            {submit.isPending ? '보내는 중…' : program.policy.requireProjectApproval ? '등록 요청' : '등록'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
