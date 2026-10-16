import { env } from '../../config/env.js'

/**
 * USD per 1M tokens. List prices change; these are estimates for cost tracking and can be
 * overridden with AI_PRICE_INPUT_PER_1M / AI_PRICE_OUTPUT_PER_1M.
 */
const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'solar-pro2': { input: 0.15, output: 0.6 },
  'solar-pro': { input: 0.25, output: 0.25 },
  'solar-mini': { input: 0.15, output: 0.15 },
}

export function priceFor(model: string) {
  if (env.AI_PRICE_INPUT_PER_1M !== undefined && env.AI_PRICE_OUTPUT_PER_1M !== undefined) {
    return { input: env.AI_PRICE_INPUT_PER_1M, output: env.AI_PRICE_OUTPUT_PER_1M }
  }
  const key = Object.keys(PRICE_TABLE)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(name))
  return key ? PRICE_TABLE[key] : { input: 0, output: 0 }
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number) {
  const price = priceFor(model)
  return Math.round(((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * 1e6) / 1e6
}
