import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public'),
  JWT_SECRET: z.string().min(16).default('local-development-secret-change-me'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  FRONTEND_URLS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  AI_PROVIDER: z.enum(['mock', 'openai', 'upstage']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  UPSTAGE_API_KEY: z.string().optional(),
})

export const env = envSchema.parse(process.env)
