import { Badge } from '../common/Badge'
import { formatDateTime } from '../../lib/commercial'
import type { AuditLogEntry } from '../../types/commercial'

const ACTION_LABEL: Record<string, string> = {
  'auth.login': '로그인',
  'auth.logout': '로그아웃',
  'auth.register': '회원가입',
  'auth.password_change': '비밀번호 변경',
  'auth.session_revoke': '세션 종료',
  'org.access_denied': '접근 거부',
  'org.invite_bulk': '일괄 초대',
  'org.invite_accept': '초대 수락',
  'org.invite_revoke': '초대 취소',
  'org.invite_resend': '초대 재발송',
  'org.update': '조직 정보 수정',
  'org.verification_submit': '인증 서류 제출',
  'org.member_role_change': '역할 변경',
  'org.member_remove': '구성원 내보내기',
  'org.member_leave': '조직 탈퇴',
  'org.member_suspend': '구성원 정지',
  'org.member_reactivate': '구성원 정지 해제',
  'program.create': '프로그램 생성',
  'program.update': '프로그램 수정',
  'program.delete': '프로그램 삭제',
  'program.participants_add': '참여자 추가',
  'program.participant_remove': '참여자 제외',
  'evidence.approve': '증빙 승인',
  'evidence.reject': '증빙 반려',
  'evidence.revoke': '검증 철회',
  'evidence.delete': '증빙 삭제',
  'evidence.file_delete': '증빙 파일 삭제',
  'evidence.file_download': '증빙 파일 다운로드',
  'report.generate': '보고서 생성',
  'report.download': '보고서 다운로드',
  'talent.search': '인재 검색',
  'auth.logout_others': '다른 기기 로그아웃',
  'org.create': '조직 등록',
  'billing.contract_download': '계약서 다운로드',
  'billing.contract_create': '계약 등록',
  'billing.contract_update': '계약 수정',
  'billing.contract_document_upload': '계약서 업로드',
  'billing.subscription_create': '요금제 적용',
  'billing.subscription_renew': '구독 갱신',
  'billing.subscription_update': '구독 수정',
  'billing.invoice_create': '청구서 작성',
  'billing.invoice_issue': '청구서 발행',
  'billing.invoice_update': '청구서 수정',
  'billing.invoice_void': '청구서 취소',
  'billing.payment_record': '입금 기록',
  'billing.payment_cancel': '입금 취소',
  'billing.plan_create': '요금제 생성',
  'billing.plan_update': '요금제 수정',
  'billing.personal_plan_grant': '개인 요금제 부여',
  'billing.personal_plan_cancel': '개인 요금제 해지',
  'admin.user_suspend': '계정 정지',
  'admin.user_activate': '계정 정지 해제',
  'admin.user_role_change': '계정 권한 변경',
  'admin.user_sessions_revoke': '계정 세션 강제 종료',
  'admin.support_update': '문의 처리',
  'admin.announcement_create': '공지 게시',
  'admin.announcement_update': '공지 수정',
  'admin.announcement_delete': '공지 삭제',
  'ops.alert_drill': '알림 훈련',
  'ops.error_resolve': '오류 해결 처리',
}

const OUTCOME_TONE = { success: 'green', denied: 'red', failure: 'purple' } as const
const OUTCOME_LABEL = { success: '성공', denied: '거부', failure: '실패' } as const

export function AuditLogTable({ logs, showNetwork = false, showOrg = false }: { logs: AuditLogEntry[]; showNetwork?: boolean; showOrg?: boolean }) {
  if (logs.length === 0) return <p className="text-sm text-ink-muted">기록이 없습니다.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs text-ink-muted">
          <tr>
            <th className="py-2">시각</th>
            <th>작업</th>
            <th>결과</th>
            <th>수행자</th>
            {showOrg ? <th>조직</th> : null}
            <th>대상</th>
            {showNetwork ? <th>IP</th> : null}
            <th>세부</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border align-top">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="whitespace-nowrap py-2 pr-3 text-xs text-ink-muted">{formatDateTime(log.createdAt)}</td>
              <td className="pr-3">
                <p className="font-semibold text-ink-strong">{ACTION_LABEL[log.action] ?? log.action}</p>
                <p className="text-[11px] text-ink-muted">{log.action}</p>
              </td>
              <td className="pr-3">
                <Badge tone={OUTCOME_TONE[log.outcome]}>{OUTCOME_LABEL[log.outcome]}</Badge>
              </td>
              <td className="max-w-48 truncate pr-3 text-ink-body">{log.actorEmail ?? (log.actorId ? log.actorId.slice(0, 10) : '—')}</td>
              {showOrg ? <td className="max-w-40 truncate pr-3 text-ink-body">{log.organization?.name ?? '—'}</td> : null}
              <td className="pr-3 text-xs text-ink-muted">
                {log.targetType ?? '—'}
                {log.targetId ? ` · ${log.targetId.slice(0, 10)}` : ''}
              </td>
              {showNetwork ? <td className="pr-3 text-xs text-ink-muted">{log.ip ?? '—'}</td> : null}
              <td className="max-w-72 break-all text-[11px] text-ink-muted">{log.metadata ? JSON.stringify(log.metadata).slice(0, 200) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
