#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-yapayzekalab}"
APP_DIR="${APP_DIR:-/opt/yapayzekalab}"
DOMAIN="${DOMAIN:-yapayzekalab.org}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the VPS." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg git nginx ufw fail2ban certbot python3-certbot-nginx postgresql-client

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 22 ]]; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

cp deploy/vps/yapayzekalab.service /etc/systemd/system/yapayzekalab.service
cp deploy/vps/nginx-yapayzekalab.conf /etc/nginx/sites-available/yapayzekalab
ln -sf /etc/nginx/sites-available/yapayzekalab /etc/nginx/sites-enabled/yapayzekalab
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable yapayzekalab
systemctl enable nginx

ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

echo "Base VPS packages are ready for ${DOMAIN}."
echo "Next: clone the repo into ${APP_DIR}, create ${APP_DIR}/.env.production, run scripts/vps-deploy.sh, then certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}."
