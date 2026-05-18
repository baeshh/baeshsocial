export type AIRequest = {
  type: 'profile-insight' | 'project-insight' | 'opportunity-match' | 'portfolio-generator'
  input: Record<string, unknown>
}

export type AIResponse = {
  summary: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
  matchScore?: number
  generatedText?: string
}

export type AIProvider = {
  name: string
  model: string
  generate: (request: AIRequest) => Promise<AIResponse>
}
