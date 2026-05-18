export type AIOutput = {
  summary: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
  matchScore?: number
  generatedText?: string
}

export type AIAnalysis = {
  id: string
  userId: string
  projectId: string | null
  type: 'PROFILE_INSIGHT' | 'PROJECT_INSIGHT' | 'OPPORTUNITY_MATCH' | 'PORTFOLIO_GENERATOR'
  input: Record<string, unknown>
  output: AIOutput
  provider: string
  model: string
  createdAt: string
}

export type AIResponse = {
  analysis: AIAnalysis
  output: AIOutput
}
