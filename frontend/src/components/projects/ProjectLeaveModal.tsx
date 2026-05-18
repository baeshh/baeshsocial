import { Modal } from '../common/Modal'
import { Button } from '../common/Button'

type ProjectLeaveModalProps = {
  open: boolean
  projectTitle: string
  isPending?: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => void
}

export function ProjectLeaveModal({
  open,
  projectTitle,
  isPending = false,
  error,
  onClose,
  onConfirm,
}: ProjectLeaveModalProps) {
  return (
    <Modal
      description={`"${projectTitle}" 프로젝트에서 탈퇴하시겠습니까? 탈퇴 후에는 이 프로젝트에 접근할 수 없습니다.`}
      onClose={onClose}
      open={open}
      title="프로젝트 탈퇴"
    >
      <div className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isPending} onClick={onClose} type="button" variant="secondary">
            취소
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button" variant="danger">
            {isPending ? '탈퇴 중…' : '탈퇴 확인'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
