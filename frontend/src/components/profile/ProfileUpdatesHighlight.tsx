import { GraduationCap, Sparkles, Trophy } from 'lucide-react'
import { Badge } from '../common/Badge'
import { classifyOpportunityType, HISTORY_CATEGORY_META } from '../../lib/profileHistory'
import type { GrowthTimelineItem, ProfilePayload, ProgramEnrollment } from '../../types/profile'

type HighlightItem = {
  id: string
  title: string
  description: string
  date: string | null
  tone: 'program' | 'award' | 'certificate' | 'other'
}

function formatDate(value: string | null) {
  if (!value) {
    return null
  }
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function programHighlight(enrollment: ProgramEnrollment): HighlightItem {
  const date = enrollment.completedAt ?? enrollment.enrolledAt ?? enrollment.appliedAt
  const category = classifyOpportunityType(enrollment.opportunity.type)
  const typeLabel = HISTORY_CATEGORY_META[category].label

  if (enrollment.status === 'COMPLETED') {
    return {
      id: `program-${enrollment.id}`,
      title: `「${enrollment.opportunity.title}」 ${typeLabel} 수료`,
      description: `${enrollment.opportunity.organization} · 수료 완료`,
      date,
      tone: 'program',
    }
  }

  if (enrollment.status === 'ENROLLED') {
    return {
      id: `program-${enrollment.id}`,
      title: `「${enrollment.opportunity.title}」 ${typeLabel} 선정`,
      description: `${enrollment.opportunity.organization} · 선정 · 수강 중`,
      date,
      tone: 'program',
    }
  }

  return null
}

function timelineHighlight(item: GrowthTimelineItem): HighlightItem | null {
  if (item.kind === 'program_completed') {
    return {
      id: `timeline-${item.id}`,
      title: item.title,
      description: item.description,
      date: item.date,
      tone: 'program',
    }
  }

  if (item.kind === 'award') {
    return {
      id: `timeline-${item.id}`,
      title: item.title,
      description: item.description,
      date: item.date,
      tone: 'award',
    }
  }

  if (item.kind === 'certificate') {
    return {
      id: `timeline-${item.id}`,
      title: item.title,
      description: item.description,
      date: item.date,
      tone: 'certificate',
    }
  }

  return null
}

function buildHighlights(data: ProfilePayload): HighlightItem[] {
  const fromPrograms = data.programEnrollments
    .map(programHighlight)
    .filter((item): item is HighlightItem => item !== null)
  const fromTimeline = data.growthTimeline
    .map(timelineHighlight)
    .filter((item): item is HighlightItem => item !== null)

  const merged = [...fromPrograms, ...fromTimeline]
  const seen = new Set<string>()

  return merged
    .filter((item) => {
      if (seen.has(item.title)) {
        return false
      }
      seen.add(item.title)
      return true
    })
    .sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0
      const bTime = b.date ? new Date(b.date).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 8)
}

function toneIcon(tone: HighlightItem['tone']) {
  if (tone === 'program') {
    return <GraduationCap className="text-brand-600" size={18} />
  }
  if (tone === 'award') {
    return <Trophy className="text-amber-600" size={18} />
  }
  if (tone === 'certificate') {
    return <Sparkles className="text-violet-600" size={18} />
  }
  return <Sparkles className="text-ink-muted" size={18} />
}

type ProfileUpdatesHighlightProps = {
  data: ProfilePayload
  userName: string
  emphasized?: boolean
}

export function ProfileUpdatesHighlight({ data, userName, emphasized = false }: ProfileUpdatesHighlightProps) {
  const highlights = buildHighlights(data)

  return (
    <section
      className={`rounded-2xl border bg-gradient-to-br from-brand-50/80 to-violet-50/50 p-5 shadow-sm transition ${
        emphasized ? 'border-brand-300 ring-2 ring-brand-200 ring-offset-2' : 'border-brand-100'
      }`}
      id="profile-updates"
    >
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-700">최근 소식</p>
        <h2 className="mt-1 text-lg font-bold text-ink-strong">{userName}님의 프로그램·이력 하이라이트</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Jobs 프로그램 선정·수료, 수상·자격 등 공개된 활동을 한눈에 확인할 수 있습니다.
        </p>
      </div>

      {highlights.length === 0 ? (
        <p className="rounded-xl bg-white/70 px-4 py-3 text-sm text-ink-muted">
          아직 공개된 프로그램·이력 소식이 없습니다. 아래 전체 이력에서 확인해 보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {highlights.map((item) => (
            <li
              className="flex gap-3 rounded-xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm"
              key={item.id}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted">
                {toneIcon(item.tone)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone={item.tone === 'program' ? 'blue' : item.tone === 'award' ? 'purple' : 'green'}>
                    {item.tone === 'program' ? '프로그램' : item.tone === 'award' ? '수상' : '자격/수료'}
                  </Badge>
                  {item.date ? (
                    <span className="text-xs font-medium text-ink-muted">{formatDate(item.date)}</span>
                  ) : null}
                </div>
                <p className="font-semibold text-ink-strong">{item.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
