#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/turkapiprojesi}"
SERVICE="${SERVICE:-turkapiprojesi}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:4568}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-${APP_DIR}/.deploy}"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_STATE_DIR}/db-backups}"
RELEASE_DIR="${RELEASE_DIR:-${DEPLOY_STATE_DIR}/releases}"
REQUIRED_ENV_KEYS=(NODE_ENV PORT DATABASE_URL JWT_SECRET API_KEY_ENCRYPTION_SECRET APP_BASE_URL FRONTEND_AUTH_RETURN CLOSEROUTER_API_KEY)

cd "${APP_DIR}"
mkdir -p "${DEPLOY_STATE_DIR}" "${BACKUP_DIR}" "${RELEASE_DIR}"

if [[ ! -f .env.production ]]; then
  echo ".env.production missing in ${APP_DIR}; aborting." >&2
  exit 1
fi

if [[ "$(stat -c '%a' .env.production 2>/dev/null || stat -f '%Lp' .env.production)" != "600" ]]; then
  echo ".env.production permissions must be 600; aborting." >&2
  exit 1
fi

echo "▸ Environment checklist"
missing_env=()
for key in "${REQUIRED_ENV_KEYS[@]}"; do
  if ! grep -Eq "^${key}=.+" .env.production; then
    missing_env+=("${key}")
  fi
done
if (( ${#missing_env[@]} > 0 )); then
  printf 'Missing required env keys: %s\n' "${missing_env[*]}" >&2
  exit 1
fi

# Y4: API_KEY_ENCRYPTION_SECRET must differ from JWT_SECRET, otherwise a single
# JWT_SECRET leak also decrypts every stored API key. env.ts enforces this at
# boot in production; catch it here so a bad config fails the deploy early
# (before migrate, which would otherwise crash on the same superRefine).
jwt_secret_val="$(grep -E '^JWT_SECRET=' .env.production | head -n1 | cut -d= -f2-)"
api_enc_val="$(grep -E '^API_KEY_ENCRYPTION_SECRET=' .env.production | head -n1 | cut -d= -f2-)"
if [[ -n "${api_enc_val}" && "${api_enc_val}" == "${jwt_secret_val}" ]]; then
  echo "API_KEY_ENCRYPTION_SECRET must differ from JWT_SECRET (secret separation); aborting." >&2
  exit 1
fi

# K4: if the Telegram bot channel is configured, the webhook secret is mandatory
# in production — otherwise the webhook rejects every update and the bot stops.
if grep -Eq '^TELEGRAM_BOT_TOKEN=.+' .env.production; then
  if ! grep -Eq '^TELEGRAM_WEBHOOK_SECRET=.+' .env.production; then
    echo "TELEGRAM_BOT_TOKEN is set but TELEGRAM_WEBHOOK_SECRET is missing." >&2
    echo "K4 rejects all webhook updates in production without it (bot stops); aborting." >&2
    echo "Set TELEGRAM_WEBHOOK_SECRET and bind it via Telegram setWebhook secret_token." >&2
    exit 1
  fi
fi

previous_rev="$(git rev-parse HEAD)"
deploy_id="$(date -u +%Y%m%dT%H%M%SZ)-${previous_rev:0:12}"
deploy_file="${DEPLOY_STATE_DIR}/${deploy_id}.txt"
manifest_file="${RELEASE_DIR}/${deploy_id}.json"
rollback_file="${DEPLOY_STATE_DIR}/rollback-last.sh"

{
  echo "deploy_id=${deploy_id}"
  echo "previous_rev=${previous_rev}"
  echo "app_dir=${APP_DIR}"
  echo "service=${SERVICE}"
  echo "created_at_utc=$(date -u +%FT%TZ)"
} > "${deploy_file}"

node --input-type=module <<NODE
import { writeFileSync } from "node:fs";
const manifest = {
  deploy_id: "${deploy_id}",
  created_at_utc: new Date().toISOString(),
  app_dir: "${APP_DIR}",
  service: "${SERVICE}",
  branch: "$(git rev-parse --abbrev-ref HEAD)",
  previous_rev: "${previous_rev}",
  backup_file: null,
  smoke: null,
  rollback_file: "${rollback_file}",
};
writeFileSync("${manifest_file}", JSON.stringify(manifest, null, 2) + "\\n");
NODE

cat > "${rollback_file}" <<ROLLBACK
#!/usr/bin/env bash
set -euo pipefail
cd "${APP_DIR}"
git checkout "${previous_rev}"
npm ci
npm run build
sudo systemctl restart "${SERVICE}"
SMOKE_BASE_URL="${SMOKE_BASE_URL}" npm run smoke:vps
ROLLBACK
chmod 700 "${rollback_file}"

echo "▸ Rollback script prepared: ${rollback_file}"
echo "  To rollback: sudo -u $(whoami) ${rollback_file}"

echo "▸ Installing dependencies"
npm ci

echo "▸ Database connection check"
NODE_ENV=production node --input-type=module <<'NODE'
import dotenv from "dotenv";
import postgres from "postgres";
dotenv.config({ path: ".env.production" });
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql`SELECT 1`;
await sql.end();
console.log("db: ok");
NODE

echo "▸ Typecheck"
npm run lint

echo "▸ Tests"
npm test

echo "▸ Build"
npm run build

echo "▸ Public bundle scan"
npm run scan:public

echo "▸ Database backup"
database_url="$(grep -E '^DATABASE_URL=' .env.production | head -n1 | cut -d= -f2-)"
backup_file="${BACKUP_DIR}/${deploy_id}.dump"
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump missing; install postgresql-client before production deploy." >&2
  exit 1
fi
pg_dump "${database_url}" --format=custom --no-owner --no-privileges --file="${backup_file}"
echo "db_backup=${backup_file}" >> "${deploy_file}"
node --input-type=module <<NODE
import { readFileSync, writeFileSync } from "node:fs";
const path = "${manifest_file}";
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.backup_file = "${backup_file}";
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\\n");
NODE

echo "▸ Migrations"
NODE_ENV=production npm run db:migrate

echo "▸ Restart ${SERVICE}"
sudo systemctl restart "${SERVICE}"
sleep 3

echo "▸ Smoke checks"
set +e
smoke_output="$(SMOKE_BASE_URL="${SMOKE_BASE_URL}" npm run smoke:vps 2>&1)"
smoke_code=$?
set -e
printf '%s\n' "${smoke_output}"
SMOKE_OUTPUT="${smoke_output}" node --input-type=module <<NODE
import { readFileSync, writeFileSync } from "node:fs";
const path = "${manifest_file}";
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.smoke = {
  exit_code: ${smoke_code},
  output: process.env.SMOKE_OUTPUT,
  completed_at_utc: new Date().toISOString(),
};
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\\n");
NODE
if [[ "${smoke_code}" -ne 0 ]]; then
  echo "Smoke failed. Rollback is available at ${rollback_file}" >&2
  exit "${smoke_code}"
fi

echo "✓ VPS deploy completed"
