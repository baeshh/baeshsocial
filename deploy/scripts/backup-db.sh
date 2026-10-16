#!/usr/bin/env bash
# Usage: BAESH_ENV=production [BACKUP_LABEL=scheduled] backup-db.sh
#
# pg_dump (custom format) → sha256 → manifest (row counts, last migration) → S3 (SSE) → OpsRun.
# Retention: S3 lifecycle on the backup bucket (db/ 35 days, monthly/ 1 year; see s3-setup.sh);
# locally only the newest LOCAL_KEEP dumps are kept.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

LABEL="${BACKUP_LABEL:-scheduled}"
BUCKET="${BACKUP_S3_BUCKET:-$(env_value BACKUP_S3_BUCKET)}"
REGION="$(env_value S3_REGION)"; REGION="${REGION:-ap-northeast-2}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-${SHARED_DIR}/backups}"
LOCAL_KEEP="${LOCAL_KEEP:-3}"
DB_URL="$(pg_url)"
[ -n "$DB_URL" ] || die "DATABASE_URL not found in ${ENV_FILE}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="baesh-${BAESH_ENV}-${STAMP}-${LABEL}"
mkdir -p "$LOCAL_DIR"
DUMP="${LOCAL_DIR}/${NAME}.dump"
MANIFEST="${LOCAL_DIR}/${NAME}.json"
START="$(date +%s)"

on_error() {
  report_run db_backup failure "backup ${NAME} failed at line $1" "" "" "{\"label\":\"${LABEL}\"}"
  alert "DB 백업 실패 (${NAME})"
  rm -f "$DUMP" "$MANIFEST"
}
trap 'on_error $LINENO' ERR

log "row counts (pre-dump)"
COUNTS="$(psql "$DB_URL" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT string_agg(format('%s=%s', relname, n), ',' ORDER BY relname) FROM (
  SELECT c.relname, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname), false, true, '')))[1]::text::bigint AS n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind = 'r'
) t;
SQL
)"
LAST_MIGRATION="$(psql "$DB_URL" -At -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1" 2>/dev/null || echo '')"

log "pg_dump → ${DUMP}"
pg_dump --format=custom --compress=6 --no-owner --no-acl --file="$DUMP" "$DB_URL"
pg_restore --list "$DUMP" >/dev/null   # the archive must be readable
SIZE="$(stat -c %s "$DUMP" 2>/dev/null || stat -f %z "$DUMP")"
SHA="$( (sha256sum "$DUMP" 2>/dev/null || shasum -a 256 "$DUMP") | cut -d' ' -f1)"

S3_KEY=""
if [ -n "$BUCKET" ]; then
  S3_KEY="db/${BAESH_ENV}/$(date -u +%Y/%m)/${NAME}.dump"
fi

COUNTS="$COUNTS" NAME="$NAME" LABEL="$LABEL" SHA="$SHA" SIZE="$SIZE" MIG="$LAST_MIGRATION" ENVNAME="$BAESH_ENV" KEY="$S3_KEY" BUCKET="$BUCKET" \
node -e '
  const counts = Object.fromEntries((process.env.COUNTS || "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; }));
  process.stdout.write(JSON.stringify({
    name: process.env.NAME, environment: process.env.ENVNAME, label: process.env.LABEL, createdAt: new Date().toISOString(),
    sha256: process.env.SHA, sizeBytes: Number(process.env.SIZE), lastMigration: process.env.MIG || null,
    s3: process.env.BUCKET ? { bucket: process.env.BUCKET, key: process.env.KEY } : null, rowCounts: counts,
  }, null, 2));
' >"$MANIFEST"

LOCATION="$DUMP"
if [ -n "$BUCKET" ]; then
  log "upload → s3://${BUCKET}/${S3_KEY}"
  aws s3 cp --only-show-errors --region "$REGION" --sse aws:kms "$DUMP" "s3://${BUCKET}/${S3_KEY}"
  aws s3 cp --only-show-errors --region "$REGION" --sse aws:kms "$MANIFEST" "s3://${BUCKET}/${S3_KEY%.dump}.json"
  aws s3 cp --only-show-errors --region "$REGION" --sse aws:kms "$MANIFEST" "s3://${BUCKET}/db/${BAESH_ENV}/latest.json"
  if [ "$(date -u +%d)" = "01" ] && [ "$LABEL" = "scheduled" ]; then
    aws s3 cp --only-show-errors --region "$REGION" --sse aws:kms "s3://${BUCKET}/${S3_KEY}" "s3://${BUCKET}/monthly/${BAESH_ENV}/${NAME}.dump"
    aws s3 cp --only-show-errors --region "$REGION" --sse aws:kms "$MANIFEST" "s3://${BUCKET}/monthly/${BAESH_ENV}/${NAME}.json"
  fi
  LOCATION="s3://${BUCKET}/${S3_KEY}"
else
  log "BACKUP_S3_BUCKET not set — keeping the dump locally only"
fi

ls -1t "$LOCAL_DIR"/baesh-"${BAESH_ENV}"-*.dump 2>/dev/null | tail -n +"$((LOCAL_KEEP + 1))" | while read -r old; do
  rm -f "$old" "${old%.dump}.json"
done

trap - ERR
DURATION=$(( $(date +%s) - START ))
TABLES="$(printf '%s' "$COUNTS" | tr ',' '\n' | grep -c . || true)"
report_run db_backup success "${NAME} (${LABEL})" "$SIZE" "$LOCATION" \
  "{\"sha256\":\"${SHA}\",\"label\":\"${LABEL}\",\"durationSec\":${DURATION},\"tables\":${TABLES},\"lastMigration\":\"${LAST_MIGRATION}\",\"manifest\":\"${MANIFEST}\"}"
log "backup ok: ${LOCATION} (${SIZE} bytes, sha256 ${SHA:0:12}…, ${DURATION}s)"
echo "$MANIFEST"
