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
  showToast(message, 'error')
}
