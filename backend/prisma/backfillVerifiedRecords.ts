import 'dotenv/config'
import { EvidenceStatus, VerifiedRecordStatus } from '@prisma/client'
import { prisma } from '../src/config/prisma.js'
import { issueVerifiedRecord } from '../src/services/verification/verifiedRecords.js'

/**
 * One-off: freezes a snapshot + hash for verified records issued before snapshots existed.
 * Only records backed by an APPROVED evidence item with a known reviewer are eligible.
 */
async function main() {
  const legacy = await prisma.verifiedRecord.findMany({
    where: { status: VerifiedRecordStatus.VERIFIED, contentHash: null, evidenceId: { not: null } },
    select: {
      id: true,
      evidence: { select: { id: true, status: true, reviewedById: true, reviewedAt: true } },
    },
  })
  let fixed = 0
  let skipped = 0
  for (const record of legacy) {
    const evidence = record.evidence
    if (!evidence || evidence.status !== EvidenceStatus.APPROVED || !evidence.reviewedById || !evidence.reviewedAt) {
      skipped += 1
      continue
    }
    await prisma.$transaction((tx) =>
      issueVerifiedRecord(tx, {
        evidenceId: evidence.id,
        approverId: evidence.reviewedById!,
        approvedAt: evidence.reviewedAt!,
        backfill: true,
      }),
    )
    fixed += 1
  }
  console.log(`verified records backfilled: ${fixed}, skipped: ${skipped}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
