#!/bin/bash
# EC2 user data for a BAESH server; provision-staging.sh fills in the __PLACEHOLDERS__.
# Installs the runtime, creates the `baesh` deploy user and /srv/baesh/<env>, and renders
# shared/backend.env from SSM so the first GitHub Actions deploy can run.
set -euxo pipefail
exec > >(tee -a /var/log/baesh-bootstrap.log) 2>&1

BAESH_ENV="__BAESH_ENV__"
AWS_REGION="__AWS_REGION__"
PLAYWRIGHT_VERSION="__PLAYWRIGHT_VERSION__"
export DEBIAN_FRONTEND=noninteractive

# clamd on 127.0.0.1:3310 (CLAMAV_HOST); uploads go up to 100MB, so the stream limit must exceed that
# or large files come back as "size limit exceeded" and are rejected as unscannable.
debconf-set-selections <<'EOF'
clamav-daemon clamav-daemon/debconf boolean true
clamav-daemon clamav-daemon/TcpOrLocal select TCP
clamav-daemon clamav-daemon/TCPSocket string 3310
clamav-daemon clamav-daemon/TCPAddr string 127.0.0.1
clamav-daemon clamav-daemon/StreamMaxLength string 110
EOF

apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot unzip fonts-noto-cjk clamav clamav-daemon clamav-freshclam

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2@5
# System libraries for the Chromium that deploy.sh installs as the baesh user (PDF reports).
npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium

sed -i -E 's/^MaxFileSize .*/MaxFileSize 110M/; s/^MaxScanSize .*/MaxScanSize 220M/' /etc/clamav/clamd.conf
systemctl stop clamav-freshclam || true
freshclam --quiet || echo "freshclam failed; clamav-freshclam will retry and clamd starts once signatures exist"
systemctl enable --now clamav-freshclam
systemctl enable clamav-daemon
systemctl restart clamav-daemon || true

install -d /usr/share/postgresql-common/pgdg
curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  >/etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y postgresql-client-16

snap install aws-cli --classic

# RDS forces TLS; deploy/scripts/lib.sh and the PM2 file point Node at this bundle.
curl -fsSL -o /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
chmod 644 /etc/ssl/certs/rds-global-bundle.pem

id baesh >/dev/null 2>&1 || useradd -m -s /bin/bash baesh
install -d -o baesh -g baesh "/srv/baesh/${BAESH_ENV}" "/srv/baesh/${BAESH_ENV}/releases" "/srv/baesh/${BAESH_ENV}/shared"
install -d -o baesh -g baesh "/srv/baesh/${BAESH_ENV}/shared/logs" "/srv/baesh/${BAESH_ENV}/shared/backups"
install -d -o baesh -g baesh -m 700 /home/baesh/.ssh
touch /home/baesh/.ssh/authorized_keys
DEPLOY_KEY="__DEPLOY_PUBLIC_KEY__"
if [ -n "$DEPLOY_KEY" ] && ! grep -qF "$DEPLOY_KEY" /home/baesh/.ssh/authorized_keys; then
  printf '%s\n' "$DEPLOY_KEY" >>/home/baesh/.ssh/authorized_keys
fi
chown baesh:baesh /home/baesh/.ssh/authorized_keys
chmod 600 /home/baesh/.ssh/authorized_keys

# The first release does not exist yet, so render-env.sh and lib.sh ship inside the user data.
install -d /usr/local/lib/baesh
echo "__LIB_SH_B64__" | base64 -d >/usr/local/lib/baesh/lib.sh
echo "__RENDER_ENV_SH_B64__" | base64 -d >/usr/local/lib/baesh/render-env.sh
chmod 755 /usr/local/lib/baesh/lib.sh /usr/local/lib/baesh/render-env.sh
sudo -u baesh env BAESH_ENV="$BAESH_ENV" AWS_REGION="$AWS_REGION" /usr/local/lib/baesh/render-env.sh

env PATH="$PATH:/usr/bin" pm2 startup systemd -u baesh --hp /home/baesh
systemctl enable nginx

# clamd needs ~1 minute to load signatures. With MALWARE_SCAN_REQUIRED=true uploads are refused until it answers.
clamd_ping() { timeout 3 bash -c 'exec 3<>/dev/tcp/127.0.0.1/3310; printf "zPING\0" >&3; IFS= read -r -d "" reply <&3; [ "$reply" = PONG ]'; }
for _ in $(seq 1 36); do clamd_ping && break; sleep 5; done
clamd_ping && echo "clamd answering on 127.0.0.1:3310" || echo "WARNING: clamd not answering yet; check systemctl status clamav-daemon"
echo "BAESH bootstrap finished for ${BAESH_ENV}"
