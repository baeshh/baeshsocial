#!/usr/bin/env bash
# Builds release.tgz in CI: compiled backend + prisma + scripts, built frontend, deploy scripts.
# Usage: VITE_API_URL=https://api.baesh.kr/api package-release.sh <version> [out.tgz]
set -euo pipefail
VERSION="${1:?version required}"
OUT="${2:-release-${VERSION}.tgz}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

: "${VITE_API_URL:?VITE_API_URL is required for the frontend build}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  (cd "$ROOT/backend" && npm ci --no-audit --no-fund && npx prisma generate && npm run build)
  (cd "$ROOT/frontend" && npm ci --no-audit --no-fund && VITE_API_URL="$VITE_API_URL" npm run build)
fi

mkdir -p "$STAGE/backend" "$STAGE/frontend"
cp -R "$ROOT/backend/dist" "$ROOT/backend/prisma" "$ROOT/backend/scripts" "$STAGE/backend/"
cp "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" "$ROOT/backend/prisma.config.ts" "$ROOT/backend/tsconfig.json" "$STAGE/backend/"
cp -R "$ROOT/frontend/dist" "$STAGE/frontend/"
cp -R "$ROOT/deploy" "$STAGE/deploy"
printf '{"version":"%s","builtAt":"%s"}\n' "$VERSION" "$(date -u +%FT%TZ)" >"$STAGE/RELEASE.json"

tar -czf "$OUT" -C "$STAGE" .
echo "$OUT"
