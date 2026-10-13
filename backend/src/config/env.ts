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
})

const parsedEnv = envSchema.parse(process.env)

if (parsedEnv.NODE_ENV === 'production') {
  const secret = parsedEnv.JWT_SECRET
  if (!secret || secret.length < 32 || PLACEHOLDER_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_SECRET must be set to a unique random value of at least 32 characters in production.',
    )
  }
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
