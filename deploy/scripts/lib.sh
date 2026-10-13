#!/usr/bin/env bash
# Shared helpers for BAESH server scripts. Source it: `. "$(dirname "$0")/lib.sh"`.
set -euo pipefail

: "${BAESH_ENV:?BAESH_ENV must be staging or production}"
BAESH_ROOT="${BAESH_ROOT:-/srv/baesh/${BAESH_ENV}}"
RELEASES_DIR="${BAESH_ROOT}/releases"
SHARED_DIR="${BAESH_ROOT}/shared"
CURRENT_LINK="${BAESH_ROOT}/current"
ENV_FILE="${ENV_FILE:-${SHARED_DIR}/backend.env}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# Reads one KEY from the shared env file without exporting the rest (secrets stay out of `ps`).
env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "^${key}=" "$ENV_FILE" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

api_base() {
  local port
  port="$(env_value PORT)"
  printf 'http://127.0.0.1:%s/api' "${port:-4000}"
}

# report_run <kind> <status> [message] [size_bytes] [location] [details_json]
# Records the run in BAESH (/api/ops/runs). Never fails the calling script.
report_run() {
  local kind="$1" status="$2" message="${3:-}" size="${4:-}" location="${5:-}" details="${6:-}"
  [ -n "$details" ] || details='{}'
  local token
  token="$(env_value OPS_INGEST_TOKEN)"
  if [ -z "$token" ]; then
    log "OPS_INGEST_TOKEN not set; skipping run report (${kind} ${status})"
    return 0
  fi
  local body
  body="$(KIND="$kind" STATUS="$status" MESSAGE="$message" SIZE="$size" LOCATION="$location" DETAILS="$details" ENVNAME="$BAESH_ENV" \
    node -e '
      const b = { kind: process.env.KIND, status: process.env.STATUS, environment: process.env.ENVNAME };
      if (process.env.MESSAGE) b.message = process.env.MESSAGE.slice(0, 1900);
      if (process.env.SIZE) b.sizeBytes = Number(process.env.SIZE);
      if (process.env.LOCATION) b.location = process.env.LOCATION;
      try { b.details = JSON.parse(process.env.DETAILS || "{}"); } catch { b.details = {}; }
      process.stdout.write(JSON.stringify(b));
    ')"
  curl -fsS -m 10 -X POST "$(api_base)/ops/runs" \
    -H 'Content-Type: application/json' -H "X-Ops-Token: ${token}" \
    --data "$body" >/dev/null 2>&1 || log "run report failed (${kind} ${status}); API may be down"
}

# alert <text> — direct webhook post for when the API itself is down.
alert() {
  local url
  url="$(env_value ALERT_WEBHOOK_URL)"
  [ -n "$url" ] || { log "ALERT: $*"; return 0; }
  local text="🚨 [BAESH ${BAESH_ENV}] $*"
  local payload
  if [[ "$url" == *discord.com* ]]; then
    payload="$(TEXT="$text" node -e 'process.stdout.write(JSON.stringify({content: process.env.TEXT}))')"
  else
    payload="$(TEXT="$text" node -e 'process.stdout.write(JSON.stringify({text: process.env.TEXT}))')"
  fi
  curl -fsS -m 10 -X POST -H 'Content-Type: application/json' --data "$payload" "$url" >/dev/null 2>&1 || true
}

# wait_healthy <expected_version> [attempts]
wait_healthy() {
  local expected="$1" attempts="${2:-30}" body version
  for _ in $(seq 1 "$attempts"); do
    if body="$(curl -fsS -m 5 "$(api_base)/health/ready" 2>/dev/null)"; then
      version="$(printf '%s' "$body" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).version||"")}catch{}})')"
      if [ -z "$expected" ] || [ "$version" = "$expected" ]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

pg_url() {
  # libpq does not understand Prisma's ?schema= parameter.
  env_value DATABASE_URL | sed -E 's/schema=[^&]*&?//; s/[?&]$//'
}
