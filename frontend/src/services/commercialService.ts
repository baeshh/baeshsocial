import { apiRequest, apiUpload, withQuery } from '../lib/api'
import type {
  AdminBillingOrgDetail,
  AdminBillingOrgRow,
  AdminUserRow,
  Announcement,
  AuditPage,
  BackupFreshness,
  BillingSummary,
  BulkInviteResult,
  Contract,
  ErrorEvent,
  InviteAcceptResult,
  InvitePreview,
  InviteRole,
  InviteRowInput,
  Invoice,
  MyBilling,
  OnboardingChecklist,
  OpsMetrics,
  OpsOverview,
  OpsRun,
  OpsUsage,
  OrgBilling,
  OrganizationInvite,
  Plan,
  SessionInfo,
  Subscription,
  SupportTicket,
} from '../types/commercial'

const json = (body: unknown) => JSON.stringify(body)
const post = <T>(path: string, token: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'POST', token, ...(body === undefined ? {} : { body: json(body) }) })
const patch = <T>(path: string, token: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', token, body: json(body) })
const del = (path: string, token: string) => apiRequest<void>(path, { method: 'DELETE', token })

/* ------------------------------ Account security ----------------------------- */

export const getSessions = (token: string) => apiRequest<{ sessions: SessionInfo[] }>('/auth/sessions', { token })
export const revokeSession = (token: string, sessionId: string) => del(`/auth/sessions/${sessionId}`, token)
export const logoutOthers = (token: string) => post<{ revoked: number }>('/auth/logout-others', token)
export const changePassword = (token: string, body: { currentPassword: string; newPassword: string }) =>
  post<{ message: string; revokedSessions: number }>('/auth/password', token, body)

/* ---------------------------------- Billing ---------------------------------- */

export const getPlans = () => apiRequest<{ plans: Plan[]; limitLabels: Record<string, string> }>('/billing/plans')
export const getMyBilling = (token: string) => apiRequest<MyBilling>('/billing/me', { token })
export const getOrgBilling = (token: string, orgId: string) => apiRequest<OrgBilling>(`/organizations/${orgId}/billing`, { token })
export const getOrgContractDocument = (token: string, orgId: string, contractId: string) =>
  apiRequest<{ url: string }>(`/organizations/${orgId}/billing/contracts/${contractId}/document`, { token })

/* -------------------------------- Onboarding --------------------------------- */

export const getOnboarding = (token: string, orgId: string) =>
  apiRequest<OnboardingChecklist>(`/organizations/${orgId}/onboarding`, { token })

export const getInvites = (token: string, orgId: string, params: { status?: string; programId?: string } = {}) =>
  apiRequest<{ invites: OrganizationInvite[]; counts: Record<string, number>; canInviteStaff: boolean }>(
    withQuery(`/organizations/${orgId}/invites`, params),
    { token },
  )

export const createInvites = (
  token: string,
  orgId: string,
  body: { programId?: string | null; role?: InviteRole; rows: InviteRowInput[] },
) => post<BulkInviteResult>(`/organizations/${orgId}/invites`, token, body)

export const resendInvite = (token: string, orgId: string, inviteId: string) =>
  post<{ inviteUrl: string; delivery: string }>(`/organizations/${orgId}/invites/${inviteId}/resend`, token)

export const revokeInvite = (token: string, orgId: string, inviteId: string) => del(`/organizations/${orgId}/invites/${inviteId}`, token)

export const previewInvite = (inviteToken: string) => apiRequest<{ invite: InvitePreview }>(`/invites/${encodeURIComponent(inviteToken)}`)

export const acceptInvite = (token: string, inviteToken: string) =>
  post<InviteAcceptResult>(`/invites/${encodeURIComponent(inviteToken)}/accept`, token)

export const suspendMember = (token: string, orgId: string, memberId: string) =>
  post<unknown>(`/organizations/${orgId}/members/${memberId}/suspend`, token)

export const reactivateMember = (token: string, orgId: string, memberId: string) =>
  post<unknown>(`/organizations/${orgId}/members/${memberId}/reactivate`, token)

export const getOrgAuditLogs = (token: string, orgId: string, params: { action?: string; outcome?: string; cursor?: string }) =>
  apiRequest<AuditPage>(withQuery(`/organizations/${orgId}/audit-logs`, { ...params, limit: 50 }), { token })

/* ----------------------------- Support / notices ----------------------------- */

export const getTickets = (token: string) => apiRequest<{ tickets: SupportTicket[] }>('/support/tickets', { token })
export const createTicket = (
  token: string,
  body: { organizationId?: string | null; category: string; subject: string; body: string; priority: string },
) => post<{ ticket: SupportTicket }>('/support/tickets', token, body)
export const replyTicket = (token: string, ticketId: string, body: string) =>
  post<{ ticket: SupportTicket }>(`/support/tickets/${ticketId}/messages`, token, { body })
export const getAnnouncements = (token: string) => apiRequest<{ announcements: Announcement[] }>('/announcements', { token })

/* ---------------------------------- Admin ------------------------------------ */

export const adminGetUsers = (token: string, params: { q?: string; status?: string; role?: string; page?: number }) =>
  apiRequest<{ total: number; page: number; pageSize: number; users: AdminUserRow[] }>(withQuery('/admin/users', params), { token })
export const adminSuspendUser = (token: string, userId: string, reason: string) =>
  post<{ revokedSessions: number }>(`/admin/users/${userId}/suspend`, token, { reason })
export const adminActivateUser = (token: string, userId: string) => post<unknown>(`/admin/users/${userId}/activate`, token)
export const adminChangeRole = (token: string, userId: string, role: string) =>
  patch<{ role: string; revokedSessions?: number }>(`/admin/users/${userId}/role`, token, { role })
export const adminRevokeUserSessions = (token: string, userId: string) =>
  post<{ revokedSessions: number }>(`/admin/users/${userId}/sessions/revoke`, token)

export const adminGetAuditLogs = (
  token: string,
  params: { action?: string; outcome?: string; actor?: string; organizationId?: string; cursor?: string },
) => apiRequest<AuditPage>(withQuery('/admin/audit-logs', { ...params, limit: 100 }), { token })

export const adminGetTickets = (token: string, status: string) =>
  apiRequest<{ tickets: SupportTicket[] }>(withQuery('/admin/support/tickets', { status }), { token })
export const adminReplyTicket = (token: string, ticketId: string, body: string) =>
  post<{ ticket: SupportTicket }>(`/admin/support/tickets/${ticketId}/messages`, token, { body })
export const adminUpdateTicket = (token: string, ticketId: string, body: { status?: string; priority?: string }) =>
  patch<{ ticket: SupportTicket }>(`/admin/support/tickets/${ticketId}`, token, body)

export const adminGetAnnouncements = (token: string) => apiRequest<{ announcements: Announcement[] }>('/admin/announcements', { token })
export const adminCreateAnnouncement = (
  token: string,
  body: { title: string; body: string; severity: string; audience: string; organizationId?: string | null; expiresAt?: string | null },
) => post<{ announcement: Announcement }>('/admin/announcements', token, body)
export const adminDeleteAnnouncement = (token: string, id: string) => del(`/admin/announcements/${id}`, token)

export const adminBillingSummary = (token: string) => apiRequest<BillingSummary>('/admin/billing/summary', { token })
export const adminBillingPlans = (token: string) => apiRequest<{ plans: Plan[] }>('/admin/billing/plans', { token })
export const adminBillingOrgs = (token: string, params: { state?: string; q?: string }) =>
  apiRequest<{ organizations: AdminBillingOrgRow[] }>(withQuery('/admin/billing/organizations', params), { token })
export const adminBillingOrg = (token: string, orgId: string) =>
  apiRequest<AdminBillingOrgDetail>(`/admin/billing/organizations/${orgId}`, { token })
export const adminCreateSubscription = (
  token: string,
  orgId: string,
  body: { planId: string; status: 'trial' | 'active'; startsAt: string; endsAt: string | null; graceDays: number; notes?: string | null },
) => post<{ subscription: Subscription }>(`/admin/billing/organizations/${orgId}/subscriptions`, token, body)
export const adminRenewSubscription = (token: string, subscriptionId: string, body: { endsAt: string; planId?: string }) =>
  post<{ subscription: Subscription }>(`/admin/billing/subscriptions/${subscriptionId}/renew`, token, body)
export const adminCreateContract = (
  token: string,
  orgId: string,
  body: {
    title: string
    subscriptionId?: string | null
    status: string
    amountKrw: number
    vatKrw: number
    startsAt: string
    endsAt: string
    billingContactName?: string | null
    billingContactEmail?: string | null
    taxInfo?: Record<string, string> | null
  },
) => post<{ contract: Contract }>(`/admin/billing/organizations/${orgId}/contracts`, token, body)
export const adminUploadContractDocument = (token: string, contractId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return apiUpload<{ contract: Contract }>(`/admin/billing/contracts/${contractId}/document`, form, { token })
}
export const adminContractDocument = (token: string, contractId: string) =>
  apiRequest<{ url: string }>(`/admin/billing/contracts/${contractId}/document`, { token })
export const adminCreateInvoice = (
  token: string,
  body: {
    organizationId: string
    subscriptionId?: string | null
    contractId?: string | null
    items: { description: string; quantity: number; unitKrw: number }[]
    vatMode: 'exclusive' | 'inclusive' | 'exempt'
    dueAt?: string | null
    periodStart?: string | null
    periodEnd?: string | null
  },
) => post<{ invoice: Invoice }>('/admin/billing/invoices', token, body)
export const adminIssueInvoice = (token: string, invoiceId: string, body: { dueAt?: string; taxInvoiceNo?: string | null }) =>
  post<{ invoice: Invoice }>(`/admin/billing/invoices/${invoiceId}/issue`, token, body)
export const adminVoidInvoice = (token: string, invoiceId: string, reason: string) =>
  post<{ invoice: Invoice }>(`/admin/billing/invoices/${invoiceId}/void`, token, { reason })
export const adminRecordPayment = (
  token: string,
  invoiceId: string,
  body: { method: string; amountKrw: number; paidAt: string; reference?: string | null },
) => post<{ invoice: Invoice }>(`/admin/billing/invoices/${invoiceId}/payments`, token, body)

export const opsOverview = (token: string) => apiRequest<OpsOverview>('/admin/ops/overview', { token })
export const opsMetrics = (token: string, hours: number) => apiRequest<OpsMetrics>(withQuery('/admin/ops/metrics', { hours }), { token })
export const opsErrors = (token: string, status: string) => apiRequest<{ errors: ErrorEvent[] }>(withQuery('/admin/ops/errors', { status }), { token })
export const opsResolveError = (token: string, errorId: string) => post<unknown>(`/admin/ops/errors/${errorId}/resolve`, token)
export const opsRuns = (token: string, kind: string) =>
  apiRequest<{ runs: OpsRun[]; freshness: BackupFreshness }>(withQuery('/admin/ops/runs', { kind }), { token })
export const opsAlertDrill = (token: string) => post<{ run: OpsRun; delivered: boolean }>('/admin/ops/drills/alert', token)
export const opsUsage = (token: string) => apiRequest<OpsUsage>('/admin/ops/usage', { token })
