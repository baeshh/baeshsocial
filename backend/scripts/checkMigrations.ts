/**
 * Flags migrations that can lose data (DROP TABLE/COLUMN, TRUNCATE, DELETE, type changes ...).
 *
 *   tsx scripts/checkMigrations.ts --base origin/main   # CI: migrations added on this branch
 *   tsx scripts/checkMigrations.ts --pending            # deploy: migrations not yet applied to DATABASE_URL
 *
 * A flagged migration passes only if it contains the line `-- baesh:allow-destructive <reason>`
 * AND (for --pending) ALLOW_DESTRUCTIVE_MIGRATION=true is set by the approved production workflow.
 * Exit code 0 = safe, 1 = blocked, 2 = usage error.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import 'dotenv/config'

const MIGRATIONS_DIR = path.resolve('prisma/migrations')
const MARKER = /^--\s*baesh:allow-destructive\b(.*)$/m

const RULES: { pattern: RegExp; label: string }[] = [
  { pattern: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { pattern: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { pattern: /\bDROP\s+SCHEMA\b/i, label: 'DROP SCHEMA' },
  { pattern: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
  { pattern: /\bDELETE\s+FROM\b/i, label: 'DELETE FROM' },
  { pattern: /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, label: 'column type change' },
  { pattern: /\bRENAME\s+(COLUMN|TO)\b/i, label: 'rename (breaks the previous release during rollout)' },
  { pattern: /\bALTER\s+TYPE\s+"?\w+"?\s+RENAME\s+VALUE\b/i, label: 'enum value rename' },
  { pattern: /\bDROP\s+TYPE\b/i, label: 'DROP TYPE (enum)' },
]

function stripComments(sql: string) {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function analyse(name: string) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
  const body = stripComments(sql)
  const findings = RULES.filter((rule) => rule.pattern.test(body)).map((rule) => rule.label)
  const marker = sql.match(MARKER)
  return { name, findings, approvedReason: marker ? marker[1].trim() || '(no reason given)' : null }
}

async function pendingMigrations() {
  const all = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const table = await client.query(`SELECT to_regclass('public._prisma_migrations') AS t`)
    if (!table.rows[0].t) return all
    const applied = await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)
    const done = new Set(applied.rows.map((row) => row.migration_name as string))
    return all.filter((name) => !done.has(name))
  } finally {
    await client.end()
  }
}

function addedSince(base: string) {
  const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', 'prisma/migrations'], {
    encoding: 'utf8',
  })
  return [...new Set(output.split('\n').filter((line) => line.endsWith('migration.sql')).map((line) => line.split('/').at(-2)!))].sort()
}

const args = process.argv.slice(2)
const baseIndex = args.indexOf('--base')
let names: string[]
if (baseIndex >= 0 && args[baseIndex + 1]) names = addedSince(args[baseIndex + 1])
else if (args.includes('--pending')) names = await pendingMigrations()
else {
  console.error('usage: checkMigrations.ts --base <git-ref> | --pending')
  process.exit(2)
}

const allowFlag = process.env.ALLOW_DESTRUCTIVE_MIGRATION === 'true'
let blocked = false
console.log(`Checking ${names.length} migration(s)${names.length ? `: ${names.join(', ')}` : ''}`)
for (const result of names.map(analyse)) {
  if (result.findings.length === 0) {
    console.log(`  ok        ${result.name}`)
    continue
  }
  const needsFlag = args.includes('--pending')
  const approved = result.approvedReason !== null && (!needsFlag || allowFlag)
  console.log(`  ${approved ? 'approved' : 'BLOCKED '}  ${result.name}: ${result.findings.join(', ')}${result.approvedReason ? ` — marker: ${result.approvedReason}` : ''}`)
  if (!approved) blocked = true
}

if (blocked) {
  console.error(
    '\nDestructive migration detected. Add `-- baesh:allow-destructive <reason>` after review, take a backup, ' +
      'and run the production workflow with allow_destructive_migration=true. Prefer expand/contract (add new → backfill → drop in a later release).',
  )
  process.exit(1)
}
