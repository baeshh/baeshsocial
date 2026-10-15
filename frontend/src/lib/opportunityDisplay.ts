import type { Opportunity, OpportunityEnrollment, OpportunityEnrollmentStatus } from '../types/opportunity'
import { OPPORTUNITY_TYPE_LABEL } from './jobsSearch'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'amber' | 'red'

/** Status of a sign-up to a program-type posted opportunity, as the applicant sees it. */
export const ENROLLMENT_STATUS_META: Record<OpportunityEnrollmentStatus, { label: string; tone: Tone }> = {
  APPLIED: { label: '신청 대기', tone: 'amber' },
  ENROLLED: { label: '선정 · 참여 중', tone: 'green' },
  COMPLETED: { label: '수료 완료', tone: 'blue' },
  REJECTED: { label: '미선정', tone: 'gray' },
  WITHDRAWN: { label: '신청 취소', tone: 'gray' },
}

export const opportunityKindLabel = (opportunity: Pick<Opportunity, 'type'>) => `${OPPORTUNITY_TYPE_LABEL[opportunity.type]} 공고`

const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * Deadlines are calendar dates (stored as midnight UTC), open through the whole deadline day in Korea time
 * wherever the viewer is. The server's sign-up check and "open" filter use the same rule.
 */
export function opportunityDeadline(deadline: string | null, now = new Date()) {
  if (!deadline) return { closed: false, label: '상시 모집', dateLabel: '상시' }
  const day = deadline.slice(0, 10)
  const [year, month, date] = day.split('-').map(Number)
  const days = Math.round((Date.UTC(year, month - 1, date) - Date.parse(`${seoulDay.format(now)}T00:00:00Z`)) / 86_400_000)
  const dateLabel = `${month}월 ${date}일`
  if (days < 0) return { closed: true, label: '마감', dateLabel }
  return { closed: false, label: days === 0 ? '오늘 마감' : `마감 D-${days}`, dateLabel }
}

/** One status per card: the viewer's own sign-up if any, otherwise whether the posting still takes applicants. */
export function opportunityStatus(opportunity: Pick<Opportunity, 'deadline'>, enrollment?: OpportunityEnrollment, now = new Date()) {
  if (enrollment && enrollment.status !== 'WITHDRAWN') return ENROLLMENT_STATUS_META[enrollment.status]
  const deadline = opportunityDeadline(opportunity.deadline, now)
  if (deadline.closed) return { label: '마감', tone: 'gray' as Tone }
  return { label: opportunity.deadline ? '모집 중' : '상시 모집', tone: 'green' as Tone }
}

/** Only http(s) links are opened, so a stored `javascript:` or similar value can never run. */
export function safeExternalUrl(url: string | null) {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null
  } catch {
    return null
  }
}
