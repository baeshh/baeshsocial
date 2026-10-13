#!/usr/bin/env bash
# Usage: BAESH_ENV=staging|production deploy.sh <release.tgz> <version>
#
# 1. unpack into releases/<version>   2. install prod deps, prisma generate
# 3. (production) backup the DB        4. block destructive migrations unless approved
# 5. prisma migrate deploy             6. switch `current` atomically, reload PM2
# 7. health + version check → on failure switch back to the previous release and alert
#
# Migrations are expand-only by policy (destructive ones need explicit approval), so the previous
# release keeps working against the migrated schema and code rollback is always DB-compatible.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

TARBALL="${1:?release tarball path required}"
VERSION="${2:?version (git sha) required}"
RELEASE_DIR="${RELEASES_DIR}/${VERSION}"
STARTED_AT="$(date +%s)"

[ -f "$ENV_FILE" ] || die "missing ${ENV_FILE} (run render-env.sh first)"
mkdir -p "$RELEASES_DIR" "$SHARED_DIR/storage/private" "$SHARED_DIR/storage/media" "$SHARED_DIR/logs"

PREVIOUS=""
if [ -L "$CURRENT_LINK" ]; then PREVIOUS="$(readlink -f "$CURRENT_LINK")"; fi

fail() {
  local reason="$1"
  log "deploy failed: ${reason}"
  report_run deploy failure "${VERSION}: ${reason}" "" "" "{\"version\":\"${VERSION}\"}"
  alert "배포 실패 ${VERSION}: ${reason}"
  exit 1
}

log "deploying ${VERSION} to ${BAESH_ENV} (previous: ${PREVIOUS:-none})"

rm -rf "$RELEASE_DIR.tmp" && mkdir -p "$RELEASE_DIR.tmp"
tar -xzf "$TARBALL" -C "$RELEASE_DIR.tmp" || fail "cannot unpack release"
rm -rf "$RELEASE_DIR" && mv "$RELEASE_DIR.tmp" "$RELEASE_DIR"

cd "$RELEASE_DIR/backend"
ln -sfn "$ENV_FILE" .env
ln -sfn "$SHARED_DIR/storage" storage

log "installing dependencies"
npm ci --omit=dev --no-audit --no-fund >/dev/null || fail "npm ci failed"
npx prisma generate >/dev/null || fail "prisma generate failed"
npx playwright install chromium >/dev/null 2>&1 || log "warning: playwright chromium install failed (PDF reports need it)"

if [ "$BAESH_ENV" = "production" ]; then
  log "pre-deploy database backup"
  BACKUP_LABEL="predeploy-${VERSION}" "$DIR/backup-db.sh" || fail "pre-deploy backup failed"
fi

log "checking pending migrations"
ALLOW_DESTRUCTIVE_MIGRATION="${ALLOW_DESTRUCTIVE_MIGRATION:-false}" npx tsx scripts/checkMigrations.ts --pending || fail "destructive migration not approved"

log "applying migrations"
npx prisma migrate deploy || fail "prisma migrate deploy failed (DB unchanged for failed migration; previous release still serving)"

log "switching current → ${VERSION}"
ln -sfn "$RELEASE_DIR" "${CURRENT_LINK}.new" && mv -T "${CURRENT_LINK}.new" "$CURRENT_LINK"
BAESH_ENV="$BAESH_ENV" pm2 startOrReload "$RELEASE_DIR/deploy/ecosystem.config.cjs" --update-env >/dev/null

if wait_healthy "$VERSION" 30; then
  pm2 save >/dev/null 2>&1 || true
  DURATION=$(( $(date +%s) - STARTED_AT ))
  log "healthy (${DURATION}s); pruning old releases"
  ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
    [ "$(readlink -f "$old")" = "$(readlink -f "$CURRENT_LINK")" ] || rm -rf "$old"
  done
  report_run deploy success "${VERSION}" "" "" "{\"version\":\"${VERSION}\",\"previous\":\"$(basename "${PREVIOUS:-none}")\",\"durationSec\":${DURATION}}"
  exit 0
fi

log "health check failed for ${VERSION}"
if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
  log "rolling back to $(basename "$PREVIOUS")"
  ln -sfn "$PREVIOUS" "${CURRENT_LINK}.new" && mv -T "${CURRENT_LINK}.new" "$CURRENT_LINK"
  PREV_VERSION="$(basename "$PREVIOUS")"
  ECOSYSTEM="$PREVIOUS/deploy/ecosystem.config.cjs"
  [ -f "$ECOSYSTEM" ] || ECOSYSTEM="$RELEASE_DIR/deploy/ecosystem.config.cjs"
  BAESH_ENV="$BAESH_ENV" pm2 startOrReload "$ECOSYSTEM" --update-env >/dev/null
  if wait_healthy "$PREV_VERSION" 30; then
    report_run rollback success "auto rollback ${VERSION} → ${PREV_VERSION}" "" "" "{\"failed\":\"${VERSION}\",\"restored\":\"${PREV_VERSION}\"}"
    alert "배포 ${VERSION} 헬스체크 실패 → ${PREV_VERSION}(으)로 자동 롤백 완료"
  else
    report_run rollback failure "auto rollback to ${PREV_VERSION} unhealthy" "" "" "{}"
    alert "자동 롤백 후에도 서버가 응답하지 않습니다. 즉시 확인하세요 (RUNBOOK §장애)."
  fi
fi
fail "health check failed"
