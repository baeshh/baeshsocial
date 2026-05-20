import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info'

type ToastState = {
  message: string | null
  variant: ToastVariant
  show: (message: string, variant?: ToastVariant) => void
  hide: () => void
}

let hideTimer: ReturnType<typeof setTimeout> | null

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  variant: 'success',
  show: (message, variant = 'success') => {
    if (hideTimer) {
      window.clearTimeout(hideTimer)
    }
    set({ message, variant })
    hideTimer = window.setTimeout(() => {
      set({ message: null })
      hideTimer = null
    }, 2200)
  },
  hide: () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
    set({ message: null })
  },
}))

export function showToast(message: string, variant: ToastVariant = 'success') {
  useToastStore.getState().show(message, variant)
}
