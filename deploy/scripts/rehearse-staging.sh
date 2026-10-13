#!/usr/bin/env bash
# Staging deploy rehearsal on a disposable Linux host (CI runner), using the real release scripts:
#   base release + seed data → package-release.sh → deploy.sh (migrate, switch, health) → data checks
#   → broken release (must auto-roll back) → second release → rollback.sh → backup-db.sh
#
# Usage: REHEARSAL_DATABASE_URL=postgresql://user:pass@host:5432/baesh_rehearsal rehearse-staging.sh <base-ref>
# Never run it on a real server: it recreates the database and starts PM2 processes.
set -euo pipefail
BASE="${1:?base git ref required (e.g. origin/main)}"
DB_URL="${REHEARSAL_DATABASE_URL:?REHEARSAL_DATABASE_URL required}"
DB_NAME="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.slice(1))' "$DB_URL")"
[[ "$DB_NAME" == *rehearsal* ]] || { echo "database name must contain 'rehearsal' (got ${DB_NAME})"; exit 2; }
command -v pm2 >/dev/null || { echo "pm2 is required (npm i -g pm2)"; exit 2; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${REHEARSAL_WORK:-$(mktemp -d)}"
mkdir -p "$WORK"
export BAESH_ENV=staging
export BAESH_ROOT="${WORK}/srv/baesh/staging"
. "$ROOT/deploy/scripts/lib.sh"
PORT=4100
API="http://127.0.0.1:${PORT}/api"
SHA="$(git -C "$ROOT" rev-parse HEAD)"
PG_URL="$(printf '%s' "$DB_URL" | sed -E 's/schema=[^&]*&?//; s/[?&]$//')"
ADMIN_URL="$(node -e 'const u=new URL(process.argv[1]);u.pathname="/postgres";u.search="";process.stdout.write(u.toString())' "$DB_URL")"

cleanup() {
  pm2 delete "baesh-api-${BAESH_ENV}" >/dev/null 2>&1 || true
  git -C "$ROOT" worktree remove --force "$WORK/base" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { printf '\n=== %s ===\n' "$*"; }
pass() { echo "PASS  $*"; }
fail_check() { echo "::error::FAIL  $*"; exit 1; }
row_counts() {
  psql "$PG_URL" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT relname || '=' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE ns.nspname = 'public' AND c.relkind = 'r' AND relname <> '_prisma_migrations' ORDER BY relname;
SQL
}
live_version() { curl -fsS -m 5 "$API/health/ready" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).version||""))'; }
current_release() { basename "$(readlink -f "$CURRENT_LINK")"; }
# deploy_bundle <tgz> <version>: the same remote steps as .github/workflows/_deploy.yml
deploy_bundle() {
  local stage
  stage="$(mktemp -d)"
  tar -xzf "$1" -C "$stage" ./deploy
  ALLOW_DESTRUCTIVE_MIGRATION=false "$stage/deploy/scripts/deploy.sh" "$1" "$2"
}
# repack <src.tgz> <dst.tgz> [break]: same build under another version; "break" makes the API exit at startup
repack() {
  local dir
  dir="$(mktemp -d)"
  tar -xzf "$1" -C "$dir"
  if [ "${3:-}" = "break" ]; then
    printf 'console.error("rehearsal: intentionally broken release");\nprocess.exit(1);\n' >"$dir/backend/dist/src/server.js"
  fi
  tar -czf "$2" -C "$dir" .
}

step "1. Recreate ${DB_NAME} and run the base release (${BASE}) with seed data"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS \"${DB_NAME}\" WITH (FORCE)" -c "CREATE DATABASE \"${DB_NAME}\""
git -C "$ROOT" worktree add --detach "$WORK/base" "$BASE" >/dev/null
(
  cd "$WORK/base/backend"
  npm ci --no-audit --no-fund --loglevel=error
  npx prisma generate >/dev/null
  DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null
  DATABASE_URL="$DB_URL" npx tsx prisma/seed.ts >/dev/null
)
row_counts >"$WORK/before.txt"
BASE_MIGRATIONS="$(psql "$PG_URL" -At -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
pass "base seeded: $(wc -l <"$WORK/before.txt") tables, ${BASE_MIGRATIONS} migrations applied"

step "2. Shared env file (what render-env.sh would produce from SSM)"
mkdir -p "$SHARED_DIR"
umask 077
cat >"$ENV_FILE" <<EOF
DATABASE_URL=${DB_URL}
JWT_SECRET=$(openssl rand -hex 32)
OPS_INGEST_TOKEN=$(openssl rand -hex 24)
FRONTEND_URL=https://staging.rehearsal.invalid
STORAGE_DRIVER=s3
S3_BUCKET=baesh-rehearsal-no-such-bucket
S3_REGION=ap-northeast-2
MEDIA_PUBLIC_BASE_URL=https://media.rehearsal.invalid
PORT=${PORT}
TRUST_PROXY=1
JOBS_ENABLED=false
MAIL_DRIVER=log
AI_PROVIDER=mock
EOF
umask 022
pass "wrote ${ENV_FILE} (production config validation applies: NODE_ENV=production via PM2)"

step "3. Package release ${SHA:0:12}"
VITE_API_URL="https://staging-api.rehearsal.invalid/api" bash "$ROOT/deploy/scripts/package-release.sh" "$SHA" "$WORK/release.tgz" >/dev/null
pass "release.tgz $(du -h "$WORK/release.tgz" | cut -f1)"

step "4. First deploy (migrate existing data → switch → health)"
deploy_bundle "$WORK/release.tgz" "$SHA"
[ "$(live_version)" = "$SHA" ] || fail_check "live version is not ${SHA}"
pass "deploy.sh succeeded and /health/ready reports ${SHA:0:12}"

EXPECTED_MIGRATIONS="$(find "$ROOT/backend/prisma/migrations" -name migration.sql | wc -l | tr -d ' ')"
APPLIED="$(psql "$PG_URL" -At -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')"
[ "$APPLIED" = "$EXPECTED_MIGRATIONS" ] || fail_check "applied migrations ${APPLIED} != ${EXPECTED_MIGRATIONS}"
pass "all ${APPLIED} migrations applied ($((APPLIED - BASE_MIGRATIONS)) new)"

row_counts >"$WORK/after.txt"
while IFS='=' read -r table before; do
  after="$(grep -E "^${table}=" "$WORK/after.txt" | cut -d= -f2 || true)"
  [ -n "$after" ] && [ "$after" -ge "$before" ] || fail_check "${table}: ${before} rows before deploy, ${after:-missing} after"
done <"$WORK/before.txt"
pass "no rows lost in $(wc -l <"$WORK/before.txt") pre-existing tables"

TOKEN="$(curl -fsS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"demo@baesh.dev","password":"password123"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).token||""))')"
[ -n "$TOKEN" ] || fail_check "seeded account from the base release cannot log in"
for path in /auth/me /users/me /posts /projects /notifications /organizations/me /programs/discover /programs/participating; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${TOKEN}" "$API$path")"
  [ "$code" = "200" ] || fail_check "GET ${path} returned ${code}"
done
code="$(curl -s -o /dev/null -w '%{http_code}' "$API/auth/me")"
[ "$code" = "401" ] || fail_check "/auth/me without token returned ${code}"
pass "base-release account logs in; 8 endpoints 200, unauthenticated 401"

step "5. Broken release must roll back automatically"
repack "$WORK/release.tgz" "$WORK/broken.tgz" break
if deploy_bundle "$WORK/broken.tgz" "broken-${SHA:0:7}"; then fail_check "broken release was reported as deployed"; fi
[ "$(current_release)" = "$SHA" ] || fail_check "current points to $(current_release) after failed deploy"
[ "$(live_version)" = "$SHA" ] || fail_check "API not serving ${SHA} after auto rollback"
[ ! -d "$RELEASES_DIR/broken-${SHA:0:7}" ] || fail_check "failed release left in releases/ (rollback.sh could pick it)"
pass "deploy.sh failed, switched back to ${SHA:0:12}, failed release quarantined"

step "6. Second release, then manual rollback.sh"
SECOND="${SHA:0:12}-r2"
repack "$WORK/release.tgz" "$WORK/second.tgz"
deploy_bundle "$WORK/second.tgz" "$SECOND"
[ "$(live_version)" = "$SECOND" ] || fail_check "second release not live"
"$CURRENT_LINK/deploy/scripts/rollback.sh"
[ "$(current_release)" = "$SHA" ] && [ "$(live_version)" = "$SHA" ] || fail_check "rollback.sh did not restore ${SHA}"
pass "rollback.sh restored ${SHA:0:12} from ${SECOND}"
if "$ROOT/deploy/scripts/deploy.sh" "$WORK/release.tgz" "$SHA" 2>/dev/null; then fail_check "redeploying the live version was allowed"; fi
[ "$(live_version)" = "$SHA" ] || fail_check "API down after refused redeploy"
pass "redeploying the live version is refused and the API keeps serving"

step "7. Database backup (local dump; S3 upload needs BACKUP_S3_BUCKET)"
MANIFEST="$(BACKUP_LABEL=rehearsal "$ROOT/deploy/scripts/backup-db.sh" | tail -n1)"
DUMP="${MANIFEST%.json}.dump"
[ -s "$DUMP" ] && pg_restore --list "$DUMP" >/dev/null || fail_check "backup dump missing or unreadable"
pass "backup-db.sh wrote $(du -h "$DUMP" | cut -f1) dump with manifest $(basename "$MANIFEST")"

printf '\nStaging rehearsal passed for %s (base %s)\n' "${SHA:0:12}" "$BASE"
