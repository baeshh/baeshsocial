import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './tests/testDb.js'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: 'test-only-secret-0123456789abcdefghijklmnop',
      APP_ENV: 'local',
      JOBS_ENABLED: 'false',
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_GLOBAL_PER_MIN: '100000',
      BILLING_ENFORCEMENT: 'enforce',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: './storage/test-private',
      MEDIA_LOCAL_DIR: './storage/test-media',
      MAIL_DRIVER: 'log',
      AI_PROVIDER: 'mock',
      OPS_INGEST_TOKEN: 'test-ops-token-0123456789abcdefghijklmnop',
    },
  },
})
