import type { AIProvider } from './aiProvider.js'
import { mockProvider } from './mockProvider.js'

export const upstageProvider: AIProvider = {
  name: 'upstage',
  model: 'solar-mini',
  async generate(request) {
    // Phase 8 keeps the provider contract stable. Real Upstage calls can replace this fallback.
    return mockProvider.generate(request)
  },
}
