import { env } from '../../config/env.js'
import type { LlmProvider } from './aiProvider.js'
import { createOpenAIProvider } from './openaiProvider.js'
import { createUpstageProvider } from './upstageProvider.js'

export const mockProvider: LlmProvider = {
  name: 'mock',
  model: 'baesh-rules-v2',
  async complete() {
    throw new Error('The mock provider is handled by each task and never performs HTTP calls.')
  },
}

let cached: LlmProvider | null = null

/** Falls back to the deterministic rule engine when no API key is configured. */
export function getLlmProvider(): LlmProvider {
  if (cached) return cached
  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) cached = createOpenAIProvider(env.OPENAI_API_KEY)
  else if (env.AI_PROVIDER === 'upstage' && env.UPSTAGE_API_KEY) cached = createUpstageProvider(env.UPSTAGE_API_KEY)
  else cached = mockProvider
  return cached
}
