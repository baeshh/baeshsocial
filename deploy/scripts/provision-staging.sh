#!/usr/bin/env bash
# Creates the AWS resources for the BAESH staging environment. Without --apply it only prints the plan
# and makes no AWS calls.
#
#   deploy/scripts/provision-staging.sh                       # plan
#   AWS_ACCOUNT_ID=123456789012 ADMIN_CIDR=203.0.113.4/32 KEY_NAME=baesh-staging \
#   DEPLOY_PUBLIC_KEY_FILE=~/.ssh/baesh-staging-deploy.pub deploy/scripts/provision-staging.sh --apply
#
# Staging only: names containing "prod" are refused, and --apply runs only against AWS_ACCOUNT_ID.
# Re-running is safe: existing resources are found by name and reused, and SSM values are never overwritten.
# Generated secrets (DB password, JWT_SECRET, OPS_INGEST_TOKEN) go straight to SSM SecureString through
# temporary 0600 files; they are never printed or passed on the command line.
#
# Creates: 2 private S3 buckets (s3-setup.sh hardening), security groups, RDS PostgreSQL 16 (encrypted,
# private, 7-day backups, deletion protection), SSM parameters under /baesh/staging/, an EC2 role limited
# to those buckets/parameters, and an EC2 instance with an Elastic IP bootstrapped by staging-user-data.sh.
# DNS, TLS certificates and the GitHub `staging` environment are manual steps: see docs/STAGING-AWS.md.
set -Eeuo pipefail
trap 'echo "::error::provision-staging.sh failed at line ${LINENO}: ${BASH_COMMAND}" >&2' ERR

APPLY=false
case "${1:-}" in
  --apply) APPLY=true ;;
  "" | --plan) ;;
  *) echo "usage: $0 [--plan|--apply]" >&2; exit 2 ;;
esac

DIR="$(cd "$(dirname "$0")" && pwd)"
BAESH_ENV=staging
REGION="${AWS_REGION:-ap-northeast-2}"
PREFIX="${NAME_PREFIX:-baesh-staging}"
APP_DOMAIN="${APP_DOMAIN:-staging.baesh.kr}"
API_DOMAIN="${API_DOMAIN:-staging-api.baesh.kr}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
DB_CLASS="${DB_CLASS:-db.t4g.micro}"
DB_STORAGE_GB="${DB_STORAGE_GB:-20}"
FILES_BUCKET="${FILES_BUCKET:-${PREFIX}-files}"
BACKUP_BUCKET="${BACKUP_BUCKET:-${PREFIX}-backups}"
SSM_PREFIX="/baesh/${BAESH_ENV}"
ADMIN_SSM_PREFIX="/baesh-admin/${BAESH_ENV}"
DB_ID="${PREFIX}-db"
DB_NAME=baesh
DB_USER=baesh_admin
ROLE="${PREFIX}-ec2"
INSTANCE_NAME="${PREFIX}-api"

log() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
step() { printf '\n=== %s ===\n' "$*"; }
plan() { printf '  - %s\n' "$*"; }

for name in "$PREFIX" "$FILES_BUCKET" "$BACKUP_BUCKET"; do
  [[ "$name" != *prod* ]] || die "refusing to touch '${name}': this script is for staging only"
  [[ "$name" =~ ^[a-z0-9][a-z0-9-]{2,61}$ ]] || die "invalid name '${name}'"
done
for domain in "$APP_DOMAIN" "$API_DOMAIN"; do
  [[ "$domain" =~ ^[a-z0-9.-]+$ ]] || die "invalid domain '${domain}'"
done

DEPLOY_PUBLIC_KEY=""
if [ -n "${DEPLOY_PUBLIC_KEY_FILE:-}" ]; then
  DEPLOY_PUBLIC_KEY="$(tr -d '\r\n' <"$DEPLOY_PUBLIC_KEY_FILE")"
  [[ "$DEPLOY_PUBLIC_KEY" =~ ^ssh-(ed25519|rsa)\ [A-Za-z0-9+/=]+(\ [A-Za-z0-9@._-]+)?$ ]] ||
    die "DEPLOY_PUBLIC_KEY_FILE must contain one ssh-ed25519/ssh-rsa public key"
fi

if ! $APPLY; then
  step "Plan for ${PREFIX} in ${REGION} (no AWS calls made)"
  plan "S3: create ${FILES_BUCKET}, ${BACKUP_BUCKET}; run s3-setup.sh (versioning, public access block, SSE-KMS, TLS-only, lifecycle)"
  plan "Security groups: ${PREFIX}-web (80/443 public, 22 from ADMIN_CIDR=${ADMIN_CIDR:-<required>}), ${PREFIX}-db (5432 from ${PREFIX}-web only)"
  plan "RDS: ${DB_ID} PostgreSQL 16.x ${DB_CLASS} ${DB_STORAGE_GB}GB gp3, encrypted, not public, backups 7 days, deletion protection"
  plan "SSM ${ADMIN_SSM_PREFIX}/DB_MASTER_PASSWORD (generated, SecureString; not read by the app)"
  plan "SSM ${SSM_PREFIX}/: DATABASE_URL, JWT_SECRET, OPS_INGEST_TOKEN (SecureString, generated)"
  plan "SSM ${SSM_PREFIX}/: FRONTEND_URL=https://${APP_DOMAIN}, API_PUBLIC_URL=https://${API_DOMAIN}, STORAGE_DRIVER=s3, S3_BUCKET=${FILES_BUCKET}, S3_REGION, BACKUP_S3_BUCKET=${BACKUP_BUCKET}, MAIL_DRIVER=log, AI_PROVIDER=mock, TRUST_PROXY=1"
  plan "IAM: role/instance profile ${ROLE} (S3 on the two buckets, SSM read ${SSM_PREFIX}/*, KMS via S3/SSM, SSM Session Manager)"
  plan "EC2: ${INSTANCE_NAME} Ubuntu 24.04 ${INSTANCE_TYPE}, 30GB encrypted gp3, IMDSv2 only, key pair KEY_NAME=${KEY_NAME:-<required>}, Elastic IP"
  plan "EC2 user data: Node 22, PM2, nginx, postgresql-client-16, aws-cli, RDS CA bundle, user baesh, /srv/baesh/staging, render-env.sh"
  plan "deploy key for user baesh: ${DEPLOY_PUBLIC_KEY_FILE:-<none; add it to /home/baesh/.ssh/authorized_keys later>}"
  echo
  echo "Run with --apply (and AWS_ACCOUNT_ID, ADMIN_CIDR, KEY_NAME) to create these resources."
  exit 0
fi

command -v aws >/dev/null || die "aws CLI v2 is required"
command -v openssl >/dev/null || die "openssl is required"
: "${AWS_ACCOUNT_ID:?set AWS_ACCOUNT_ID to the staging account id (guards against the wrong profile)}"
: "${ADMIN_CIDR:?set ADMIN_CIDR to the address allowed to SSH (e.g. 203.0.113.4/32)}"
: "${KEY_NAME:?set KEY_NAME to an existing EC2 key pair for emergency SSH}"
[[ "$ADMIN_CIDR" =~ ^[0-9.]+/[0-9]{1,2}$ ]] && [ "$ADMIN_CIDR" != "0.0.0.0/0" ] || die "ADMIN_CIDR must be a specific IPv4 range"

export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
account="$(aws sts get-caller-identity --query Account --output text)"
[ "$account" = "$AWS_ACCOUNT_ID" ] || die "credentials belong to account ${account}, expected ${AWS_ACCOUNT_ID}"
log "account ${account}, region ${REGION}"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
none() { [ -z "$1" ] || [ "$1" = "None" ]; }

# put_param <full-name> <String|SecureString> <value> — creates it only if it does not exist yet.
put_param() {
  local name="$1" type="$2" value="$3"
  if aws ssm get-parameter --name "$name" --query Parameter.Name --output text >/dev/null 2>&1; then
    log "keep ${name}"
    return 0
  fi
  [[ "$value" != *'"'* && "$value" != *'\'* ]] || die "value for ${name} contains quotes or backslashes"
  local file="$WORK/param.json"
  printf '{"Name":"%s","Type":"%s","Value":"%s","Tier":"Standard"}' "$name" "$type" "$value" >"$file"
  aws ssm put-parameter --cli-input-json "file://${file}" >/dev/null
  rm -f "$file"
  log "created ${name} (${type})"
}

get_secret() { aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text; }

step "1. S3 buckets"
for bucket in "$FILES_BUCKET" "$BACKUP_BUCKET"; do
  if aws s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    log "keep s3://${bucket}"
  else
    aws s3api create-bucket --bucket "$bucket" --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
    log "created s3://${bucket}"
  fi
done
FILES_BUCKET="$FILES_BUCKET" BACKUP_BUCKET="$BACKUP_BUCKET" AWS_REGION="$REGION" bash "$DIR/s3-setup.sh"

step "2. Network"
VPC_ID="${VPC_ID:-$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)}"
none "$VPC_ID" && die "no default VPC; set VPC_ID"
read -r -a SUBNETS <<<"$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query 'Subnets[].SubnetId' --output text)"
[ "${#SUBNETS[@]}" -ge 2 ] || die "RDS needs subnets in at least two availability zones in ${VPC_ID}"
log "vpc ${VPC_ID}, ${#SUBNETS[@]} subnets"

security_group() {
  local name="$1" description="$2" id
  id="$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=${VPC_ID}" "Name=group-name,Values=${name}" \
    --query 'SecurityGroups[0].GroupId' --output text)"
  if none "$id"; then
    id="$(aws ec2 create-security-group --vpc-id "$VPC_ID" --group-name "$name" --description "$description" \
      --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${name}},{Key=baesh:env,Value=${BAESH_ENV}}]" \
      --query GroupId --output text)"
    log "created security group ${name} ${id}" >&2
  fi
  printf '%s' "$id"
}

allow() {
  local output
  if ! output="$(aws ec2 authorize-security-group-ingress "$@" 2>&1)"; then
    [[ "$output" == *InvalidPermission.Duplicate* ]] || die "$output"
  fi
}

WEB_SG="$(security_group "${PREFIX}-web" "BAESH ${BAESH_ENV} web/API server")"
DB_SG="$(security_group "${PREFIX}-db" "BAESH ${BAESH_ENV} database")"
allow --group-id "$WEB_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0
allow --group-id "$WEB_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0
allow --group-id "$WEB_SG" --protocol tcp --port 22 --cidr "$ADMIN_CIDR"
allow --group-id "$DB_SG" --protocol tcp --port 5432 --source-group "$WEB_SG"
log "web ${WEB_SG}, db ${DB_SG}"

step "3. RDS PostgreSQL"
if ! aws rds describe-db-subnet-groups --db-subnet-group-name "${PREFIX}-db-subnets" >/dev/null 2>&1; then
  aws rds create-db-subnet-group --db-subnet-group-name "${PREFIX}-db-subnets" \
    --db-subnet-group-description "BAESH ${BAESH_ENV}" --subnet-ids "${SUBNETS[@]}" >/dev/null
  log "created db subnet group ${PREFIX}-db-subnets"
fi
if aws rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
  log "keep rds ${DB_ID}"
else
  put_param "${ADMIN_SSM_PREFIX}/DB_MASTER_PASSWORD" SecureString "$(openssl rand -hex 24)"
  ENGINE_VERSION="$(aws rds describe-db-engine-versions --engine postgres \
    --query "DBEngineVersions[?starts_with(EngineVersion, '16.')].EngineVersion | [-1]" --output text)"
  none "$ENGINE_VERSION" && die "no PostgreSQL 16 engine version available in ${REGION}"
  cat >"$WORK/rds.json" <<JSON
{
  "DBInstanceIdentifier": "${DB_ID}",
  "DBInstanceClass": "${DB_CLASS}",
  "Engine": "postgres",
  "EngineVersion": "${ENGINE_VERSION}",
  "AllocatedStorage": ${DB_STORAGE_GB},
  "StorageType": "gp3",
  "DBName": "${DB_NAME}",
  "MasterUsername": "${DB_USER}",
  "MasterUserPassword": "$(get_secret "${ADMIN_SSM_PREFIX}/DB_MASTER_PASSWORD")",
  "VpcSecurityGroupIds": ["${DB_SG}"],
  "DBSubnetGroupName": "${PREFIX}-db-subnets",
  "BackupRetentionPeriod": 7,
  "StorageEncrypted": true,
  "PubliclyAccessible": false,
  "MultiAZ": false,
  "DeletionProtection": true,
  "CopyTagsToSnapshot": true,
  "AutoMinorVersionUpgrade": true,
  "Tags": [{"Key": "Name", "Value": "${DB_ID}"}, {"Key": "baesh:env", "Value": "${BAESH_ENV}"}]
}
JSON
  aws rds create-db-instance --cli-input-json "file://${WORK}/rds.json" >/dev/null
  rm -f "$WORK/rds.json"
  log "creating rds ${DB_ID} (PostgreSQL ${ENGINE_VERSION}); waiting until available, usually 5-15 minutes"
fi
aws rds wait db-instance-available --db-instance-identifier "$DB_ID"
DB_HOST="$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].Endpoint.Address' --output text)"
log "rds endpoint ${DB_HOST}"

step "4. SSM parameters (${SSM_PREFIX}/)"
put_param "${SSM_PREFIX}/DATABASE_URL" SecureString \
  "postgresql://${DB_USER}:$(get_secret "${ADMIN_SSM_PREFIX}/DB_MASTER_PASSWORD")@${DB_HOST}:5432/${DB_NAME}?sslmode=require"
put_param "${SSM_PREFIX}/JWT_SECRET" SecureString "$(openssl rand -hex 48)"
put_param "${SSM_PREFIX}/OPS_INGEST_TOKEN" SecureString "$(openssl rand -hex 32)"
put_param "${SSM_PREFIX}/FRONTEND_URL" String "https://${APP_DOMAIN}"
put_param "${SSM_PREFIX}/API_PUBLIC_URL" String "https://${API_DOMAIN}"
put_param "${SSM_PREFIX}/STORAGE_DRIVER" String s3
put_param "${SSM_PREFIX}/S3_BUCKET" String "$FILES_BUCKET"
put_param "${SSM_PREFIX}/S3_REGION" String "$REGION"
put_param "${SSM_PREFIX}/BACKUP_S3_BUCKET" String "$BACKUP_BUCKET"
put_param "${SSM_PREFIX}/MAIL_DRIVER" String log
put_param "${SSM_PREFIX}/AI_PROVIDER" String mock
put_param "${SSM_PREFIX}/TRUST_PROXY" String 1

step "5. IAM role for the server"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --tags "Key=baesh:env,Value=${BAESH_ENV}" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  log "created role ${ROLE}"
fi
cat >"$WORK/policy.json" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:ListBucket", "s3:ListBucketVersions", "s3:GetBucketVersioning", "s3:GetBucketEncryption",
      "s3:GetBucketPublicAccessBlock", "s3:GetLifecycleConfiguration", "s3:GetBucketPolicy"],
     "Resource": ["arn:aws:s3:::${FILES_BUCKET}", "arn:aws:s3:::${BACKUP_BUCKET}"]},
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject"],
     "Resource": ["arn:aws:s3:::${FILES_BUCKET}/*", "arn:aws:s3:::${BACKUP_BUCKET}/*"]},
    {"Effect": "Allow", "Action": ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"],
     "Resource": ["arn:aws:ssm:${REGION}:${account}:parameter${SSM_PREFIX}", "arn:aws:ssm:${REGION}:${account}:parameter${SSM_PREFIX}/*"]},
    {"Effect": "Allow", "Action": ["kms:Decrypt", "kms:GenerateDataKey"], "Resource": "*",
     "Condition": {"StringEquals": {"kms:ViaService": ["s3.${REGION}.amazonaws.com", "ssm.${REGION}.amazonaws.com"]}}},
    {"Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*"}
  ]
}
JSON
aws iam put-role-policy --role-name "$ROLE" --policy-name "${PREFIX}-app" --policy-document "file://${WORK}/policy.json"
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
if ! aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  log "created instance profile ${ROLE}; waiting for IAM to propagate"
  sleep 15
fi

step "6. EC2 server"
INSTANCE_ID="$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${INSTANCE_NAME}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)"
if none "$INSTANCE_ID"; then
  AMI="$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query Parameter.Value --output text)"
  sed -e "s|__BAESH_ENV__|${BAESH_ENV}|" -e "s|__AWS_REGION__|${REGION}|" \
    -e "s|__DEPLOY_PUBLIC_KEY__|${DEPLOY_PUBLIC_KEY}|" \
    -e "s|__LIB_SH_B64__|$(base64 <"$DIR/lib.sh" | tr -d '\n')|" \
    -e "s|__RENDER_ENV_SH_B64__|$(base64 <"$DIR/render-env.sh" | tr -d '\n')|" \
    "$DIR/staging-user-data.sh" >"$WORK/user-data.sh"
  INSTANCE_ID="$(aws ec2 run-instances --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --key-name "$KEY_NAME" \
    --security-group-ids "$WEB_SG" --iam-instance-profile "Name=${ROLE}" \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3","Encrypted":true}}]' \
    --user-data "file://${WORK}/user-data.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${INSTANCE_NAME}},{Key=baesh:env,Value=${BAESH_ENV}}]" \
    --query 'Instances[0].InstanceId' --output text)"
  log "launched ${INSTANCE_ID}"
else
  log "keep instance ${INSTANCE_ID}"
fi
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

EIP_ALLOC="$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=${INSTANCE_NAME}" --query 'Addresses[0].AllocationId' --output text)"
if none "$EIP_ALLOC"; then
  EIP_ALLOC="$(aws ec2 allocate-address --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${INSTANCE_NAME}},{Key=baesh:env,Value=${BAESH_ENV}}]" \
    --query AllocationId --output text)"
fi
aws ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$INSTANCE_ID" --allow-reassociation >/dev/null
PUBLIC_IP="$(aws ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].PublicIp' --output text)"

step "Done"
cat <<EOF
Server      ${INSTANCE_ID}  ${PUBLIC_IP}  (bootstrap log: /var/log/baesh-bootstrap.log, takes ~5 minutes)
Database    ${DB_HOST} (private; reachable only from ${PREFIX}-web)
Buckets     s3://${FILES_BUCKET}  s3://${BACKUP_BUCKET}

Next (docs/STAGING-AWS.md):
  1. DNS A records: ${APP_DOMAIN} and ${API_DOMAIN} -> ${PUBLIC_IP}
  2. On the server: nginx site + certbot certificates for both names
  3. GitHub environment "staging":
       secrets  SSH_HOST=${PUBLIC_IP}  SSH_USER=baesh  SSH_PRIVATE_KEY=<deploy private key>
                SSH_KNOWN_HOSTS=\$(ssh-keyscan -t ed25519 ${PUBLIC_IP})
       vars     VITE_API_URL=https://${API_DOMAIN}/api  PUBLIC_API_URL=https://${API_DOMAIN}/api  APP_URL=https://${APP_DOMAIN}
  4. Actions -> Deploy staging -> Run workflow (ref = the branch to verify)
EOF
