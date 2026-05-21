import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'
import { env } from './config/env.js'
import { aiRouter } from './modules/ai/ai.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { opportunitiesRouter } from './modules/opportunities/opportunities.routes.js'
import { profilesRouter } from './modules/profiles/profiles.routes.js'
import { postsRouter } from './modules/posts/posts.routes.js'
import { projectsRouter } from './modules/projects/projects.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { searchRouter } from './modules/search/search.routes.js'
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
  }),
)
app.use(express.json({ limit: '25mb' }))

app.use(seoRouter)

app.use('/api', healthRouter)
app.use('/api/public', publicRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/search', searchRouter)
app.use('/api/profiles', profilesRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/posts', postsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/opportunities', opportunitiesRouter)
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

    console.error(error)
    res.status(500).json({
      message: 'Internal server error',
    })
  },
)
