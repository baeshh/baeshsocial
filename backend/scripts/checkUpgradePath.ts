/**
 * Verifies that this branch's migrations upgrade a database created and seeded by an older release
 * without losing rows and without leaving schema drift.
 *
 *   UPGRADE_DATABASE_URL=postgresql://.../baesh_upgrade tsx scripts/checkUpgradePath.ts --base origin/main
 *
 * The database is dropped and recreated, so its name must contain "upgrade".
 * Steps: check out <base> in a temporary worktree → migrate + seed there → migrate with this branch →
 * compare row counts of pre-existing tables → `prisma migrate diff --exit-code` against schema.prisma.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'

const args = process.argv.slice(2)
const base = args[args.indexOf('--base') + 1]
const url = process.env.UPGRADE_DATABASE_URL
if (!args.includes('--base') || !base || !url) {
  console.error('usage: UPGRADE_DATABASE_URL=<scratch db url> checkUpgradePath.ts --base <git-ref>')
  process.exit(2)
}
const database = new URL(url).pathname.slice(1)
if (!/upgrade/i.test(database)) {
  console.error(`Refusing to recreate database "${database}" (name must contain "upgrade").`)
  process.exit(2)
}

const backendDir = path.resolve('.')
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' }
const SMOKE_ENV = {
  JWT_SECRET: 'upgrade-check-secret-0123456789abcdefghijkl',
  APP_ENV: 'local',
  JOBS_ENABLED: 'false',
  RATE_LIMIT_ENABLED: 'false',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: path.join(tmpdir(), 'baesh-upgrade-storage'),
  MEDIA_LOCAL_DIR: path.join(tmpdir(), 'baesh-upgrade-media'),
  MAIL_DRIVER: 'log',
  AI_PROVIDER: 'mock',
}

function run(command: string, commandArgs: string[], cwd: string) {
  console.log(`$ (${path.relative(repoRoot, cwd) || '.'}) ${command} ${commandArgs.join(' ')}`)
  execFileSync(command, commandArgs, { cwd, env, stdio: 'inherit' })
}

async function withClient<T>(connectionString: string, fn: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function recreateDatabase() {
  const admin = new URL(url!)
  admin.pathname = '/postgres'
  admin.search = ''
  const name = database.replace(/"/g, '')
  await withClient(admin.toString(), async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    await client.query(`CREATE DATABASE "${name}"`)
  })
}

async function rowCounts() {
  return withClient(url!, async (client) => {
    const tables = await client.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`,
    )
    const counts = new Map<string, number>()
    for (const { name } of tables.rows) {
      const result = await client.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${name.replace(/"/g, '')}"`)
      counts.set(name, Number(result.rows[0].n))
    }
    return counts
  })
}

const workDir = mkdtempSync(path.join(tmpdir(), 'baesh-upgrade-'))
const baseDir = path.join(workDir, 'base')
let failed = false
try {
  await recreateDatabase()
  run('git', ['worktree', 'add', '--detach', baseDir, base], repoRoot)
  const baseBackend = path.join(baseDir, 'backend')
  run('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], baseBackend)
  run('npx', ['prisma', 'generate'], baseBackend)
  run('npx', ['prisma', 'migrate', 'deploy'], baseBackend)
  if (existsSync(path.join(baseBackend, 'prisma/seed.ts'))) run('npx', ['tsx', 'prisma/seed.ts'], baseBackend)

  const before = await rowCounts()
  const seeded = [...before.values()].reduce((sum, n) => sum + n, 0)
  console.log(`\nBase ${base}: ${before.size} tables, ${seeded} rows seeded`)

  run('npx', ['prisma', 'migrate', 'deploy'], backendDir)
  const after = await rowCounts()
  const lost = [...before].filter(([table, n]) => (after.get(table) ?? 0) < n)
  for (const [table, n] of lost) console.error(`::error::${table}: ${n} rows before upgrade, ${after.get(table) ?? 'table missing'} after`)
  if (lost.length) failed = true
  else console.log(`No rows lost across ${before.size} pre-existing tables (${after.size} tables after upgrade)`)

  try {
    run('npx', ['prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], backendDir)
    console.log('Upgraded database matches prisma/schema.prisma')
  } catch {
    console.error('::error::Upgraded database differs from prisma/schema.prisma (see diff above)')
    failed = true
  }

  try {
    execFileSync('npx', ['tsx', 'scripts/smokeUpgradedApi.ts'], { cwd: backendDir, env: { ...env, ...SMOKE_ENV }, stdio: 'inherit' })
    console.log('Seeded accounts from the base release can log in and read the main endpoints')
  } catch {
    console.error('::error::API smoke test against the upgraded database failed')
    failed = true
  }
} finally {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', baseDir], { cwd: repoRoot, stdio: 'ignore' })
  } catch {
    /* worktree was never created */
  }
  rmSync(workDir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
