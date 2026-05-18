import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../common/Modal'
import { Button } from '../common/Button'
import { Input } from '../common/Input'

type ProjectDeleteModalProps = {
  open: boolean
  projectTitle: string
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: (password: string) => void
}

export function ProjectDeleteModal({
  open,
  projectTitle,
  isPending = false,
  error,
  onClose,
  onConfirm,
}: ProjectDeleteModalProps) {
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!open) {
      setPassword('')
    }
  }, [open])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!password.trim()) {
      return
    }
    onConfirm(password)
  }

  return (
    <Modal
      description={`"${projectTitle}" 프로젝트를 삭제하시겠습니까? 삭제하면 복구할 수 없으며, 태스크·활동·파일·멤버 기록이 모두 제거됩니다.`}
      onClose={onClose}
      open={open}
      title="프로젝트 삭제"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isPending} onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button disabled={isPending || !password.trim()} type="submit" variant="danger">
            {isPending ? '삭제 중…' : '삭제 확인'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
