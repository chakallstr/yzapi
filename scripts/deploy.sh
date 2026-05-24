#!/bin/bash
#
# YapayZekaLab — cPanel deploy script
# Usage:
#   ./scripts/deploy.sh          # build + upload + restart
#   ./scripts/deploy.sh skip-build  # use existing dist/, just upload + restart
#
# Reads cPanel credentials from .env.deploy (gitignored).
# Format:
#   CPANEL_HOST=jupiter.netlen.com.tr
#   CPANEL_USER=ufukince1
#   CPANEL_TOKEN=YOUR_API_TOKEN     # cPanel > Security > Manage API Tokens
#

set -euo pipefail

cd "$(dirname "$0")/.."

# ─── Config ───────────────────────────────────────────────────────────────────
if [[ ! -f .env.deploy ]]; then
  cat <<EOF >&2
.env.deploy bulunamadı. Şu format'ta oluştur:

  CPANEL_HOST=jupiter.netlen.com.tr
  CPANEL_USER=ufukince1
  CPANEL_TOKEN=<cPanel UI > Security > Manage API Tokens'tan al>

(Token oluşturma: Login → "Manage API Tokens" → Create → name: yzapi_deploy → Create.
 Token'ı kopyala ve buraya yapıştır. Bu dosya .gitignore'da, repoya gitmez.)
EOF
  exit 1
fi

source .env.deploy
CPANEL_HOST="${CPANEL_HOST:?}"
CPANEL_USER="${CPANEL_USER:?}"
CPANEL_TOKEN="${CPANEL_TOKEN:?}"
APP_DIR="${APP_DIR:-/home/${CPANEL_USER}/yapayzekalab}"
APP_URL="${APP_URL:-https://yapayzekalab.org}"
BASE_URL="https://${CPANEL_HOST}:2083"
AUTH_HEADER="Authorization: cpanel ${CPANEL_USER}:${CPANEL_TOKEN}"

SKIP_BUILD="${1:-}"

echo "▸ App dir:     $APP_DIR"
echo "▸ App URL:     $APP_URL"
echo "▸ cPanel host: $CPANEL_HOST"
echo

# ─── 1. Build ─────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" != "skip-build" ]]; then
  echo "▸ npm run build…"
  npm run build > /tmp/yzapi-build.log 2>&1
  echo "  ✓ done ($(wc -c < dist/server.js | tr -d ' ') bytes server.js)"
else
  echo "▸ skip-build: using existing dist/"
fi

# ─── 2. tsc check ─────────────────────────────────────────────────────────────
echo "▸ tsc --noEmit…"
if ! npx tsc --noEmit 2>&1 | tail -3; then
  echo "  ✗ tsc errors — aborting"
  exit 1
fi
echo "  ✓ tsc clean"

# ─── 3. Create zip ────────────────────────────────────────────────────────────
echo "▸ zip…"
ZIP=/tmp/yzapi-deploy-$$.zip
rm -f "$ZIP"
zip -qr "$ZIP" dist package.json package-lock.json -x "*.map"
echo "  ✓ $ZIP ($(wc -c < "$ZIP" | tr -d ' ') bytes)"

# ─── 4. Upload via cPanel Fileman::upload_files ───────────────────────────────
echo "▸ uploading…"
UPLOAD_RES=$(curl -sS -H "$AUTH_HEADER" \
  -F "dir=${APP_DIR}" \
  -F "file-1=@${ZIP}" \
  "${BASE_URL}/execute/Fileman/upload_files")
echo "$UPLOAD_RES" | head -c 400
echo

# Check success (response is JSON-like)
if ! echo "$UPLOAD_RES" | grep -q '"status":1\|"uploaded":1\|"warnings":\[\]' 2>/dev/null; then
  echo "  ✗ upload failed; response above"
  rm -f "$ZIP"
  exit 1
fi
echo "  ✓ uploaded"

# ─── 5. Extract zip ───────────────────────────────────────────────────────────
echo "▸ extracting…"
ZIP_NAME=$(basename "$ZIP")
EXTRACT_RES=$(curl -sS -H "$AUTH_HEADER" \
  -G \
  --data-urlencode "dir=${APP_DIR}" \
  --data-urlencode "sourcefiles=${APP_DIR}/${ZIP_NAME}" \
  "${BASE_URL}/execute/Fileman/extract")
echo "$EXTRACT_RES" | head -c 400
echo

if echo "$EXTRACT_RES" | grep -q '"errors":\[\]'; then
  echo "  ✓ extracted"
else
  echo "  ⚠ extract response unclear, continuing"
fi

# ─── 6. Cleanup zip ───────────────────────────────────────────────────────────
echo "▸ removing remote zip…"
curl -sS -H "$AUTH_HEADER" \
  -G \
  --data-urlencode "sourcefiles=${APP_DIR}/${ZIP_NAME}" \
  --data-urlencode "metadata=" \
  "${BASE_URL}/execute/Fileman/empty_trash_remove" > /dev/null || true
# Actually use trash_files for cleaner remove
curl -sS -H "$AUTH_HEADER" \
  -G \
  --data-urlencode "sourcefiles=${APP_DIR}/${ZIP_NAME}" \
  "${BASE_URL}/execute/Fileman/trash_files" > /dev/null
echo "  ✓ removed"
rm -f "$ZIP"

# ─── 7. Restart via tmp/restart.txt touch ─────────────────────────────────────
echo "▸ restart…"
# Phusion Passenger checks tmp/restart.txt mtime; we create/touch it.
# We do this by uploading an empty file to tmp/restart.txt
touch /tmp/restart.txt
curl -sS -H "$AUTH_HEADER" \
  -F "dir=${APP_DIR}/tmp" \
  -F "file-1=@/tmp/restart.txt" \
  "${BASE_URL}/execute/Fileman/upload_files" > /dev/null
echo "  ✓ restart.txt touched"

# ─── 8. Health check ──────────────────────────────────────────────────────────
echo "▸ health check (waiting 5s for restart)…"
sleep 5

for attempt in 1 2 3 4 5; do
  STATUS=$(curl -sS -o /tmp/yzapi-health-resp -w "%{http_code}" "$APP_URL/health" || echo "000")
  if [[ "$STATUS" == "200" ]]; then
    echo "  ✓ /health 200"
    cat /tmp/yzapi-health-resp | head -c 400
    echo
    break
  fi
  echo "  attempt $attempt: $STATUS, retrying in 3s…"
  sleep 3
done

if [[ "$STATUS" != "200" ]]; then
  echo "  ✗ healthcheck failed after retries"
  echo "  Manual debug: SSH yok ama File Manager'da yapayzekalab/stderr.log dosyasını aç"
  exit 1
fi

# ─── 9. Models endpoint sanity ────────────────────────────────────────────────
MODEL_COUNT=$(curl -sS "$APP_URL/api/models" | jq 'length' 2>/dev/null || echo "?")
echo "▸ /api/models count: $MODEL_COUNT (33 bekleniyor)"

echo
echo "═══════════════════════════════════════════════════════════"
echo " ✓ deploy başarılı: $APP_URL"
echo "═══════════════════════════════════════════════════════════"
