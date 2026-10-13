import cors from 'cors'
import express from 'express'
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

export const app = express()
const allowedOrigins = Array.from(
  new Set([env.FRONTEND_URL, ...env.FRONTEND_URLS.split(',').map((origin) => origin.trim())]),
)

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
    exposedHeaders: ['Content-Disposition'],
  }),
)
app.use(express.json({ limit: '25mb' }))

if (env.STORAGE_DRIVER === 'local') {
  app.use('/media', express.static(mediaLocalRoot, mediaStaticOptions))
}

app.use(seoRouter)

app.use('/api', healthRouter)
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
app.use('/api/programs', programsRouter)
app.use('/api/evidence', evidenceRouter)
app.use('/api/evidence-files', evidenceFilesRouter)
app.use('/api/files', localFilesRouter)
app.use('/api/posts', postsRouter)
app.use('/api/media', mediaRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/opportunities', opportunitiesRouter)
app.use('/api/organizations', organizationsRouter)
app.use('/api/admin/organizations', organizationAdminRouter)
app.use('/api/admin/ai', aiAdminRouter)
app.use('/api/ai', aiRouter)

app.use((_req, res) => {
  res.status(404).json({
    message: 'Route not found',
  })
})

app.use(
  (
    error: unknown,
    _req: express.Request,
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
      res.status(error.status).json({ message: error.message, ...(error.details ? { details: error.details } : {}) })
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

    console.error(error)
    res.status(500).json({
      message: 'Internal server error',
    })
  },
)
