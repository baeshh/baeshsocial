#!/usr/bin/env bash
# Usage: BAESH_ENV=production restore-drill.sh [manifest.json | s3://bucket/key.json]
#
# Restores the latest (or given) backup into a throwaway database and proves it is usable:
# checksum → pg_restore → migration level → row counts vs manifest → critical tables present.
# Records the recovery time (RTO) as an OpsRun. Point RESTORE_ADMIN_URL at a separate drill
# instance to keep the drill off the production server (default: same server, scratch DB).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

SOURCE="${1:-}"
BUCKET="${BACKUP_S3_BUCKET:-$(env_value BACKUP_S3_BUCKET)}"
REGION="$(env_value S3_REGION)"; REGION="${REGION:-ap-northeast-2}"
WORK="$(mktemp -d)"
SCRATCH_DB="baesh_restore_drill_$(date -u +%Y%m%d%H%M%S)"
ADMIN_URL="${RESTORE_ADMIN_URL:-$(pg_url | sed -E 's#/[^/?]+(\?|$)#/postgres\1#')}"
SCRATCH_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/postgres(\\?|$)#/${SCRATCH_DB}\\1#")"
START="$(date +%s)"
CRITICAL_TABLES="User Organization OrganizationMember Program Project ProjectEvidence EvidenceFile VerifiedRecord AuditLog Subscription Invoice"

cleanup() {
  if [ "${KEEP_DRILL_DB:-0}" != "1" ]; then
    psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\"" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

fail() {
  report_run restore_drill failure "$1" "" "" "{\"scratchDb\":\"${SCRATCH_DB}\"}"
  alert "복원 훈련 실패: $1"
  die "$1"
}

# 1. Locate the manifest + dump
if [ -z "$SOURCE" ]; then
  if [ -n "$BUCKET" ]; then SOURCE="s3://${BUCKET}/db/${BAESH_ENV}/latest.json"
  else SOURCE="$(ls -1t "${BACKUP_LOCAL_DIR:-${SHARED_DIR}/backups}"/baesh-"${BAESH_ENV}"-*.json 2>/dev/null | head -n1 || true)"; fi
fi
[ -n "$SOURCE" ] || fail "no backup manifest found"
log "manifest: ${SOURCE}"
if [[ "$SOURCE" == s3://* ]]; then
  aws s3 cp --only-show-errors --region "$REGION" "$SOURCE" "$WORK/manifest.json" || fail "cannot download manifest"
  KEY="$(node -e 'const m=require(process.argv[1]);process.stdout.write(m.s3?`s3://${m.s3.bucket}/${m.s3.key}`:"")' "$WORK/manifest.json")"
  aws s3 cp --only-show-errors --region "$REGION" "$KEY" "$WORK/backup.dump" || fail "cannot download dump"
else
  cp "$SOURCE" "$WORK/manifest.json"
  cp "${SOURCE%.json}.dump" "$WORK/backup.dump" || fail "dump next to manifest not found"
fi

# 2. Integrity
EXPECTED_SHA="$(node -e 'process.stdout.write(require(process.argv[1]).sha256)' "$WORK/manifest.json")"
ACTUAL_SHA="$( (sha256sum "$WORK/backup.dump" 2>/dev/null || shasum -a 256 "$WORK/backup.dump") | cut -d' ' -f1)"
[ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] || fail "checksum mismatch (expected ${EXPECTED_SHA:0:12}, got ${ACTUAL_SHA:0:12})"
log "checksum ok"

# 3. Restore into a scratch database
psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${SCRATCH_DB}\"" >/dev/null || fail "cannot create scratch database"
psql "$SCRATCH_URL" -q -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' >/dev/null 2>&1 || true
pg_restore --no-owner --no-acl --exit-on-error --dbname="$SCRATCH_URL" "$WORK/backup.dump" || fail "pg_restore failed"
RESTORED_AT="$(date +%s)"
log "restored into ${SCRATCH_DB} in $((RESTORED_AT - START))s"

# 4. Verify
EXPECTED_MIGRATION="$(node -e 'process.stdout.write(require(process.argv[1]).lastMigration||"")' "$WORK/manifest.json")"
ACTUAL_MIGRATION="$(psql "$SCRATCH_URL" -At -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1")"
[ "$EXPECTED_MIGRATION" = "$ACTUAL_MIGRATION" ] || fail "migration level mismatch (${EXPECTED_MIGRATION} vs ${ACTUAL_MIGRATION})"

RESTORED_COUNTS="$(psql "$SCRATCH_URL" -At <<'SQL'
SELECT string_agg(format('%s=%s', relname, n), ',' ORDER BY relname) FROM (
  SELECT c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r'
) t;
SQL
)"

# Counts in the manifest are taken just before pg_dump starts; rows written in between are
# legitimate, so restored >= expected passes and only a shortfall above 1% (or a missing table) fails.
VERIFY="$(RESTORED="$RESTORED_COUNTS" CRITICAL="$CRITICAL_TABLES" node -e '
  const m = require(process.argv[1]);
  const restored = Object.fromEntries(process.env.RESTORED.split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; }));
  const problems = [];
  for (const [table, expected] of Object.entries(m.rowCounts || {})) {
    if (!(table in restored)) { problems.push(`${table}: missing`); continue; }
    if (restored[table] < expected && expected - restored[table] > Math.max(1, expected * 0.01)) problems.push(`${table}: ${restored[table]} < ${expected}`);
  }
  for (const table of process.env.CRITICAL.split(" ")) if (!(table in restored)) problems.push(`${table}: critical table missing`);
  const total = Object.values(restored).reduce((a, b) => a + b, 0);
  process.stdout.write(JSON.stringify({ problems, tables: Object.keys(restored).length, rows: total, users: restored.User ?? 0 }));
' "$WORK/manifest.json")"
PROBLEMS="$(printf '%s' "$VERIFY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).problems.join("; ")))')"
[ -z "$PROBLEMS" ] || fail "verification failed: ${PROBLEMS}"

END="$(date +%s)"
RTO=$((END - START))
BACKUP_NAME="$(node -e 'process.stdout.write(require(process.argv[1]).name)' "$WORK/manifest.json")"
BACKUP_AT="$(node -e 'process.stdout.write(require(process.argv[1]).createdAt)' "$WORK/manifest.json")"
DETAILS="$(VERIFY="$VERIFY" node -e '
  const v = JSON.parse(process.env.VERIFY);
  process.stdout.write(JSON.stringify({ ...v, rtoSeconds: Number(process.argv[1]), restoreSeconds: Number(process.argv[2]), backup: process.argv[3], backupCreatedAt: process.argv[4], migration: process.argv[5], scratchDb: process.argv[6] }));
' "$RTO" "$((RESTORED_AT - START))" "$BACKUP_NAME" "$BACKUP_AT" "$ACTUAL_MIGRATION" "$SCRATCH_DB")"
report_run restore_drill success "restored ${BACKUP_NAME} in ${RTO}s" "" "$SOURCE" "$DETAILS"
log "restore drill ok: ${BACKUP_NAME} → ${SCRATCH_DB}, RTO ${RTO}s, ${VERIFY}"
