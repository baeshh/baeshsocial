import { env } from '../../config/env.js'
import { createOpenAICompatibleProvider } from './openaiCompatible.js'

export function createOpenAIProvider(apiKey: string) {
  return createOpenAICompatibleProvider({
    name: 'openai',
    baseUrl: env.OPENAI_BASE_URL,
    apiKey,
    model: env.AI_MODEL ?? 'gpt-4o-mini',
  })
}
