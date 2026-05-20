import { showToast } from '../stores/toastStore'

export function notifyRepostAlreadyDone() {
  showToast('이미 퍼간 게시물입니다.', 'info')
}

export function notifyRepostSuccess() {
  showToast('퍼가기되었습니다.', 'success')
}

export function notifyRepostError(message: string) {
  if (message.includes('이미 퍼간')) {
    showToast('이미 퍼간 게시물입니다.', 'info')
    return
  }
  if (message.includes('자신이 작성한')) {
    showToast('자신이 작성한 게시물은 퍼갈 수 없습니다.', 'info')
    return
  }
  if (message.includes('퍼온 게시물은')) {
    showToast('퍼온 게시물은 다시 퍼갈 수 없습니다.', 'info')
    return
  }
  showToast(message, 'error')
}
