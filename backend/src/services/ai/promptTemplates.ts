import type { AIRequest } from './aiProvider.js'

export function buildPrompt(request: AIRequest) {
  return {
    system:
      'You are BAESH AI Copilot. Analyze structured project career data and return concise career guidance.',
    user: JSON.stringify(request.input),
  }
}
