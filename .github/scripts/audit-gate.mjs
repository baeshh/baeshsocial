#!/usr/bin/env node
// Fails on high/critical production advisories unless the package is in .github/audit-allowlist.json
// with a reason and a non-expired `expires` date. Usage: node audit-gate.mjs <app dir>
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = process.argv[2] ?? '.'
const allowlist = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'audit-allowlist.json'), 'utf8'))
const allowed = new Map(
  allowlist.filter((entry) => entry.app === appDir || entry.app === '*').map((entry) => [entry.package, entry]),
)

let raw
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: appDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
} catch (error) {
  raw = error.stdout
}
const report = JSON.parse(raw)
const today = new Date().toISOString().slice(0, 10)
const blocking = []
const waived = []

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!['high', 'critical'].includes(vuln.severity)) continue
  const entry = allowed.get(name)
  const titles = vuln.via.map((via) => (typeof via === 'string' ? `via ${via}` : via.title)).join('; ')
  if (entry && entry.expires >= today) waived.push(`${vuln.severity} ${name} — ${entry.reason} (until ${entry.expires})`)
  else blocking.push(`${vuln.severity} ${name}: ${titles}${entry ? ` [allowlist entry expired ${entry.expires}]` : ''}`)
}

for (const line of waived) console.log(`waived  ${line}`)
for (const line of blocking) console.log(`::error::${appDir}: ${line}`)
console.log(`${appDir}: ${blocking.length} blocking, ${waived.length} waived high/critical advisories`)
process.exit(blocking.length ? 1 : 0)
