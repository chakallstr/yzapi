#!/usr/bin/env bash
set -euo pipefail

# Bring up the local stack for e2e: Postgres (docker) + migrate + seed, then start
# the server. Intended for LOCAL testing only.
# Usage: bash scripts/e2e-up.sh   (leaves the server running in foreground)

cd "$(dirname "$0")/.."

echo "[e2e-up] starting postgres (docker compose)"
docker compose up -d postgres

echo "[e2e-up] waiting for postgres healthcheck"
for i in $(seq 1 30); do
  status="$(docker compose ps --format '{{.Health}}' postgres 2>/dev/null || true)"
  if echo "$status" | grep -qi healthy; then
    echo "[e2e-up] postgres healthy"
    break
  fi
  sleep 2
done

echo "[e2e-up] running migrations"
npm run db:migrate

echo "[e2e-up] seeding (best-effort)"
npm run db:seed || echo "[e2e-up] seed skipped/failed (continuing)"

echo "[e2e-up] starting server on PORT=${PORT:-4567}"
exec npm run dev
