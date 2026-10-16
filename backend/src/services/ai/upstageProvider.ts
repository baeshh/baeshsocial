import { env } from '../../config/env.js'
import { createOpenAICompatibleProvider } from './openaiCompatible.js'

export function createUpstageProvider(apiKey: string) {
  return createOpenAICompatibleProvider({
    name: 'upstage',
    baseUrl: env.UPSTAGE_BASE_URL,
    apiKey,
    model: env.AI_MODEL ?? 'solar-pro2',
  })
}
