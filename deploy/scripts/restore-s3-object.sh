#!/usr/bin/env bash
# Usage: BAESH_ENV=production restore-s3-object.sh <storage-key> [version-id]
# Restores a deleted or overwritten private file from S3 versioning. Without a version id the
# newest non-deleted version is restored (a delete marker on top is removed).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

KEY="${1:?storage key required (e.g. evidence/<id>/<file>.pdf)}"
VERSION="${2:-}"
BUCKET="$(env_value S3_BUCKET)"
REGION="$(env_value S3_REGION)"; REGION="${REGION:-ap-northeast-2}"
[ -n "$BUCKET" ] || die "S3_BUCKET not configured"

aws s3api list-object-versions --region "$REGION" --bucket "$BUCKET" --prefix "$KEY" \
  --query '{Versions: Versions[?Key==`'"$KEY"'`].[VersionId,LastModified,Size,IsLatest], Markers: DeleteMarkers[?Key==`'"$KEY"'`].[VersionId,LastModified,IsLatest]}' --output table

if [ -z "$VERSION" ]; then
  MARKER="$(aws s3api list-object-versions --region "$REGION" --bucket "$BUCKET" --prefix "$KEY" \
    --query 'DeleteMarkers[?Key==`'"$KEY"'` && IsLatest==`true`].VersionId | [0]' --output text)"
  if [ -n "$MARKER" ] && [ "$MARKER" != "None" ]; then
    aws s3api delete-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" --version-id "$MARKER" >/dev/null
    log "removed delete marker ${MARKER}; latest version restored"
    exit 0
  fi
  die "object is not deleted; pass a version id to roll content back to an older version"
fi

aws s3api copy-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" \
  --copy-source "${BUCKET}/${KEY}?versionId=${VERSION}" --server-side-encryption aws:kms >/dev/null
log "restored ${KEY} from version ${VERSION}"
