#!/usr/bin/env bash
# Usage: BAESH_ENV=production rollback.sh [release-name]
# Points `current` back to the given release (default: the newest release older than current).
# Code-only rollback: migrations are never reverted automatically. Because migrations are
# expand-only, older releases run against the newer schema. To undo data changes, restore a
# backup instead (RUNBOOK: "DB 복원").
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

[ -L "$CURRENT_LINK" ] || die "no current release"
CURRENT="$(readlink -f "$CURRENT_LINK")"
TARGET_NAME="${1:-}"

if [ -z "$TARGET_NAME" ]; then
  TARGET="$(ls -1dt "$RELEASES_DIR"/*/ | sed 's:/$::' | grep -vx "$CURRENT" | head -n1 || true)"
else
  TARGET="${RELEASES_DIR}/${TARGET_NAME}"
fi
[ -n "${TARGET:-}" ] && [ -d "$TARGET" ] || die "target release not found (available: $(ls -1 "$RELEASES_DIR" | tr '\n' ' '))"

VERSION="$(basename "$TARGET")"
log "rolling back $(basename "$CURRENT") → ${VERSION}"
ln -sfn "$TARGET" "${CURRENT_LINK}.new" && mv -T "${CURRENT_LINK}.new" "$CURRENT_LINK"
BAESH_ENV="$BAESH_ENV" pm2 startOrReload "$TARGET/deploy/ecosystem.config.cjs" --update-env >/dev/null

if wait_healthy "$VERSION" 30; then
  pm2 save >/dev/null 2>&1 || true
  report_run rollback success "manual rollback $(basename "$CURRENT") → ${VERSION}" "" "" "{\"from\":\"$(basename "$CURRENT")\",\"to\":\"${VERSION}\"}"
  log "rollback complete"
else
  report_run rollback failure "rollback to ${VERSION} unhealthy" "" "" "{}"
  alert "수동 롤백(${VERSION}) 후 헬스체크 실패"
  die "rolled back but health check failed"
fi
