#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yapayzekalab}"
SERVICE="${SERVICE:-yapayzekalab}"
PORT="${PORT:-4567}"
LINES="${LINES:-100}"

echo "== YapayZekaLab VPS Ops Status =="
date -u +"utc=%Y-%m-%dT%H:%M:%SZ"
echo "app_dir=${APP_DIR}"
echo "service=${SERVICE}"
echo "port=${PORT}"

echo
echo "== Git =="
if [[ -d "${APP_DIR}/.git" ]]; then
  git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD || true
  git -C "${APP_DIR}" rev-parse --short HEAD || true
  git -C "${APP_DIR}" status --short || true
else
  echo "git repo not found"
fi

echo
echo "== systemd =="
systemctl is-active "${SERVICE}" || true
systemctl --no-pager --full status "${SERVICE}" | sed -n '1,35p' || true

echo
echo "== nginx =="
nginx -t || true

echo
echo "== port =="
if command -v ss >/dev/null 2>&1; then
  ss -ltnp | grep ":${PORT} " || true
else
  netstat -ltnp 2>/dev/null | grep ":${PORT} " || true
fi

echo
echo "== disk/memory =="
df -h "${APP_DIR}" || true
free -h || true

echo
echo "== recent app logs =="
journalctl -u "${SERVICE}" -n "${LINES}" --no-pager || true

echo
echo "== recent nginx errors =="
tail -n "${LINES}" /var/log/nginx/error.log 2>/dev/null || true
