import { env } from '../../config/env.js'

const DEDUPE_MS = 10 * 60 * 1000
const recent = new Map<string, number>()

export type AlertLevel = 'info' | 'warning' | 'critical'

const ICON: Record<AlertLevel, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }

/**
 * Posts to the configured Slack/Discord-compatible webhook. Identical `key`s are suppressed for
 * 10 minutes so an error storm produces one alert. Never throws.
 */
export async function sendAlert(level: AlertLevel, title: string, detail?: string, key = title) {
  const now = Date.now()
  const last = recent.get(key)
  if (last && now - last < DEDUPE_MS) return false
  recent.set(key, now)
  if (recent.size > 500) {
    for (const [k, at] of recent) if (now - at > DEDUPE_MS) recent.delete(k)
  }

  const text = `${ICON[level]} [BAESH ${env.APP_ENV}] ${title}${detail ? `\n${detail.slice(0, 1500)}` : ''}`
  if (!env.ALERT_WEBHOOK_URL) {
    console.warn(`[alert:${level}] ${text}`)
    return false
  }
  try {
    const body = env.ALERT_WEBHOOK_URL.includes('discord.com') ? { content: text } : { text }
    const response = await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch (error) {
    console.error('[alert] webhook failed:', error instanceof Error ? error.message : error)
    return false
  }
}

export function resetAlertDedupe() {
  recent.clear()
}
