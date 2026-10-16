import { useQuery } from '@tanstack/react-query'
import { Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { getAnnouncements } from '../../services/commercialService'
import { useAuthStore } from '../../stores/authStore'

const DISMISSED_KEY = 'baesh.dismissedAnnouncements'

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(-50) : []
  } catch {
    return []
  }
}

/** Operator notices (maintenance, incidents, policy changes). Critical ones cannot be dismissed. */
export function AnnouncementBanner() {
  const token = useAuthStore((state) => state.token)
  const [dismissed, setDismissed] = useState(readDismissed)
  const { data } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => getAnnouncements(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  })
  const visible = (data?.announcements ?? []).filter((item) => item.severity === 'critical' || !dismissed.includes(item.id)).slice(0, 2)
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  }

  return (
    <div className="mb-5 space-y-2">
      {visible.map((item) => (
        <div
          className={cn(
            'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
            item.severity === 'critical'
              ? 'border-red-200 bg-red-50 text-red-900'
              : item.severity === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-brand-100 bg-brand-50 text-brand-900',
          )}
          key={item.id}
          role="status"
        >
          <Megaphone className="mt-0.5 shrink-0" size={16} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-0.5 whitespace-pre-wrap leading-6">{item.body}</p>
          </div>
          {item.severity !== 'critical' ? (
            <button aria-label="공지 닫기" className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(item.id)} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
