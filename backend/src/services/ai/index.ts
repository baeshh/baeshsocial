import { env } from '../../config/env.js'
import type { AIProvider } from './aiProvider.js'
import { mockProvider } from './mockProvider.js'
import { openaiProvider } from './openaiProvider.js'
import { upstageProvider } from './upstageProvider.js'

export function getAIProvider(): AIProvider {
  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) return openaiProvider
  if (env.AI_PROVIDER === 'upstage' && env.UPSTAGE_API_KEY) return upstageProvider
  return mockProvider
}
