import { useState, type FormEvent } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { Input } from '../common/Input'

type ProjectDeleteModalProps = {
  open: boolean
  projectTitle: string
  /** Other members who lose the project; above zero they must confirm it explicitly. */
  otherMembers?: number
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (password: string, confirmTeamImpact: boolean) => void
}

export function ProjectDeleteModal({
  open,
  projectTitle,
  otherMembers = 0,
  isPending = false,
  error,
  onClose,
  onConfirm,
}: ProjectDeleteModalProps) {
  const [password, setPassword] = useState('')
  const [teamConfirmed, setTeamConfirmed] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setPassword('')
      setTeamConfirmed(false)
    }
  }
  const needsTeamConfirm = otherMembers > 0
  const ready = password.trim().length > 0 && (!needsTeamConfirm || teamConfirmed)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) {
      return
    }
    onConfirm(password, needsTeamConfirm && teamConfirmed)
  }

  return (
    <Modal
      description={`"${projectTitle}" 프로젝트를 삭제하면 복구할 수 없으며, 작업·활동·파일·팀원 기록이 모두 제거됩니다.`}
      onClose={onClose}
      open={open}
      title="프로젝트 삭제"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {needsTeamConfirm ? (
          <label className="flex items-start gap-2 rounded-xl border border-danger-100 bg-danger-50/60 p-3 text-sm text-danger-700">
            <input checked={teamConfirmed} className="mt-0.5 h-4 w-4" onChange={(event) => setTeamConfirmed(event.target.checked)} type="checkbox" />
            다른 팀원 {otherMembers}명도 이 프로젝트와 함께 남긴 기록을 잃게 된다는 것을 확인했습니다.
          </label>
        ) : null}
        <p className="text-sm font-medium text-ink-strong">
          계속하려면 로그인 비밀번호를 입력해 주세요.
        </p>
        <Input
          autoComplete="current-password"
          label="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isPending} onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button disabled={isPending || !ready} type="submit" variant="danger">
            {isPending ? '삭제 중…' : '삭제 확인'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
