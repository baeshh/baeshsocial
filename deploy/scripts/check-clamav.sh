#!/usr/bin/env bash
# Verifies the local clamd that the API scans uploads with (CLAMAV_HOST=127.0.0.1, MALWARE_SCAN_REQUIRED=true):
#   1. clamd.conf: TCPAddr 127.0.0.1, TCPSocket 3310, StreamMaxLength 110M (uploads go up to 100MB)
#   2. clamd answers PING (waits up to --wait seconds while signatures load)
#   3. the EICAR test file is detected, i.e. signatures are loaded
#   4. a clean file above the stock 25MB stream limit scans as OK within the API's 30s scan timeout
# Usage: check-clamav.sh [--wait SECONDS]    Exits 1 and names the failed step on stderr.
# Runs from staging-user-data.sh at bootstrap and from the release after deploys (docs/STAGING-AWS.md).
set -euo pipefail
CONF="${CLAMD_CONF:-/etc/clamav/clamd.conf}"
PORT="${CLAMD_PORT:-3310}"
LARGE_MB="${CLAMAV_CHECK_LARGE_MB:-60}"
SCAN_TIMEOUT_SEC=30
WAIT=0
if [ "${1:-}" = --wait ]; then WAIT="${2:?--wait needs seconds}"; fi

fail() { echo "ERROR: ClamAV check failed: $*" >&2; exit 1; }
ok() { echo "ok    $*"; }

[ -r "$CONF" ] || fail "cannot read ${CONF}"
conf_value() { awk -v key="$1" '$1 == key { value = $2 } END { print value }' "$CONF"; }
for expected in "TCPAddr 127.0.0.1" "TCPSocket ${PORT}" "StreamMaxLength 110M"; do
  key="${expected%% *}"
  want="${expected#* }"
  got="$(conf_value "$key")"
  [ "$got" = "$want" ] || fail "${CONF}: ${key} is '${got:-<unset>}', expected '${want}'"
done
ok "${CONF}: TCPAddr 127.0.0.1, TCPSocket ${PORT}, StreamMaxLength 110M"

# clamd INSTREAM client; the EICAR string is assembled at runtime so this file itself is not flagged.
clamd() {
  python3 - "$PORT" "$@" <<'PY'
import os, socket, struct, sys, time
port, mode = int(sys.argv[1]), sys.argv[2]

def talk(command, chunks=None, timeout=120):
    with socket.create_connection(("127.0.0.1", port), timeout=timeout) as s:
        try:
            s.sendall(command)
            if chunks is not None:
                for chunk in chunks:
                    s.sendall(struct.pack(">I", len(chunk)) + chunk)
                s.sendall(struct.pack(">I", 0))
        except (BrokenPipeError, ConnectionResetError):
            pass  # clamd closes early on errors such as "INSTREAM size limit exceeded"; read its reply below
        reply = b""
        while not reply.endswith(b"\0"):
            part = s.recv(4096)
            if not part:
                break
            reply += part
    return reply.rstrip(b"\0").decode(errors="replace").strip()

try:
    if mode == "ping":
        print(talk(b"zPING\0", timeout=5))
    elif mode == "eicar":
        eicar = ("X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-" + "TEST-FILE!$H+H*").encode()
        print(talk(b"zINSTREAM\0", [eicar]))
    elif mode == "large":
        size_mb = int(sys.argv[3])
        started = time.monotonic()
        reply = talk(b"zINSTREAM\0", (os.urandom(1024 * 1024) for _ in range(size_mb)))
        print(f"{reply}|{time.monotonic() - started:.1f}")
except OSError as error:
    print(f"connection error: {error}")
PY
}

deadline=$(( $(date +%s) + WAIT ))
while :; do
  reply="$(clamd ping)"
  [ "$reply" = PONG ] && break
  [ "$(date +%s)" -lt "$deadline" ] || fail "clamd on 127.0.0.1:${PORT} does not answer PING (${reply:-no reply}); see systemctl status clamav-daemon clamav-freshclam"
  sleep 5
done
ok "clamd answers PING on 127.0.0.1:${PORT}"

reply="$(clamd eicar)"
[[ "$reply" == *FOUND ]] || fail "EICAR test file not detected (clamd replied '${reply}'); signatures are missing or not loaded"
ok "EICAR detected (${reply})"

reply="$(clamd large "$LARGE_MB")"
verdict="${reply%|*}"
seconds="${reply##*|}"
[[ "$verdict" == *OK ]] || fail "clean ${LARGE_MB}MB file not accepted (clamd replied '${verdict}'); check StreamMaxLength/MaxFileSize/MaxScanSize"
awk -v s="$seconds" -v max="$SCAN_TIMEOUT_SEC" 'BEGIN { exit !(s < max) }' ||
  fail "clean ${LARGE_MB}MB file took ${seconds}s; the API aborts scans after ${SCAN_TIMEOUT_SEC}s"
ok "clean ${LARGE_MB}MB file scanned as OK in ${seconds}s"
