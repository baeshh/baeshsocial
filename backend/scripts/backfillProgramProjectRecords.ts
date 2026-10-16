/**
 * Creates the official record (ProgramProjectRecord) for every program project that already has institution
 * history, and finalizes those whose program ended or that left the program. Existing records are not rewritten.
 *
 *   tsx scripts/backfillProgramProjectRecords.ts                           # dry run: report only
 *   tsx scripts/backfillProgramProjectRecords.ts --org <id>                # one organization
 *   tsx scripts/backfillProgramProjectRecords.ts --apply [--confirm-backup] # write; production requires --confirm-backup
 */
import { env } from '../src/config/env.js'
import { prisma } from '../src/config/prisma.js'
import { applyBackfill, findBackfillCandidates } from '../src/services/records/recordBackfill.js'

const args = process.argv.slice(2)
const orgIndex = args.indexOf('--org')
const organizationId = orgIndex >= 0 ? args[orgIndex + 1] : undefined
const apply = args.includes('--apply')

if (apply && env.APP_ENV === 'production' && !args.includes('--confirm-backup')) {
  console.error('Refusing to modify production without --confirm-backup (take a backup with deploy/scripts/backup-db.sh first).')
  process.exit(2)
}

try {
  const candidates = await findBackfillCandidates({ organizationId })
  const create = candidates.filter((row) => row.existing === 'none')
  const finalize = candidates.filter((row) => row.existing === 'active' && row.final)
  console.log(`Program projects with institution history: ${candidates.length}`)
  console.log(`  to create: ${create.length} (${create.filter((row) => row.final).length} as FINAL)`)
  console.log(`  to finalize: ${finalize.length}`)
  console.log(`  unchanged: ${candidates.length - create.length - finalize.length}`)
  for (const row of [...create, ...finalize]) {
    console.log(`  ${row.existing === 'none' ? 'create  ' : 'finalize'} ${row.programTitle} · ${row.projectTitle}${row.final ? ' (FINAL)' : ''}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write the records above.')
  } else {
    const result = await applyBackfill(candidates)
    console.log(`\nCreated ${result.created}, finalized ${result.finalized}. Event trigger: backfill`)
  }
} finally {
  await prisma.$disconnect()
}
