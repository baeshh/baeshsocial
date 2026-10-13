#!/usr/bin/env bash
# Usage: BAESH_ENV=production [SAMPLE=20] file-backup-check.sh
# Verifies the private file bucket is still protected (versioning, public block, encryption,
# lifecycle) and that a random sample of evidence/report objects referenced in the DB exists.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

BUCKET="$(env_value S3_BUCKET)"
REGION="$(env_value S3_REGION)"; REGION="${REGION:-ap-northeast-2}"
SAMPLE="${SAMPLE:-20}"
[ -n "$BUCKET" ] || die "S3_BUCKET not configured"
problems=()

[ "$(aws s3api get-bucket-versioning --region "$REGION" --bucket "$BUCKET" --query Status --output text)" = "Enabled" ] || problems+=("versioning disabled")
PAB="$(aws s3api get-public-access-block --region "$REGION" --bucket "$BUCKET" --query 'PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]' --output text 2>/dev/null || echo missing)"
[ "$PAB" = "True	True	True	True" ] || problems+=("public access block incomplete (${PAB})")
aws s3api get-bucket-encryption --region "$REGION" --bucket "$BUCKET" >/dev/null 2>&1 || problems+=("default encryption missing")
aws s3api get-bucket-lifecycle-configuration --region "$REGION" --bucket "$BUCKET" >/dev/null 2>&1 || problems+=("lifecycle missing")

missing=0
checked=0
while IFS= read -r key; do
  [ -n "$key" ] || continue
  checked=$((checked + 1))
  aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$key" >/dev/null 2>&1 || { missing=$((missing + 1)); log "missing object: ${key}"; }
done < <(psql "$(pg_url)" -At -c "
  (SELECT \"storageKey\" FROM \"EvidenceFile\" ORDER BY random() LIMIT ${SAMPLE})
  UNION ALL
  (SELECT \"storageKey\" FROM \"GeneratedReport\" WHERE \"storageKey\" IS NOT NULL ORDER BY random() LIMIT 5)")
[ "$missing" -eq 0 ] || problems+=("${missing}/${checked} sampled objects missing")

DETAILS="{\"bucket\":\"${BUCKET}\",\"checked\":${checked},\"missing\":${missing}}"
if [ "${#problems[@]}" -gt 0 ]; then
  MSG="$(IFS='; '; echo "${problems[*]}")"
  report_run file_backup_check failure "$MSG" "" "s3://${BUCKET}" "$DETAILS"
  alert "파일 백업 점검 실패: ${MSG}"
  die "$MSG"
fi
report_run file_backup_check success "bucket protected, ${checked} objects verified" "" "s3://${BUCKET}" "$DETAILS"
log "file backup check ok (${checked} objects)"
