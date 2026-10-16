import { LlmError, type LlmProvider } from './aiProvider.js'

/** Removes anything that looks like a credential before an upstream message is logged or returned. */
export function redactSecrets(text: string) {
  return text
    .replace(/(sk|up)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 300)
}

type ChatCompletionResponse = {
  model?: string
  choices?: { message?: { content?: string | null } }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** OpenAI and Upstage Solar both expose the Chat Completions contract with JSON mode. */
export function createOpenAICompatibleProvider(config: {
  name: 'openai' | 'upstage'
  baseUrl: string
  apiKey: string
  model: string
}): LlmProvider {
  return {
    name: config.name,
    model: config.model,
    async complete(messages, options) {
      let response: Response
      try {
        response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            response_format: { type: 'json_object' },
          }),
          signal: options.signal,
        })
      } catch (error) {
        if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
          throw new LlmError('timeout', 'LLM request timed out')
        }
        throw new LlmError('network', redactSecrets((error as Error).message))
      }

      if (!response.ok) {
        const body = redactSecrets(await response.text().catch(() => ''))
        const code =
          response.status === 429
            ? 'rate_limited'
            : response.status >= 500
              ? 'server_error'
              : response.status === 401 || response.status === 403
                ? 'auth'
                : 'bad_request'
        throw new LlmError(code, `LLM HTTP ${response.status}: ${body}`, response.status)
      }

      const data = (await response.json()) as ChatCompletionResponse
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new LlmError('server_error', 'LLM returned an empty response')
      return {
        content,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
        model: data.model ?? config.model,
      }
    },
  }
}
