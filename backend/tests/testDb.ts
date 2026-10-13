import dotenv from 'dotenv'

dotenv.config({ quiet: true })

/**
 * Integration tests run against a separate database (default: `<dev db>_test` on the same server).
 * The name must contain "test" so a misconfigured URL can never truncate real data.
 */
export function testDatabaseUrl() {
  const explicit = process.env.TEST_DATABASE_URL
  const base = explicit ?? process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public'
  const url = new URL(base)
  if (!explicit) url.pathname = `${url.pathname.replace(/\/$/, '')}_test`
  const name = url.pathname.slice(1)
  if (!/test/i.test(name)) throw new Error(`Refusing to run tests against database "${name}" (name must contain "test").`)
  return url.toString()
}
