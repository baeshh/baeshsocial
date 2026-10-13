#!/bin/bash
# EC2 user data for a BAESH server; provision-staging.sh fills in the __PLACEHOLDERS__.
# Installs the runtime, creates the `baesh` deploy user and /srv/baesh/<env>, and renders
# shared/backend.env from SSM so the first GitHub Actions deploy can run.
set -euxo pipefail
exec > >(tee -a /var/log/baesh-bootstrap.log) 2>&1

BAESH_ENV="__BAESH_ENV__"
AWS_REGION="__AWS_REGION__"
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg nginx certbot unzip fonts-noto-cjk

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
npm install -g pm2@5

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
echo "BAESH bootstrap finished for ${BAESH_ENV}"
