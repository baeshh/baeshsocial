import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { ZodError } from 'zod'
import { env } from './config/env.js'
import {
  evidenceFilesRouter,
  evidenceRouter,
  localFilesRouter,
  projectEvidenceRouter,
} from './modules/evidence/evidence.routes.js'
import { organizationProgramsRouter, programsRouter } from './modules/programs/programs.routes.js'
import { verifiedRecordsRouter } from './modules/verification/verifiedRecords.routes.js'
import { organizationReportsRouter } from './modules/reports/reports.routes.js'
import { talentRouter } from './modules/matching/matching.routes.js'
import { aiAdminRouter } from './modules/ai/aiAdmin.routes.js'
import { HttpError } from './utils/httpError.js'
import { aiRouter } from './modules/ai/ai.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { opportunitiesRouter } from './modules/opportunities/opportunities.routes.js'
import { profilesRouter } from './modules/profiles/profiles.routes.js'
import { postsRouter } from './modules/posts/posts.routes.js'
import { projectsRouter } from './modules/projects/projects.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { organizationAdminRouter } from './modules/organizations/organizationAdmin.routes.js'
import { organizationsRouter } from './modules/organizations/organizations.routes.js'
import { mediaRouter } from './modules/media/media.routes.js'
import { searchRouter } from './modules/search/search.routes.js'
import { mediaLocalRoot, mediaStaticOptions } from './services/storage/mediaStorage.js'
import { usersRouter } from './modules/users/users.routes.js'
import { healthRouter } from './routes/health.route.js'
import { publicRouter } from './routes/public.routes.js'
import { seoRouter } from './modules/seo/seo.routes.js'
import { adminAuditRouter, organizationAuditRouter } from './modules/admin/audit.routes.js'
import { organizationProjectRecordsRouter } from './modules/records/projectRecords.routes.js'
import { adminUsersRouter } from './modules/admin/adminUsers.routes.js'
import { billingRouter, organizationBillingRouter } from './modules/billing/billing.routes.js'
import { billingAdminRouter } from './modules/billing/billingAdmin.routes.js'
import { invitesRouter, organizationInvitesRouter } from './modules/onboarding/invites.routes.js'
import { organizationOnboardingRouter } from './modules/onboarding/onboarding.routes.js'
import { opsAdminRouter, opsIngestRouter } from './modules/ops/ops.routes.js'
import { announcementsAdminRouter, announcementsRouter } from './modules/support/announcements.routes.js'
import { supportAdminRouter, supportRouter } from './modules/support/support.routes.js'
import { limits } from './middlewares/rateLimit.js'
import { captureError } from './services/ops/errors.js'
import { requestId, requestMetrics } from './services/ops/metrics.js'

export const app = express()
app.disable('x-powered-by')
app.set('trust proxy', env.TRUST_PROXY)
const allowedOrigins = Array.from(
  new Set([env.FRONTEND_URL, ...env.FRONTEND_URLS.split(',').map((origin) => origin.trim())]),
)

app.use(requestId)
app.use(
  helmet({
    // The API also serves SEO HTML and signed media; a strict CSP lives on the frontend host (nginx).
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  }),
)
app.use(requestMetrics)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`CORS origin not allowed: ${origin}`))
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'Retry-After', 'RateLimit-Remaining'],
  }),
)
app.use(express.json({ limit: '25mb' }))

if (env.STORAGE_DRIVER === 'local') {
  app.use('/media', express.static(mediaLocalRoot, mediaStaticOptions))
}

app.use(seoRouter)

app.use('/api', healthRouter)
app.use('/api/ops', opsIngestRouter)
app.use('/api', limits.global)
app.use('/api/public', publicRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/search', searchRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/projects/:projectId/evidence', projectEvidenceRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/organizations/:orgId/programs', organizationProgramsRouter)
app.use('/api/organizations/:orgId/reports', organizationReportsRouter)
app.use('/api/organizations/:orgId/talent', talentRouter)
app.use('/api/organizations/:orgId/invites', organizationInvitesRouter)
app.use('/api/organizations/:orgId/onboarding', organizationOnboardingRouter)
app.use('/api/organizations/:orgId/billing', organizationBillingRouter)
app.use('/api/organizations/:orgId/audit-logs', organizationAuditRouter)
app.use('/api/organizations/:orgId/project-records', organizationProjectRecordsRouter)
app.use('/api/invites', invitesRouter)
app.use('/api/billing', billingRouter)
app.use('/api/support', supportRouter)
app.use('/api/announcements', announcementsRouter)
app.use('/api/programs', programsRouter)
app.use('/api/evidence', evidenceRouter)
app.use('/api/verified-records', verifiedRecordsRouter)
app.use('/api/evidence-files', evidenceFilesRouter)
app.use('/api/files', localFilesRouter)
app.use('/api/posts', postsRouter)
app.use('/api/media', mediaRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/opportunities', opportunitiesRouter)
app.use('/api/organizations', organizationsRouter)
app.use('/api/admin/organizations', organizationAdminRouter)
app.use('/api/admin/ai', aiAdminRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/audit-logs', adminAuditRouter)
app.use('/api/admin/billing', billingAdminRouter)
app.use('/api/admin/support', supportAdminRouter)
app.use('/api/admin/announcements', announcementsAdminRouter)
app.use('/api/admin/ops', opsAdminRouter)
app.use('/api/ai', aiRouter)

app.use((_req, res) => {
  res.status(404).json({
    message: 'Route not found',
  })
})

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: 'Validation failed',
        issues: error.issues,
      })
      return
    }

    if (error instanceof HttpError) {
      if (error.status >= 500) void captureError(error, req, res)
      res.status(error.status).json({
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        ...(error.status >= 500 ? { requestId: res.locals.requestId } : {}),
      })
      return
    }

    if (error instanceof Error && error.message.startsWith('CORS origin not allowed')) {
      res.status(403).json({ message: 'Origin not allowed' })
      return
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? '파일 크기가 허용 범위를 초과했습니다.'
          : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
            ? '한 번에 올릴 수 있는 파일 수를 초과했습니다.'
            : '파일 업로드 요청이 올바르지 않습니다.'
      res.status(400).json({ message })
      return
    }

    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ message: '요청 본문(JSON) 형식이 올바르지 않습니다.' })
      return
    }

    void captureError(error, req, res)
    res.status(500).json({
      message: 'Internal server error',
      requestId: res.locals.requestId,
    })
  },
)
