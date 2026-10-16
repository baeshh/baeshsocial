import { execSync } from 'node:child_process'
import pg from 'pg'
import { testDatabaseUrl } from './testDb.js'

export default async function setup() {
  const url = new URL(testDatabaseUrl())
  const database = url.pathname.slice(1)
  const admin = new URL(url)
  admin.pathname = '/postgres'
  admin.search = ''
  const client = new pg.Client({ connectionString: admin.toString() })
  await client.connect()
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${database.replace(/"/g, '')}"`)
  } finally {
    await client.end()
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url.toString() },
  })
}
