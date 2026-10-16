#!/usr/bin/env bash
# Prints the nginx site for one environment from deploy/nginx/baesh.conf (written for production).
# Usage: render-nginx.sh <staging|production> <app-domain> <api-domain> > /etc/nginx/sites-available/baesh-<env>.conf
# Certificates are expected at /etc/letsencrypt/live/<app-domain>/ (one certificate covering both names).
set -euo pipefail
ENV_NAME="${1:?environment}"
APP="${2:?app domain}"
API="${3:?api domain}"
[[ "$ENV_NAME" =~ ^(staging|production)$ ]] || { echo "environment must be staging or production" >&2; exit 2; }
for domain in "$APP" "$API"; do
  [[ "$domain" =~ ^[a-z0-9.-]+$ ]] || { echo "invalid domain ${domain}" >&2; exit 2; }
done
TEMPLATE="$(cd "$(dirname "$0")/.." && pwd)/nginx/baesh.conf"

if [ "$ENV_NAME" = production ]; then
  cat "$TEMPLATE"
  exit 0
fi

sed \
  -e "s#/etc/nginx/sites-available/baesh-production.conf#/etc/nginx/sites-available/baesh-${ENV_NAME}.conf#" \
  -e "s#certbot --nginx -d baesh.kr -d www.baesh.kr -d api.baesh.kr#certbot certonly -d ${APP} -d ${API}#" \
  -e "s#baesh_api_production#baesh_api_${ENV_NAME}#g" \
  -e "s#/srv/baesh/production/#/srv/baesh/${ENV_NAME}/#g" \
  -e "s#server_name baesh.kr www.baesh.kr api.baesh.kr;#server_name ${APP} ${API};#" \
  -e "s#server_name baesh.kr www.baesh.kr;#server_name ${APP};#" \
  -e "s#server_name api.baesh.kr;#server_name ${API};#" \
  -e "s#/etc/letsencrypt/live/baesh.kr/#/etc/letsencrypt/live/${APP}/#g" \
  -e "s#https://api.baesh.kr#https://${API}#g" \
  -e "s#baesh-api.access.log#baesh-api-${ENV_NAME}.access.log#; s#baesh-api.error.log#baesh-api-${ENV_NAME}.error.log#" \
  "$TEMPLATE" |
  # Keep non-production sites out of search engines.
  awk '{ print } /X-Frame-Options DENY always;/ { print "  add_header X-Robots-Tag \"noindex, nofollow\" always;" }'
