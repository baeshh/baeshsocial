import { OpsRunKind } from '@prisma/client'
import { prisma } from '../../config/prisma.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Backups older than this are flagged on the dashboard and by the hourly job. */
export const BACKUP_MAX_AGE_HOURS = 26
export const RESTORE_DRILL_MAX_AGE_DAYS = 35

export function serializeRun(run: Awaited<ReturnType<typeof prisma.opsRun.findFirst>>) {
  if (!run) return null
  return {
    id: run.id,
    kind: run.kind.toLowerCase(),
    status: run.status,
    environment: run.environment,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationSec: run.finishedAt ? Math.round((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000) : null,
    sizeBytes: run.sizeBytes !== null ? Number(run.sizeBytes) : null,
    location: run.location,
    message: run.message,
    details: run.details,
  }
}

export async function backupFreshness() {
  const [lastBackup, lastDrill, lastFileCheck, lastFailure] = await Promise.all([
    prisma.opsRun.findFirst({ where: { kind: OpsRunKind.DB_BACKUP, status: 'success' }, orderBy: { startedAt: 'desc' } }),
    prisma.opsRun.findFirst({ where: { kind: OpsRunKind.RESTORE_DRILL, status: 'success' }, orderBy: { startedAt: 'desc' } }),
    prisma.opsRun.findFirst({ where: { kind: OpsRunKind.FILE_BACKUP_CHECK, status: 'success' }, orderBy: { startedAt: 'desc' } }),
    prisma.opsRun.findFirst({ where: { status: 'failure' }, orderBy: { startedAt: 'desc' } }),
  ])
  const now = Date.now()
  return {
    lastBackup: serializeRun(lastBackup),
    lastRestoreDrill: serializeRun(lastDrill),
    lastFileBackupCheck: serializeRun(lastFileCheck),
    lastFailure: serializeRun(lastFailure),
    backupFresh: Boolean(lastBackup && now - lastBackup.startedAt.getTime() < BACKUP_MAX_AGE_HOURS * HOUR),
    restoreDrillFresh: Boolean(lastDrill && now - lastDrill.startedAt.getTime() < RESTORE_DRILL_MAX_AGE_DAYS * DAY),
  }
}

