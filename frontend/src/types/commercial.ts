export type AccessState = 'active' | 'past_due' | 'grace' | 'expired' | 'none'

export type PlanLimits = Record<string, number | boolean | null>

export type Plan = {
  id: string
  key: string
  name: string
  description: string | null
  audience: 'personal' | 'organization'
  orgTypes: string[]
  priceKrw: number | null
  priceMaxKrw: number | null
  billingPeriod: 'month' | 'semester' | 'year' | 'custom'
  vatIncluded: boolean
  limits: PlanLimits
  features: string[]
  isPublic: boolean
  active: boolean
  sortOrder: number
}

export type Subscription = {
  id: string
  organizationId: string | null
  userId: string | null
  plan: { id: string; key: string; name: string } | null
  status: 'trial' | 'active' | 'past_due' | 'expired' | 'canceled'
  accessState: AccessState
  startsAt: string
  endsAt: string | null
  graceDays: number
  graceEndsAt: string | null
  daysLeft: number | null
  limitOverrides: PlanLimits | null
  effectiveLimits: PlanLimits | null
  autoRenew: boolean
  canceledAt: string | null
  notes: string | null
  createdAt: string
}

export type UsageRow = {
  key: string
  label: string
  used: number
  limit: number | null
  ratio: number | null
  exceeded: boolean
}

export type Payment = {
  id: string
  method: 'bank_transfer' | 'card' | 'pg' | 'other'
  status: 'confirmed' | 'canceled'
  amountKrw: number
  paidAt: string
  reference: string | null
  memo: string | null
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'void'

export type Invoice = {
  id: string
  invoiceNo: string
  organizationId: string | null
  userId: string | null
  subscriptionId: string | null
  contractId: string | null
  status: InvoiceStatus
  supplyKrw: number
  vatKrw: number
  totalKrw: number
  paidKrw: number
  balanceKrw: number
  items: { lines?: { description: string; quantity: number; unitKrw: number }[]; vatMode?: string } | null
  periodStart: string | null
  periodEnd: string | null
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  voidedAt: string | null
  taxInvoiceNo: string | null
  memo: string | null
  payments: Payment[]
  createdAt: string
  organization?: { id: string; name: string } | null
  user?: { id: string; name: string; email: string } | null
}

export type Contract = {
  id: string
  organizationId: string
  subscriptionId: string | null
  contractNo: string
  title: string
  status: 'draft' | 'sent' | 'signed' | 'active' | 'expired' | 'terminated'
  amountKrw: number
  vatKrw: number
  startsAt: string
  endsAt: string
  signedAt: string | null
  billingContactName: string | null
  billingContactEmail: string | null
  taxInfo: Record<string, string> | null
  hasDocument: boolean
  documentName: string | null
  memo: string | null
  createdAt: string
}

export type OrgBilling = {
  state: AccessState
  canCreate: boolean
  daysLeft: number | null
  subscription: Subscription | null
  plan: Plan | null
  usage: UsageRow[]
  warnings: { key: string; level: 'warning' | 'critical'; message: string }[]
  contracts: Contract[]
  invoices: Invoice[]
  canSeeContracts: boolean
  policy: { grace: string; expired: string }
}

export type MyBilling = {
  plan: Plan | null
  subscription: Subscription | null
  limits: PlanLimits
  usage: {
    aiCallsPerDay: { used: number; limit: number }
    portfoliosPerMonth: { used: number; limit: number | null }
    portfolioPdf: boolean
  }
  invoices: Invoice[]
  upgrade: { available: boolean; message: string }
}

export type SessionInfo = {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  ip: string | null
  userAgent: string | null
  current: boolean
}

/* ------------------------------ Onboarding ----------------------------- */

export type InviteRole = 'admin' | 'manager' | 'member'

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export type OrganizationInvite = {
  id: string
  email: string
  name: string | null
  role: InviteRole
  program: { id: string; title: string } | null
  studentNo: string | null
  department: string | null
  status: InviteStatus
  batchId: string
  invitedBy: { id: string; name: string } | null
  acceptedBy: { id: string; name: string; accountStatus: string } | null
  acceptedAt: string | null
  expiresAt: string
  lastSentAt: string
  sendCount: number
  createdAt: string
}

export type InviteRowInput = {
  email: string
  name?: string | null
  role?: InviteRole
  studentNo?: string | null
  department?: string | null
}

export type InviteRowResult = {
  email: string
  status: 'invited' | 'reinvited' | 'already_member' | 'suspended' | 'invalid'
  inviteId?: string
  inviteUrl?: string
  existingAccount?: boolean
  delivery?: 'sent' | 'logged' | 'failed'
  reason?: string
}

export type BulkInviteResult = {
  batchId: string
  results: InviteRowResult[]
  expiresAt: string
  summary: Record<string, number>
}

export type InvitePreview = {
  organization: { id: string; name: string; type: string }
  program: { id: string; title: string } | null
  role: InviteRole
  email: string
  invitedBy: string | null
  status: string
  expiresAt: string
}

export type InviteAcceptResult = {
  organizationId: string
  organizationName: string
  programId: string | null
  role: string
  /** True when the invite only enrolled the user in a program, without joining the organization. */
  participantOnly: boolean
}

export type OnboardingStep = {
  key: string
  title: string
  description: string
  done: boolean
  count?: number
  pending?: number
  tab: string
}

export type OnboardingChecklist = {
  steps: OnboardingStep[]
  completed: number
  total: number
  nextStep: string | null
}

/* ---------------------------- Support / notices ------------------------ */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export type SupportTicket = {
  id: string
  organization: { id: string; name: string } | null
  requester: { id: string; name: string; email: string | null } | null
  category: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  lastMessageAt: string
  createdAt: string
  messages: { id: string; body: string; isStaff: boolean; author: { id: string | null; name: string } | null; createdAt: string }[]
}

export type Announcement = {
  id: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  audience: 'all' | 'org_admins' | 'organization'
  organizationId: string | null
  publishedAt: string | null
  expiresAt: string | null
  createdAt: string
}

/* ------------------------------- Audit -------------------------------- */

export type AuditLogEntry = {
  id: string
  actorId: string | null
  actorEmail: string | null
  organizationId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  outcome: 'success' | 'denied' | 'failure'
  metadata: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
  requestId: string | null
  createdAt: string
  organization: { id: string; name: string } | null
}

export type AuditPage = { logs: AuditLogEntry[]; nextCursor: string | null; stats?: { denied24h: number } }

/* -------------------------------- Admin -------------------------------- */

export type AdminUserRow = {
  id: string
  email: string
  name: string
  role: 'user' | 'company' | 'institution' | 'admin'
  status: 'active' | 'suspended'
  suspendedAt: string | null
  suspendReason: string | null
  lastLoginAt: string | null
  createdAt: string
  organizations: number
  activeSessions: number
}

export type AdminBillingOrgRow = {
  id: string
  name: string
  type: string
  members: number
  programs: number
  plan: { key: string; name: string } | null
  subscriptionStatus: string | null
  state: AccessState
  endsAt: string | null
  daysLeft: number | null
  outstandingKrw: number
  outstandingInvoices: number
}

export type AdminBillingOrgDetail = {
  organization: { id: string; name: string; type: string; contactEmail?: string | null }
  current: Subscription | null
  usage: UsageRow[]
  usageHistory: { metric: string; day: string; value: number }[]
  subscriptions: Subscription[]
  contracts: Contract[]
  invoices: Invoice[]
}

export type BillingSummary = {
  revenue: { paidThisMonthKrw: number; paidThisYearKrw: number }
  receivables: { outstandingKrw: number; outstandingInvoices: number; overdueInvoices: number }
  organizations: { total: number; byState: Record<AccessState, number>; byPlan: Record<string, number> }
  personalProSubscribers: number
  expiring: { id: string; name: string; plan: string; endsAt: string; daysLeft: number }[]
}

export type OpsRun = {
  id: string
  kind: 'db_backup' | 'restore_drill' | 'file_backup_check' | 'deploy' | 'rollback' | 'incident_drill'
  status: 'started' | 'success' | 'failure' | 'logged'
  environment: string
  startedAt: string
  finishedAt: string | null
  durationSec: number | null
  sizeBytes: number | null
  location: string | null
  message: string | null
  details: Record<string, unknown> | null
}

export type BackupFreshness = {
  lastBackup: OpsRun | null
  lastRestoreDrill: OpsRun | null
  lastFileBackupCheck: OpsRun | null
  lastFailure: OpsRun | null
  backupFresh: boolean
  restoreDrillFresh: boolean
}

type TrafficTotals = { requests: number; errors: number; clientErrors: number; errorRate: number; avgMs: number; p95Ms: number }

export type OpsOverview = {
  app: {
    version: string
    environment: string
    node: string
    pid: number
    uptimeSec: number
    memory: { rss: number; heapUsed: number; heapTotal: number }
    sentry: boolean
    alertsConfigured: boolean
    jobsEnabled: boolean
  }
  host: { hostname: string; loadAvg: number[]; cpus: number; totalMem: number; freeMem: number }
  db: { ok: boolean; latencyMs?: number; sizeBytes?: number; connections?: Record<string, number>; maxConnections?: number; error?: string }
  traffic: { lastHour: TrafficTotals; last24h: TrafficTotals }
  uploads: TrafficTotals & { failureRate: number }
  errors: { open: number }
  ai: { callsToday: number; costTodayUsd: number; costMonthUsd: number; monthlyBudgetUsd: number | null; dailyAlertUsd: number | null }
  users: { active24h: number }
  backups: BackupFreshness
}

export type OpsMetrics = {
  unit: 'minute' | 'hour'
  series: { t: string; requests: number; errors: number; clientErrors: number; avgMs: number; p95Ms: number }[]
  routes: { method: string; route: string; requests: number; errors: number; clientErrors: number; avgMs: number; p95Ms: number; maxMs: number }[]
}

export type ErrorEvent = {
  id: string
  fingerprint: string
  message: string
  stack: string | null
  route: string | null
  method: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  lastUserId: string | null
  lastRequestId: string | null
  resolvedAt: string | null
}

export type OpsUsage = {
  activeUsers: { dau: number; wau: number; mau: number }
  signups: { day: string; count: number }[]
  ai: { day: string; calls: number; costUsd: number }[]
  organizations: { id: string; name: string; evidence7d: number; aiCalls7d: number }[]
}
