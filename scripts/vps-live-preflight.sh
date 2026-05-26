#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-yapayzekalab.org}"
BASE_URL="${SMOKE_BASE_URL:-https://${DOMAIN}}"
VPS_ALIAS="${VPS_ALIAS:-vps}"
APP_DIR="${APP_DIR:-/opt/yapayzekalab}"
SERVICE="${SERVICE:-yapayzekalab}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-phase/release-vps-beta}"
EXPECTED_MODELS="${EXPECTED_MODELS:-33}"
REQUIRED_ENV_KEYS=(NODE_ENV PORT DATABASE_URL JWT_SECRET APP_BASE_URL FRONTEND_AUTH_RETURN CLOSEROUTER_API_KEY)

failures=0

section() {
  printf '\n== %s ==\n' "$1"
}

ok() {
  printf 'ok: %s\n' "$1"
}

warn() {
  printf 'warn: %s\n' "$1"
}

fail() {
  printf 'fail: %s\n' "$1"
  failures=$((failures + 1))
}

http_status() {
  local path="$1"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -sS -o "${tmp}" -w '%{http_code}' --max-time 12 "${BASE_URL}${path}" || true)"
  printf '%s' "${code}"
  rm -f "${tmp}"
}

section "Local release"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  rev="$(git rev-parse --short HEAD)"
  echo "branch=${branch}"
  echo "rev=${rev}"
  if [[ "${branch}" == "${EXPECTED_BRANCH}" ]]; then
    ok "local branch matches ${EXPECTED_BRANCH}"
  else
    fail "local branch is ${branch}, expected ${EXPECTED_BRANCH}"
  fi
else
  warn "not inside a git repository"
fi

section "DNS"
dns_ips=""
if command -v dig >/dev/null 2>&1; then
  dns_ips="$(dig +short A "${DOMAIN}" | tr '\n' ' ')"
elif command -v nslookup >/dev/null 2>&1; then
  dns_ips="$(nslookup "${DOMAIN}" 2>/dev/null | awk '/^Address: /{print $2}' | tr '\n' ' ')"
else
  warn "dig/nslookup not available"
fi
echo "domain=${DOMAIN}"
echo "dns_ips=${dns_ips:-unknown}"

section "Live HTTP"
health_code="$(http_status /health)"
echo "/health=${health_code}"
if [[ "${health_code}" == "200" ]]; then
  ok "/health returns 200"
else
  fail "/health is ${health_code}, expected 200"
fi

status_code="$(http_status /status)"
echo "/status=${status_code}"
if [[ "${status_code}" == "200" ]]; then
  ok "/status returns 200"
else
  fail "/status is ${status_code}, expected 200"
fi

models_count="$(curl -sS --max-time 12 "${BASE_URL}/api/models" | node -e '
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const json = JSON.parse(d);
    const models = Array.isArray(json) ? json : json.models || json.data || [];
    process.stdout.write(String(models.length));
  } catch {
    process.stdout.write("not-json");
    process.exitCode = 2;
  }
});
' 2>/dev/null || true)"
echo "/api/models=${models_count}"
if [[ "${models_count}" == "${EXPECTED_MODELS}" ]]; then
  ok "/api/models returns ${EXPECTED_MODELS} models"
else
  fail "/api/models returned ${models_count}, expected ${EXPECTED_MODELS}"
fi

section "VPS read-only"
remote_output="$(mktemp)"
if ssh -o BatchMode=yes -o ConnectTimeout=8 "${VPS_ALIAS}" \
  "APP_DIR='${APP_DIR}' SERVICE='${SERVICE}' EXPECTED_BRANCH='${EXPECTED_BRANCH}' REQUIRED_ENV_KEYS='${REQUIRED_ENV_KEYS[*]}' bash -s" >"${remote_output}" <<'REMOTE'
set -euo pipefail
echo "host=$(hostname)"
echo "app_dir=${APP_DIR}"
echo "service=${SERVICE}"

if [[ -d "${APP_DIR}/.git" ]]; then
  echo "app_repo=present"
  branch="$(git -C "${APP_DIR}" rev-parse --abbrev-ref HEAD || true)"
  rev="$(git -C "${APP_DIR}" rev-parse --short HEAD || true)"
  echo "app_branch=${branch}"
  echo "app_rev=${rev}"
  [[ "${branch}" == "${EXPECTED_BRANCH}" ]] || echo "preflight_fail=branch_mismatch"
else
  echo "app_repo=missing"
  echo "preflight_fail=app_repo_missing"
fi

if [[ -f "${APP_DIR}/.env.production" ]]; then
  perms="$(stat -c '%a' "${APP_DIR}/.env.production" 2>/dev/null || stat -f '%Lp' "${APP_DIR}/.env.production")"
  echo "env_file=present"
  echo "env_perms=${perms}"
  [[ "${perms}" == "600" ]] || echo "preflight_fail=env_permissions"
  for key in ${REQUIRED_ENV_KEYS}; do
    grep -Eq "^${key}=.+" "${APP_DIR}/.env.production" || echo "preflight_fail=missing_env_${key}"
  done
else
  echo "env_file=missing"
  echo "preflight_fail=env_missing"
fi

service_state="$(systemctl is-active "${SERVICE}" 2>/dev/null || true)"
echo "service_active=${service_state}"
[[ "${service_state}" == "active" ]] || echo "preflight_fail=service_not_active"

nginx -t >/tmp/yapayzekalab-nginx-preflight.out 2>&1 \
  && echo "nginx_config=ok" \
  || { echo "nginx_config=failed"; cat /tmp/yapayzekalab-nginx-preflight.out; echo "preflight_fail=nginx"; }
REMOTE
then
  cat "${remote_output}"
  if grep -q '^preflight_fail=' "${remote_output}"; then
    fail "vps read-only check reported blockers"
  else
    ok "ssh read-only check reached ${VPS_ALIAS}"
  fi
else
  cat "${remote_output}" 2>/dev/null || true
  fail "ssh read-only check failed for ${VPS_ALIAS}"
fi
rm -f "${remote_output}"

section "Result"
if (( failures > 0 )); then
  echo "preflight=BLOCKER failures=${failures}"
  exit 1
fi

echo "preflight=OK"
