import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end suite against a real API and a dedicated database (never the development one).
 * The API server applies migrations and recreates the @e2e.baesh.dev fixture before it starts listening.
 *
 *   npm run e2e            # headless, starts both servers
 *   npm run e2e -- --ui    # interactive
 */
const API_PORT = Number(process.env.E2E_API_PORT ?? 4100)
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174)
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/baesh_e2e?schema=public'
const WEB_URL = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx prisma migrate deploy && npm run e2e:seed && npx tsx src/server.ts',
      cwd: '../backend',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        APP_ENV: 'local',
        PORT: String(API_PORT),
        DATABASE_URL,
        JWT_SECRET: 'e2e-only-secret-0123456789abcdefghijklmnopqrstuv',
        FRONTEND_URL: WEB_URL,
        FRONTEND_URLS: `${WEB_URL},http://127.0.0.1:${WEB_PORT}`,
        RATE_LIMIT_ENABLED: 'false',
        JOBS_ENABLED: 'false',
        AI_PROVIDER: 'mock',
        MAIL_DRIVER: 'log',
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_DIR: './storage/e2e-private',
        MEDIA_LOCAL_DIR: './storage/e2e-media',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: `http://localhost:${API_PORT}/api` },
    },
  ],
})
