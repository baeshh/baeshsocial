import type { HistoryFilter, HistoryKind, ProfileVisibility } from '../types/profile'

const dayFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
const monthFormatter = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short' })

export function formatDay(value: string | null | undefined) {
  return value ? dayFormatter.format(new Date(value)).replace(/\s/g, '').replace(/\.$/, '') : null
}

export function formatMonth(value: string | null | undefined) {
  return value ? monthFormatter.format(new Date(value)) : null
}

export function formatPeriod(start: string | null, end: string | null, ongoing: boolean, kind?: HistoryKind) {
  const from = formatMonth(start)
  if (kind === 'career' || (kind === 'program' && start)) {
    const to = end ? formatMonth(end) : ongoing ? '현재' : null
    if (from && to && from !== to) return `${from} – ${to}`
    return from ?? (ongoing ? '진행 중' : '날짜 미입력')
  }
  if (!from) return ongoing ? '진행 중' : '날짜 미입력'
  return from
}

export const HISTORY_KIND_META: Record<HistoryKind, { label: string; tone: 'blue' | 'purple' | 'gray' | 'green' }> = {
  career: { label: '경력', tone: 'blue' },
  award: { label: '수상', tone: 'purple' },
  certificate: { label: '자격·수료', tone: 'gray' },
  program: { label: '프로그램', tone: 'green' },
  project: { label: '프로젝트 활동', tone: 'blue' },
}

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'verified', label: '검증된 성과' },
  { id: 'career', label: '경력' },
  { id: 'project', label: '프로젝트 활동' },
  { id: 'program', label: '프로그램' },
  { id: 'award', label: '수상' },
  { id: 'certificate', label: '자격·수료' },
]

export const PROFILE_VISIBILITY_META: Record<ProfileVisibility, { label: string; description: string }> = {
  PUBLIC: { label: '전체 공개', description: '로그인하지 않은 방문자도 소개·프로젝트·이력·공개 게시물을 볼 수 있습니다.' },
  MEMBERS: { label: '회원 공개', description: 'BAESH에 로그인한 회원만 상세 프로필을 볼 수 있습니다.' },
  FOLLOWERS: { label: '팔로워 공개', description: '나를 팔로우한 회원만 상세 프로필을 볼 수 있습니다.' },
}
