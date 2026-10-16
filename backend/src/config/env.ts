import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const DEV_JWT_SECRET = 'local-development-secret-change-me'
const PLACEHOLDER_JWT_SECRETS = new Set([DEV_JWT_SECRET, 'replace-with-a-long-random-secret'])

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public'),
  JWT_SECRET: z.string().min(16).optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  FRONTEND_URLS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  AI_PROVIDER: z.enum(['mock', 'openai', 'upstage']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  UPSTAGE_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  UPSTAGE_BASE_URL: z.string().url().default('https://api.upstage.ai/v1'),
  AI_MODEL: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(2000).max(120000).default(30000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).max(10000).default(30),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().optional(),
  AI_PRICE_INPUT_PER_1M: z.coerce.number().min(0).optional(),
  AI_PRICE_OUTPUT_PER_1M: z.coerce.number().min(0).optional(),
  REPORT_RENDER_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(60000),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage/private'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-northeast-2'),
  S3_ENDPOINT: z.string().url().optional(),
  FILE_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  API_PUBLIC_URL: z.string().url().optional(),
  MEDIA_LOCAL_DIR: z.string().default('./storage/media'),
  MEDIA_S3_BUCKET: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  MALWARE_SCAN_REQUIRED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Number of reverse proxies in front of the API (nginx = 1). Needed for correct client IPs. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  /** Sessions unused for this long are signed out. */
  SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 3),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(10).default(300),
  /** enforce: plan limits block new work · warn: limits are reported but not enforced. */
  BILLING_ENFORCEMENT: z.enum(['enforce', 'warn']).default('enforce'),
  /** Trial length for organizations approved without a contract yet. */
  BILLING_TRIAL_DAYS: z.coerce.number().int().min(0).max(365).default(60),
  INVITE_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** log: invitation emails are only logged (links are shown to the admin) · ses: sent via Amazon SES. */
  MAIL_DRIVER: z.enum(['log', 'ses']).default('log'),
  MAIL_FROM: z.string().default('BAESH <no-reply@baesh.kr>'),
  SES_REGION: z.string().default('ap-northeast-2'),
  /** Shared secret that backup/deploy scripts use to report runs to /api/ops/runs. */
  OPS_INGEST_TOKEN: z.string().min(32).optional(),
  /** Slack/Discord-compatible incoming webhook for operational alerts. */
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  /** Alert when today's AI spend exceeds this many USD. */
  AI_DAILY_COST_ALERT_USD: z.coerce.number().positive().optional(),
  SENTRY_DSN: z.string().url().optional(),
  /** Release identifier (git sha) injected by the deploy script. */
  APP_VERSION: z.string().default('dev'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
})

const parsedEnv = envSchema.parse(process.env)

if (parsedEnv.NODE_ENV === 'production') {
  const secret = parsedEnv.JWT_SECRET
  if (!secret || secret.length < 32 || PLACEHOLDER_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET must be set to a unique random value of at least 32 characters in production.',
    )
  }
  const problems: string[] = []
  if (parsedEnv.DATABASE_URL.includes('postgres:postgres@')) problems.push('DATABASE_URL uses the default postgres password')
  if (!parsedEnv.FRONTEND_URL.startsWith('https://')) problems.push('FRONTEND_URL must be https')
  if (parsedEnv.STORAGE_DRIVER !== 's3') problems.push('STORAGE_DRIVER must be s3 (private bucket)')
  if (!parsedEnv.RATE_LIMIT_ENABLED) problems.push('RATE_LIMIT_ENABLED must not be false')
  if (problems.length) throw new Error(`Unsafe production configuration: ${problems.join('; ')}.`)
}

if (parsedEnv.STORAGE_DRIVER === 's3' && !parsedEnv.S3_BUCKET) {
  throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3.')
}

if (parsedEnv.STORAGE_DRIVER === 's3' && !parsedEnv.MEDIA_PUBLIC_BASE_URL) {
  throw new Error('MEDIA_PUBLIC_BASE_URL (CDN origin for public media) is required when STORAGE_DRIVER=s3.')
}

export const env = {
  ...parsedEnv,
  JWT_SECRET: parsedEnv.JWT_SECRET ?? DEV_JWT_SECRET,
}
