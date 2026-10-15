import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setProfileDisplay } from '../services/projectService'
import { useAuthStore } from '../stores/authStore'
import { showToast } from '../stores/toastStore'

/** Hides or shows a project on the signed-in user's own profile. */
export function useProfileDisplay() {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, hidden }: { projectId: string; hidden: boolean }) => setProfileDisplay(token ?? '', projectId, hidden),
    onSuccess: ({ hidden }) => {
      showToast(hidden ? '내 프로필에서 숨겼습니다. 팀 작업과 기관 기록은 그대로입니다.' : '내 프로필에 다시 표시합니다.', 'success')
      void queryClient.invalidateQueries({ queryKey: ['profiles'] })
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
}
