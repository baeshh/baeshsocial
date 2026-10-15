#!/usr/bin/env bash
# Usage: BAESH_ENV=production render-env.sh
# Builds shared/backend.env from AWS SSM Parameter Store (SecureString) under /baesh/<env>/.
# Secrets never live in the repo, CI logs or release tarballs; rotate them in SSM and re-run.
#   aws ssm put-parameter --name /baesh/production/JWT_SECRET --type SecureString --value "$(openssl rand -base64 48)"
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

PREFIX="/baesh/${BAESH_ENV}/"
REGION="${AWS_REGION:-ap-northeast-2}"
mkdir -p "$SHARED_DIR"
TMP="$(mktemp "${SHARED_DIR}/.env.XXXXXX")"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT

aws ssm get-parameters-by-path --region "$REGION" --path "$PREFIX" --recursive --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
  while IFS=$'\t' read -r name value; do
    key="${name#"$PREFIX"}"
    [[ "$key" =~ ^[A-Z0-9_]+$ ]] || continue
    printf '%s=%s\n' "$key" "$value" >>"$TMP"
  done

for required in DATABASE_URL JWT_SECRET FRONTEND_URL STORAGE_DRIVER S3_BUCKET OPS_INGEST_TOKEN; do
  grep -q "^${required}=" "$TMP" || die "SSM parameter ${PREFIX}${required} is missing"
done
# The API refuses to boot with STORAGE_DRIVER=s3 and no public media URL (backend/src/config/env.ts).
if grep -q '^STORAGE_DRIVER=s3$' "$TMP"; then
  grep -q '^MEDIA_PUBLIC_BASE_URL=' "$TMP" || die "SSM parameter ${PREFIX}MEDIA_PUBLIC_BASE_URL is missing (required with STORAGE_DRIVER=s3)"
fi
grep -q '^TRUST_PROXY=' "$TMP" || echo 'TRUST_PROXY=1' >>"$TMP"
grep -q '^JOBS_ENABLED=' "$TMP" || echo 'JOBS_ENABLED=true' >>"$TMP"

mv "$TMP" "$ENV_FILE"
trap - EXIT
chmod 600 "$ENV_FILE"
log "wrote ${ENV_FILE} ($(wc -l <"$ENV_FILE") keys)"
