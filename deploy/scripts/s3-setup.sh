#!/usr/bin/env bash
# One-time hardening of the private file bucket and the backup bucket.
# Usage: FILES_BUCKET=baesh-prod-files BACKUP_BUCKET=baesh-prod-backups [AWS_REGION=ap-northeast-2] s3-setup.sh
#  - versioning (deleted/overwritten evidence stays recoverable)
#  - block all public access, default SSE-KMS encryption, TLS-only bucket policy
#  - lifecycle: old file versions kept 90 days; DB backups 35 days, monthly backups 365 days
set -euo pipefail
: "${FILES_BUCKET:?}" "${BACKUP_BUCKET:?}"
REGION="${AWS_REGION:-ap-northeast-2}"

harden() {
  local bucket="$1"
  aws s3api put-bucket-versioning --region "$REGION" --bucket "$bucket" --versioning-configuration Status=Enabled
  aws s3api put-public-access-block --region "$REGION" --bucket "$bucket" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-encryption --region "$REGION" --bucket "$bucket" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
  aws s3api put-bucket-policy --region "$REGION" --bucket "$bucket" --policy "{
    \"Version\":\"2012-10-17\",
    \"Statement\":[{\"Sid\":\"TlsOnly\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
      \"Resource\":[\"arn:aws:s3:::${bucket}\",\"arn:aws:s3:::${bucket}/*\"],
      \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
}

harden "$FILES_BUCKET"
harden "$BACKUP_BUCKET"

aws s3api put-bucket-lifecycle-configuration --region "$REGION" --bucket "$FILES_BUCKET" --lifecycle-configuration '{
  "Rules":[
    {"ID":"keep-old-versions-90d","Status":"Enabled","Filter":{},
     "NoncurrentVersionExpiration":{"NoncurrentDays":90},
     "AbortIncompleteMultipartUpload":{"DaysAfterInitiation":7}}
  ]}'

aws s3api put-bucket-lifecycle-configuration --region "$REGION" --bucket "$BACKUP_BUCKET" --lifecycle-configuration '{
  "Rules":[
    {"ID":"daily-db-35d","Status":"Enabled","Filter":{"Prefix":"db/"},
     "Expiration":{"Days":35},"NoncurrentVersionExpiration":{"NoncurrentDays":7}},
    {"ID":"monthly-db-365d","Status":"Enabled","Filter":{"Prefix":"monthly/"},
     "Transitions":[{"Days":30,"StorageClass":"STANDARD_IA"}],
     "Expiration":{"Days":365},"NoncurrentVersionExpiration":{"NoncurrentDays":7}}
  ]}'

echo "S3 buckets hardened: ${FILES_BUCKET}, ${BACKUP_BUCKET}"
