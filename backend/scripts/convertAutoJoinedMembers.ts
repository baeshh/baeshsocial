/**
 * Reverts organization memberships that were created automatically when a user was selected for a
 * program (or accepted a program-only invite) before participants were separated from members.
 * Participant rows, projects and evidence are untouched; only the OrganizationMember row is removed.
 *
 *   tsx scripts/convertAutoJoinedMembers.ts                          # dry run: report only
 *   tsx scripts/convertAutoJoinedMembers.ts --org <id>               # one organization
 *   tsx scripts/convertAutoJoinedMembers.ts --include-program-invites # also program-invite joins (review first:
 *                                                                     # a university may have invited its own students)
 *   tsx scripts/convertAutoJoinedMembers.ts --apply [--confirm-backup] # convert; production requires --confirm-backup
 */
import { env } from '../src/config/env.js'
import { prisma } from '../src/config/prisma.js'
import { convertAutoJoinedMembers, findAutoJoinedMembers } from '../src/services/onboarding/memberConversion.js'

const args = process.argv.slice(2)
const orgIndex = args.indexOf('--org')
const organizationId = orgIndex >= 0 ? args[orgIndex + 1] : undefined
const apply = args.includes('--apply')
const includeProgramInvites = args.includes('--include-program-invites')

if (apply && env.APP_ENV === 'production' && !args.includes('--confirm-backup')) {
  console.error('Refusing to modify production without --confirm-backup (take a backup with deploy/scripts/backup-db.sh first).')
  process.exit(2)
}

try {
  const { candidates, skipped } = await findAutoJoinedMembers(prisma, { organizationId, includeProgramInvites })

  console.log(`Candidates to convert to participant-only: ${candidates.length}`)
  for (const row of candidates) {
    console.log(`  convert  ${row.organizationName} · ${row.email} (${row.source}, joined ${row.joinedAt?.toISOString() ?? '-'}, programs ${row.programIds.length})`)
  }
  console.log(`Kept as members: ${skipped.length}`)
  for (const row of skipped) console.log(`  keep     ${row.organizationName} · ${row.email} (${row.source}): ${row.reason}`)

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to convert the candidates above.')
  } else {
    const converted = await convertAutoJoinedMembers(prisma, candidates, 'system:convertAutoJoinedMembers')
    console.log(`\nConverted ${converted} of ${candidates.length} membership(s). Audit action: org.member_convert_to_participant`)
  }
} finally {
  await prisma.$disconnect()
}
