#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-yapayzekalab}"
APP_DIR="${APP_DIR:-/opt/yapayzekalab}"
DOMAIN="${DOMAIN:-yapayzekalab.org}"
SERVICE_NAME="${SERVICE_NAME:-yapayzekalab}"

detect_platform() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "debian"
  elif command -v dnf >/dev/null 2>&1; then
    echo "rhel"
  else
    echo "unsupported"
  fi
}

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the VPS." >&2
  exit 1
fi

PLATFORM="$(detect_platform)"
if [[ "${PLATFORM}" == "unsupported" ]]; then
  echo "Unsupported Linux distribution: apt-get or dnf required." >&2
  exit 1
fi

install_base_packages() {
  case "${PLATFORM}" in
    debian)
      apt-get update
      apt-get install -y ca-certificates curl gnupg git nginx ufw fail2ban certbot python3-certbot-nginx postgresql-client
      ;;
    rhel)
      dnf install -y ca-certificates curl git nginx policycoreutils-python-utils postgresql
      dnf install -y certbot python3-certbot-nginx || true
      ;;
  esac
}

install_node_if_needed() {
  if command -v node >/dev/null 2>&1 && [[ "$(node -v | sed 's/^v//' | cut -d. -f1)" -ge 22 ]]; then
    return
  fi

  case "${PLATFORM}" in
    debian)
      install -d -m 0755 /etc/apt/keyrings
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
      apt-get update
      apt-get install -y nodejs
      ;;
    rhel)
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
      dnf install -y nodejs
      ;;
  esac
}

install_nginx_config() {
  case "${PLATFORM}" in
    debian)
      mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
      cp deploy/vps/nginx-yapayzekalab.conf /etc/nginx/sites-available/yapayzekalab
      ln -sf /etc/nginx/sites-available/yapayzekalab /etc/nginx/sites-enabled/yapayzekalab
      rm -f /etc/nginx/sites-enabled/default
      ;;
    rhel)
      cp deploy/vps/nginx-yapayzekalab.conf /etc/nginx/conf.d/yapayzekalab.conf
      ;;
  esac
}

configure_firewall() {
  case "${PLATFORM}" in
    debian)
      if command -v ufw >/dev/null 2>&1; then
        ufw allow OpenSSH
        ufw allow "Nginx Full"
        ufw --force enable
      fi
      ;;
    rhel)
      if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
        firewall-cmd --permanent --add-service=ssh
        firewall-cmd --permanent --add-service=http
        firewall-cmd --permanent --add-service=https
        firewall-cmd --reload
      fi
      ;;
  esac
}

configure_selinux() {
  if [[ "${PLATFORM}" == "rhel" ]] \
    && command -v getenforce >/dev/null 2>&1 \
    && command -v setsebool >/dev/null 2>&1 \
    && [[ "$(getenforce)" == "Enforcing" ]]; then
    setsebool -P httpd_can_network_connect 1
  fi
}

install_base_packages
install_node_if_needed

NOLOGIN_SHELL="$(command -v nologin || echo /usr/sbin/nologin)"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --create-home --shell "${NOLOGIN_SHELL}" "${APP_USER}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

cp deploy/vps/yapayzekalab.service "/etc/systemd/system/${SERVICE_NAME}.service"
install_nginx_config
configure_selinux

nginx -t
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl enable nginx
configure_firewall

echo "Base VPS packages are ready for ${DOMAIN} on ${PLATFORM}."
echo "Next: clone the repo into ${APP_DIR}, create ${APP_DIR}/.env.production, run scripts/vps-deploy.sh, then certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}."
