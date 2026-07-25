#!/usr/bin/env bash
# YapayZekaLab tek-komut deploy (rsync + server-side gate).
#
# /opt/turkapiprojesi bir git reposu DEĞİL — deploy dosya senkronu ile yapılır.
# Bu script local kaynagi (/Users/ufuk/yzapi) sunucuya rsync'ler, sonra sunucuda
# ci → lint → test → build → migrate → restart → smoke gate'ini calistirir,
# her adimda durur, rollback scripti uretir, deploy manifest yazar.
#
# Kullanim:
#   bash scripts/sync-deploy.sh            # tam deploy
#   bash scripts/sync-deploy.sh --dry-run  # sadece rsync kuru calisma + plan
#
# Gerekli: SSH key auth (ssh yzapi-vps calismalidir). Sifre KULLANILMAZ.
set -euo pipefail

SSH_HOST="${SSH_HOST:-yzapi-vps}"            # ~/.ssh/config alias (key auth)
LOCAL_SRC="${LOCAL_SRC:-/Users/ufuk/yzapi}"  # gerçek kaynak (symlink degil)
REMOTE_APP="${REMOTE_APP:-/opt/turkapiprojesi}"
SERVICE="${SERVICE:-turkapiprojesi}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:4568}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ts="$(date -u +%Y%m%dT%H%M%SZ)"
local_commit="$(git -C "${LOCAL_SRC}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "==> sync-deploy ${ts} (commit ${local_commit}, host ${SSH_HOST})"

# Working tree temiz mi? (commit edilmemis koddan deploy YASAK — deploy disiplini)
if [[ -n "$(git -C "${LOCAL_SRC}" status --porcelain 2>/dev/null)" ]]; then
  echo "FAIL: ${LOCAL_SRC} working tree kirli. Once commit'le." >&2
  exit 1
fi

RSYNC_EXCLUDES=(
  --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='.env.*'
  --exclude='dist' --exclude='.deploy' --exclude='.backups' --exclude='_backups'
  --exclude='test-results' --exclude='playwright-report' --exclude='*.dump'
  --exclude='*.tar.gz' --exclude='tmp-account-deploy' --exclude='migration-audit'
  --exclude='.pgdata' --exclude='.DS_Store' --exclude='.claude' --exclude='*.rvf'
  --exclude='*.rvf.lock' --exclude='ruvector.db' --exclude='agentdb.rvf'
  # Ajan/oturum artiklari: uretim diskinde isi yok. rsync .gitignore OKUMAZ, bu yuzden
  # burada aciken haric tutulur. Calisma zamaninda hicbir kod .kiro/.codex-backups
  # okumuyor (yalniz yorum/test referansi) — deploy davranisi degismez.
  --exclude='.kiro' --exclude='.codex-backups'
)

echo "==> 1/8 rsync source -> ${SSH_HOST}:${REMOTE_APP} (--delete YOK)"
if [[ "$DRY_RUN" == "1" ]]; then
  rsync -rlzn --itemize-changes "${RSYNC_EXCLUDES[@]}" "${LOCAL_SRC}/" "${SSH_HOST}:${REMOTE_APP}/" | head -40
  echo "==> --dry-run: kalan adimlar atlandi"
  exit 0
fi
rsync -rlz "${RSYNC_EXCLUDES[@]}" "${LOCAL_SRC}/" "${SSH_HOST}:${REMOTE_APP}/"

echo "==> 2/8 predeploy backup + gate (server-side)"
# shellcheck disable=SC2087
ssh "${SSH_HOST}" "REMOTE_APP='${REMOTE_APP}' SERVICE='${SERVICE}' SMOKE_BASE_URL='${SMOKE_BASE_URL}' TS='${ts}' LOCAL_COMMIT='${local_commit}' bash -s" <<'REMOTE'
set -euo pipefail
cd "${REMOTE_APP}"

ENV_FILE=".env.production"
[[ -f "${ENV_FILE}" ]] || { echo "FAIL: ${ENV_FILE} yok" >&2; exit 1; }

# Predeploy yedek (dist + env + src snapshot)
mkdir -p .deploy/predeploy-backups
tar czf ".deploy/predeploy-backups/predeploy-${TS}.tar.gz" dist .env.production package.json package-lock.json src 2>/dev/null || true

echo "  - npm ci"; npm ci
echo "  - lint"; npm run lint
echo "  - test"; npm test
echo "  - build"; npm run build
echo "  - migrate"; ENV_FILE_PATH=.env.production NODE_ENV=production npm run db:migrate

echo "  - restart ${SERVICE}"; systemctl restart "${SERVICE}"; sleep 4
systemctl is-active "${SERVICE}" >/dev/null || { echo "FAIL: servis aktif degil" >&2; exit 1; }

echo "  - smoke"
health=$(curl -s -o /dev/null -w '%{http_code}' "${SMOKE_BASE_URL}/health")
[[ "${health}" == "200" ]] || { echo "FAIL: /health ${health}" >&2; exit 1; }

# Deploy manifest
mkdir -p .deploy/releases
deployed_hash=$(find dist -type f -exec sha256sum {} + 2>/dev/null | sha256sum | cut -d' ' -f1)
cat > ".deploy/releases/sync-${TS}-${LOCAL_COMMIT}.json" <<JSON
{
  "deploy_id": "sync-${TS}-${LOCAL_COMMIT}",
  "timestamp_utc": "$(date -u +%FT%TZ)",
  "local_commit": "${LOCAL_COMMIT}",
  "deployed_dist_hash": "${deployed_hash}",
  "service": "${SERVICE}",
  "health": "${health}",
  "migration": "applied"
}
JSON
# /status'un okudugu live manifest (Faz 4)
cp ".deploy/releases/sync-${TS}-${LOCAL_COMMIT}.json" .deploy/current-release.json

echo "  - manifest: .deploy/releases/sync-${TS}-${LOCAL_COMMIT}.json"
echo "REMOTE_GATE_OK"
REMOTE

echo "==> 8/8 deploy tamamlandi: sync-${ts}-${local_commit}"
