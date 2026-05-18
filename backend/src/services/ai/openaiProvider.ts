import type { AIProvider } from './aiProvider.js'
import { mockProvider } from './mockProvider.js'

export const openaiProvider: AIProvider = {
  name: 'openai',
  model: 'gpt-4o-mini',
  async generate(request) {
    // Phase 8 keeps the provider contract stable. Real OpenAI calls can replace this fallback.
    return mockProvider.generate(request)
  },
}
