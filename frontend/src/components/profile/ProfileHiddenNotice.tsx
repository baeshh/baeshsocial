import { EyeOff } from 'lucide-react'
import { useProfileDisplay } from '../../hooks/useProfileDisplay'

/** Owner-only: the project is on their own view of the profile but hidden from everyone else. */
export function ProfileHiddenNotice({ projectId, title }: { projectId: string; title: string }) {
  const toggle = useProfileDisplay()
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-muted/70 px-3 py-2 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1 font-semibold text-ink-body">
        <EyeOff aria-hidden size={13} />
        프로필에서 숨김
      </span>
      <span>나만 볼 수 있습니다.</span>
      <button
        aria-label={`${title} 내 프로필에 다시 표시`}
        className="font-semibold text-brand-700 hover:underline disabled:opacity-50"
        disabled={toggle.isPending}
        onClick={() => toggle.mutate({ projectId, hidden: false })}
        type="button"
      >
        다시 표시
      </button>
    </p>
  )
}
