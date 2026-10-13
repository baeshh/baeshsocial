import 'dotenv/config'
import { PrismaClient, UserRole } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

// Usage:
//   npm run security:accounts                      -> list privileged accounts (no changes)
//   npm run security:accounts -- --apply           -> lock dev accounts, demote every other privileged account
//   npm run security:accounts -- --apply --keep=a@x.com,b@y.com   -> same, but keep the listed accounts' roles
//   npm run security:accounts -- --grant-admin=a@x.com             -> make an existing account a platform ADMIN
//     (platform admins review organization verification requests)

const DEV_PRIVILEGED_EMAILS = ['admin@baesh.dev', 'institution@baesh.dev', 'company@baesh.dev']

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const keep = new Set(
  (args.find((arg) => arg.startsWith('--keep='))?.slice('--keep='.length) ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
)

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/baesh_v2?schema=public',
  }),
})

async function main() {
  const grantAdmin = args.find((arg) => arg.startsWith('--grant-admin='))?.slice('--grant-admin='.length).trim().toLowerCase()
  if (grantAdmin) {
    if (DEV_PRIVILEGED_EMAILS.includes(grantAdmin)) {
      throw new Error('Public dev accounts cannot be granted ADMIN.')
    }
    const user = await prisma.user.update({ where: { email: grantAdmin }, data: { role: UserRole.ADMIN } })
    console.log(`Granted platform ADMIN: ${user.email}`)
    return
  }

  const privileged = await prisma.user.findMany({
    where: { role: { not: UserRole.USER } },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const devAccounts = await prisma.user.findMany({
    where: { email: { in: DEV_PRIVILEGED_EMAILS } },
    select: { id: true, email: true, role: true },
  })

  console.log(`Privileged accounts (${privileged.length}):`)
  for (const user of privileged) {
    const tag = DEV_PRIVILEGED_EMAILS.includes(user.email)
      ? 'DEV ACCOUNT'
      : keep.has(user.email)
        ? 'KEEP'
        : 'UNAPPROVED'
    console.log(`  [${tag}] ${user.role.padEnd(11)} ${user.email} (${user.name}, ${user.createdAt.toISOString()})`)
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to lock dev accounts and demote unapproved roles.')
    return
  }

  for (const account of devAccounts) {
    await prisma.user.update({
      where: { id: account.id },
      data: {
        role: UserRole.USER,
        password: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
      },
    })
    console.log(`Locked dev account: ${account.email} (role -> USER, password rotated)`)
  }

  const demotable = privileged.filter(
    (user) => !DEV_PRIVILEGED_EMAILS.includes(user.email) && !keep.has(user.email),
  )
  if (demotable.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: demotable.map((user) => user.id) } },
      data: { role: UserRole.USER },
    })
    for (const user of demotable) {
      console.log(`Demoted: ${user.email} (${user.role} -> USER)`)
    }
  }

  console.log('\nDone. Role changes take effect immediately, including for already-issued JWTs.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
