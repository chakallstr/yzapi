# YZAPI Yenivps Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `yenivps` the sole YZAPI host at `https://yzapi.seslab.tr/v1` and retire the old `api.yapayzekalab.org` YZAPI path.

**Architecture:** Back up both live states, restore a consistent source PostgreSQL snapshot on `yenivps`, deploy the tested YZAPI worktree, expose only the new SesLab subdomain through Nginx/TLS, then retire the old route after authenticated tool-call proof. The source remains restartable until every external acceptance gate passes.

**Tech Stack:** Node.js 22, TypeScript, PostgreSQL 14, systemd, Nginx, Certbot, rsync/SSH, Vitest.

---

### Task 1: Record and back up both live states

**Files:**
- Read: `/opt/turkapiprojesi/.env.production`
- Back up: `/opt/turkapiprojesi`, PostgreSQL database, systemd unit, and YZAPI Nginx vhosts on both servers

- [ ] Verify source and target host identity, service state, port `4568`, database identity, and disk capacity.
- [ ] Create timestamped target backups under `/opt/turkapiprojesi/.deploy/predeploy-backups/`.
- [ ] Create a source PostgreSQL custom-format dump and record table counts without printing customer rows or secrets.
- [ ] Verify each backup exists and has non-zero size.

### Task 2: Prepare target runtime and configuration

**Files:**
- Modify: `/opt/turkapiprojesi/.env.production` on `yenivps`
- Modify: `/etc/systemd/system/turkapiprojesi.service` on `yenivps` only if runtime drift requires it

- [ ] Compare environment key names and critical crypto-secret equality using redacted equality checks.
- [ ] Preserve the target-local `DATABASE_URL`, port, and host settings.
- [ ] Transfer only required source runtime/crypto values without printing them.
- [ ] Run an environment parse/import check before restarting the service.

### Task 3: Restore database and deploy tested code

**Files:**
- Deploy from: `/Users/ufuk/.config/superpowers/worktrees/yzapi/yzapi-additional-tools-mvp-20260727`
- Deploy to: `yenivps:/opt/turkapiprojesi`

- [ ] Stop target `turkapiprojesi` and restore the source dump into the target database.
- [ ] Rsync the tested worktree while excluding `.git`, `.env*`, `node_modules`, build output, and deployment backups.
- [ ] Run `npm ci`, migrations, `npm run lint`, `npm test`, `npm run build`, and `npm run scan:public`.
- [ ] Restart `turkapiprojesi`; verify active state, `127.0.0.1:4568/health=200`, and `/status=200`.
- [ ] Compare source/target table counts and required provider routing state.

### Task 4: Publish `yzapi.seslab.tr`

**Files:**
- Create: `/etc/nginx/conf.d/yzapi.seslab.tr.conf` on `yenivps`

- [ ] Install an HTTP-only vhost that proxies YZAPI and rejects unrelated website paths.
- [ ] Add DNS A record `yzapi.seslab.tr -> 153.56.184.202`.
- [ ] Verify DNS propagation from independent resolvers.
- [ ] Obtain and install the certificate with Certbot.
- [ ] Run `nginx -t`, reload Nginx, and verify certificate, `/health`, `/status`, and `/v1/models` externally.

### Task 5: Prove all required tool calls

**Files:**
- Use temporary runtime script only; do not commit credentials or outputs containing them

- [ ] Generate one temporary funded YZAPI key/user on the target.
- [ ] Test non-stream `exec`, `wait`, and `apply_patch` via `https://yzapi.seslab.tr/v1/responses`.
- [ ] Test namespace `exec` and streaming `wait`.
- [ ] Verify exact names, no doubled aliases, HTTP 200, and positive tool-call telemetry for every request ID.
- [ ] Revoke the key and disable/zero the temporary user even if a test fails.

### Task 6: Retire the old connection and close out

**Files:**
- Modify/remove: old `api.yapayzekalab.org` DNS record and YZAPI Nginx vhost on `yzapi-vps`

- [ ] Remove the old YZAPI DNS/route only after Task 5 passes.
- [ ] Disable source `turkapiprojesi` and verify port `4568` is no longer serving there.
- [ ] Re-run the new endpoint health/models/tool proof after retirement.
- [ ] Update target `.deploy/current-release.json` with commit, backup paths, migration timestamp, and verification results.
- [ ] Verify GitHub branch `fix/yzapi-additional-tools-mvp-20260727` contains commit `8f3ff67` and no secret/untracked test artifact is staged.

