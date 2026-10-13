/**
 * Logs in with accounts created by an older release's seed and calls the main read endpoints of this build.
 * Run by checkUpgradePath.ts against the upgraded database; any failed login or non-2xx response exits 1.
 */
import type { AddressInfo } from 'node:net'

const ACCOUNTS = ['demo@baesh.dev', 'company@baesh.dev', 'institution@baesh.dev']
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'password123'
const PATHS = [
  '/api/auth/me',
  '/api/users/me',
  '/api/profiles/me',
  '/api/posts',
  '/api/posts/me',
  '/api/projects',
  '/api/opportunities',
  '/api/notifications',
  '/api/organizations/me',
  '/api/billing/me',
  '/api/verified-records/mine',
  '/api/announcements',
  '/api/programs/discover',
  '/api/programs/participating',
]

const { app } = await import('../src/app.js')
const { prisma } = await import('../src/config/prisma.js')
const server = app.listen(0)
await new Promise<void>((resolve) => server.once('listening', resolve))
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const failures: string[] = []
try {
  for (const email of ACCOUNTS) {
    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    if (!login.ok) {
      failures.push(`${email}: login ${login.status} ${await login.text()}`)
      continue
    }
    const { token } = (await login.json()) as { token: string }
    for (const pathname of PATHS) {
      const response = await fetch(`${origin}${pathname}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) failures.push(`${email}: GET ${pathname} ${response.status} ${(await response.text()).slice(0, 300)}`)
    }
    console.log(`  ${email}: login + ${PATHS.length} endpoints checked`)
  }
} finally {
  server.close()
  await prisma.$disconnect()
}

for (const failure of failures) console.error(`::error::${failure}`)
process.exit(failures.length ? 1 : 0)
