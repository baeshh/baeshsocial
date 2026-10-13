import type { AccessState, Contract, InvoiceStatus, InviteStatus, TicketPriority, TicketStatus } from '../types/commercial'

type Tone = 'blue' | 'purple' | 'gray' | 'green' | 'red'

export const ACCESS_STATE_META: Record<AccessState, { label: string; tone: Tone; description: string }> = {
  active: { label: '이용 중', tone: 'green', description: '계약 기간 안에서 모든 기능을 사용할 수 있습니다.' },
  past_due: { label: '미납', tone: 'red', description: '납부 기한이 지난 청구서가 있습니다. 기능은 유지되지만 납부가 필요합니다.' },
  grace: { label: '유예 기간', tone: 'purple', description: '이용 기간이 끝났습니다. 조회·다운로드만 가능하고 새 항목은 만들 수 없습니다.' },
  expired: { label: '만료', tone: 'gray', description: '이용 기간이 만료되었습니다. 데이터는 보존되며 갱신하면 그대로 이어집니다.' },
  none: { label: '요금제 없음', tone: 'gray', description: '적용된 요금제가 없습니다.' },
}

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  draft: { label: '초안', tone: 'gray' },
  issued: { label: '발행', tone: 'blue' },
  paid: { label: '납부 완료', tone: 'green' },
  overdue: { label: '연체', tone: 'red' },
  void: { label: '취소', tone: 'gray' },
}

export const CONTRACT_STATUS_LABEL: Record<Contract['status'], string> = {
  draft: '초안',
  sent: '발송',
  signed: '서명 완료',
  active: '이행 중',
  expired: '만료',
  terminated: '해지',
}

export const INVITE_STATUS_META: Record<InviteStatus, { label: string; tone: Tone }> = {
  pending: { label: '대기', tone: 'blue' },
  accepted: { label: '수락', tone: 'green' },
  revoked: { label: '취소', tone: 'gray' },
  expired: { label: '만료', tone: 'red' },
}

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: '접수', tone: 'blue' },
  in_progress: { label: '처리 중', tone: 'purple' },
  resolved: { label: '해결', tone: 'green' },
  closed: { label: '종료', tone: 'gray' },
}

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = { low: '낮음', normal: '보통', high: '높음', urgent: '긴급' }

export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  account: '계정·로그인',
  billing: '요금제·청구',
  program: '프로그램 운영',
  evidence: '증빙·승인',
  report: '결과보고서',
  bug: '오류 신고',
  other: '기타',
}

export const BILLING_PERIOD_LABEL: Record<string, string> = { month: '월', semester: '학기', year: '년', custom: '별도 계약' }

export function formatKrw(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return `${value.toLocaleString('ko-KR')}원`
}

export function formatPlanPrice(plan: { priceKrw: number | null; priceMaxKrw: number | null; billingPeriod: string; vatIncluded: boolean }) {
  if (plan.priceKrw === null) return '별도 견적'
  if (plan.priceKrw === 0) return '무료'
  const range = plan.priceMaxKrw ? `${formatKrw(plan.priceKrw)}~${formatKrw(plan.priceMaxKrw)}` : formatKrw(plan.priceKrw)
  return `${range} / ${BILLING_PERIOD_LABEL[plan.billingPeriod] ?? plan.billingPeriod}${plan.vatIncluded ? ' (VAT 포함)' : ' (VAT 별도)'}`
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function describeUserAgent(userAgent: string | null) {
  if (!userAgent) return '알 수 없는 기기'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : '브라우저'
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return os ? `${browser} · ${os}` : browser
}

/** Parses a CSV (or tab-separated paste) with a header row into invite rows. */
export function parseInviteCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { rows: [], errors: ['내용이 비어 있습니다.'] }
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const split = (line: string) => {
    const cells: string[] = []
    let current = ''
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else quoted = !quoted
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim())
        current = ''
      } else current += char
    }
    cells.push(current.trim())
    return cells
  }
  const HEADER_ALIASES: Record<string, string> = {
    email: 'email',
    이메일: 'email',
    name: 'name',
    이름: 'name',
    성명: 'name',
    role: 'role',
    역할: 'role',
    studentno: 'studentNo',
    student_no: 'studentNo',
    학번: 'studentNo',
    department: 'department',
    학과: 'department',
    소속: 'department',
  }
  const header = split(lines[0]).map((cell) => HEADER_ALIASES[cell.toLowerCase().replace(/\s/g, '')] ?? null)
  const hasHeader = header.includes('email')
  const columns = hasHeader ? header : ['email', 'name', 'studentNo', 'department']
  const ROLE_ALIASES: Record<string, 'admin' | 'manager' | 'member'> = {
    admin: 'admin',
    관리자: 'admin',
    manager: 'manager',
    담당자: 'manager',
    매니저: 'manager',
    member: 'member',
    학생: 'member',
    구성원: 'member',
    참여자: 'member',
  }
  const errors: string[] = []
  const rows = (hasHeader ? lines.slice(1) : lines).map((line, index) => {
    const cells = split(line)
    const row: Record<string, string> = {}
    columns.forEach((column, i) => {
      if (column && cells[i]) row[column] = cells[i]
    })
    const role = row.role ? ROLE_ALIASES[row.role.toLowerCase()] : undefined
    if (row.role && !role) errors.push(`${index + (hasHeader ? 2 : 1)}행: 알 수 없는 역할 "${row.role}"`)
    return {
      email: row.email ?? '',
      name: row.name || null,
      studentNo: row.studentNo || null,
      department: row.department || null,
      ...(role ? { role } : {}),
    }
  })
  return { rows: rows.filter((row) => row.email), errors }
}

export const INVITE_CSV_TEMPLATE = '이메일,이름,학번,학과,역할\nstudent01@example.ac.kr,홍길동,20260001,컴퓨터공학과,학생\n'
