export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type LlmCompletion = {
  content: string
  inputTokens: number
  outputTokens: number
  model: string
}

export type LlmCallOptions = { maxTokens: number; temperature: number; signal: AbortSignal }

export type LlmProvider = {
  name: 'openai' | 'upstage' | 'mock'
  model: string
  complete: (messages: LlmMessage[], options: LlmCallOptions) => Promise<LlmCompletion>
}

export type LlmErrorCode = 'rate_limited' | 'server_error' | 'timeout' | 'auth' | 'bad_request' | 'network'

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }

  get retryable() {
    return this.code === 'rate_limited' || this.code === 'server_error' || this.code === 'timeout' || this.code === 'network'
  }
}
