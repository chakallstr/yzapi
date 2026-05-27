# YapayZekaLab Next Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canlı VPS Beta release kapısını kanıtla açmak, ardından müşteri aktivasyonunu production seviyesine taşımak.

**Architecture:** Ana akış `Müşteri -> YapayZekaLab Backend -> CloseRouter` olarak kalır. VPS üzerinde Nginx `127.0.0.1:4567` Node/systemd servisine proxy yapar; billing, ledger, API key, admin ve fiyat kontrolü bizim backendde kalır. `9Router` sadece ileride `ProviderAdapter` arkasında kapalı POC/fallback adayıdır.

**Tech Stack:** Node.js 22, Express, TypeScript, React/Vite, PostgreSQL/Neon, Drizzle, Vitest, Pino, Nginx, systemd, CentOS Stream 8 VPS.

---

## Current Verified State

- Branch: `phase/release-vps-beta`
- Head before this plan: `d426bf9`
- Live preflight: `preflight=BLOCKER failures=4`
- DNS: `yapayzekalab.org -> 77.92.151.228`
- Target VPS alias: `vps -> 91.228.227.88`
- Target VPS OS: `CentOS Stream 8`
- VPS current state:
  - `/opt/yapayzekalab` missing
  - `/opt/yapayzekalab/.env.production` missing
  - `yapayzekalab` service inactive
  - Nginx config syntax ok
- Agent status:
  - Ruflo mesh swarm initialized: `swarm-1779653015913-xntzke`
  - Ruflo worker spawn failed: `Hive-mind not initialized`
  - Native agent spawn failed: `agent thread limit reached`
  - Therefore the 6 roles below are assigned as execution lanes, not fake completed agents.

## 6 Agent Lane Decisions

| Lane | Decision | Status |
|---|---|---|
| Agent 1 Product/Growth | Text-only Beta API first; image/video not production-ready until usage proof. | OK |
| Agent 2 Backend/Ledger | Do not touch ledger before live deploy; after deploy add outbox/retry and stronger idempotency tests. | OK |
| Agent 3 Deploy/Ops | Next blocker is CentOS-compatible setup, app bootstrap, DNS, certbot, deploy smoke. | BLOCKER until VPS is configured |
| Agent 4 Security/Abuse | Keep public formula/secret scans in every gate; add rate-limit/daily TL limits after live release. | OK |
| Agent 5 Frontend/Panel | Customer dashboard work starts only after live Beta API smoke is green. | WAIT |
| Agent 6 QA/Release | No phase is complete without `WORKLOG`, fresh command evidence, commit and push. | OK |

## Phase Order

### Phase 2A: CentOS-Compatible VPS Setup Gate

**Files:**
- Modify: `scripts/vps-setup.sh`
- Modify: `docs/vps-deploy.md`
- Modify: `docs/incident-503-runbook.md`
- Modify: `agent-team/WORKLOG.md`

- [ ] **Step 1: Add distro detection to setup script**

  Update `scripts/vps-setup.sh` so it detects package manager:

  ```bash
  if command -v apt-get >/dev/null 2>&1; then
    PLATFORM="debian"
  elif command -v dnf >/dev/null 2>&1; then
    PLATFORM="rhel"
  else
    echo "Unsupported Linux distribution: apt-get or dnf required." >&2
    exit 1
  fi
  ```

- [ ] **Step 2: Keep Debian path working**

  Debian/Ubuntu path keeps:

  ```bash
  apt-get update
  apt-get install -y ca-certificates curl gnupg git nginx ufw fail2ban certbot python3-certbot-nginx postgresql-client
  ```

  Expected: existing Ubuntu runbook remains valid.

- [ ] **Step 3: Add CentOS/RHEL path**

  CentOS path installs only missing base tools and avoids `sites-enabled`:

  ```bash
  dnf install -y ca-certificates curl git nginx policycoreutils-python-utils postgresql
  dnf install -y certbot python3-certbot-nginx || true
  ```

  Expected: script can run on the current `vps` host without calling `apt-get`.

- [ ] **Step 4: Make Nginx target distro-aware**

  Debian target:

  ```bash
  /etc/nginx/sites-available/yapayzekalab
  /etc/nginx/sites-enabled/yapayzekalab
  ```

  CentOS target:

  ```bash
  /etc/nginx/conf.d/yapayzekalab.conf
  ```

  Expected: current SesLab configs under `/etc/nginx/conf.d/` are not removed.

- [ ] **Step 5: Verify setup script without mutating live**

  Run locally:

  ```bash
  bash -n scripts/vps-setup.sh scripts/vps-deploy.sh scripts/vps-ops-status.sh scripts/vps-live-preflight.sh
  git diff --check
  ```

  Expected: both commands exit `0`.

- [ ] **Step 6: Commit Phase 2A**

  ```bash
  git add scripts/vps-setup.sh docs/vps-deploy.md docs/incident-503-runbook.md agent-team/WORKLOG.md
  git commit -m "chore: support CentOS VPS setup"
  git push origin phase/release-vps-beta
  ```

### Phase 2B: VPS App Bootstrap

**Files:**
- No repo code changes expected.
- Update: `agent-team/WORKLOG.md`
- Update: `CLAUDE.md`

- [ ] **Step 1: Create app directory without touching SesLab**

  Run on VPS:

  ```bash
  ssh vps 'mkdir -p /opt/yapayzekalab && chown -R root:root /opt/yapayzekalab'
  ```

  Expected: `/opt/yapayzekalab` exists.

- [ ] **Step 2: Clone release branch**

  Run on VPS:

  ```bash
  ssh vps 'cd /opt/yapayzekalab && git clone --branch phase/release-vps-beta https://github.com/chakallstr/yzapi.git .'
  ```

  Expected: `git -C /opt/yapayzekalab rev-parse --abbrev-ref HEAD` returns `phase/release-vps-beta`.

- [ ] **Step 3: Install service and Nginx config**

  Run on VPS after repo exists:

  ```bash
  ssh vps 'cd /opt/yapayzekalab && bash scripts/vps-setup.sh'
  ```

  Expected: `nginx -t` passes and `systemctl is-enabled yapayzekalab` returns enabled.

- [ ] **Step 4: Record evidence**

  Run locally:

  ```bash
  npm run preflight:live
  ```

  Expected at this point: HTTP may still be blocked by DNS, but app repo should no longer be missing.

### Phase 2C: Production Env and Test Keys

**Files:**
- No secret committed.
- Update: `agent-team/WORKLOG.md`

- [ ] **Step 1: Create production env on VPS**

  Run on VPS:

  ```bash
  ssh vps 'cd /opt/yapayzekalab && cp .env.example .env.production && chmod 600 .env.production'
  ```

  Then edit values on VPS only:

  ```text
  NODE_ENV=production
  PORT=4567
  DATABASE_URL=<production database url>
  JWT_SECRET=<32+ char secret>
  APP_BASE_URL=https://yapayzekalab.org
  FRONTEND_AUTH_RETURN=/
  CLOSEROUTER_API_KEY=<live key>
  ```

  Expected: `scripts/vps-deploy.sh` env checklist does not fail.

- [ ] **Step 2: Prepare smoke keys**

  Required values must be provided locally or on VPS:

  ```bash
  export SMOKE_API_KEY=<valid funded customer test key>
  export SMOKE_LOW_BALANCE_API_KEY=<valid low-balance customer test key>
  ```

  Expected: successful chat and `402` smoke can be verified without guessing.

### Phase 2D: Localhost Deploy Smoke Before DNS

**Files:**
- Update: `agent-team/WORKLOG.md`
- Update: `CLAUDE.md`

- [ ] **Step 1: Run deploy on VPS localhost**

  Run on VPS:

  ```bash
  cd /opt/yapayzekalab
  SMOKE_BASE_URL=http://127.0.0.1:4567 bash scripts/vps-deploy.sh
  ```

  Expected:
  - DB ping ok
  - `npm run lint` ok
  - `npm test` ok
  - `npm run build` ok
  - `npm run scan:public` ok
  - migration ok
  - service restart ok
  - localhost smoke ok

- [ ] **Step 2: Verify service status**

  Run on VPS:

  ```bash
  APP_DIR=/opt/yapayzekalab SERVICE=yapayzekalab bash scripts/vps-ops-status.sh
  ```

  Expected: service active, port `4567` listening, no fresh app crash.

### Phase 2E: DNS, HTTPS and Public Smoke

**Files:**
- Update: `agent-team/WORKLOG.md`
- Update: `CLAUDE.md`

- [ ] **Step 1: Change DNS**

  Change `yapayzekalab.org` A record from `77.92.151.228` to `91.228.227.88`.

  Verify:

  ```bash
  dig +short yapayzekalab.org
  ```

  Expected: `91.228.227.88`.

- [ ] **Step 2: Issue HTTPS certificate**

  Run on VPS:

  ```bash
  certbot --nginx -d yapayzekalab.org -d www.yapayzekalab.org
  ```

  Expected: certificate issued and Nginx reloads cleanly.

- [ ] **Step 3: Run public smoke**

  Run locally:

  ```bash
  SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps
  npm run preflight:live
  ```

  Expected:
  - `/health` 200 and `checks.db="ok"`
  - `/status` 200 and `modelCount=33`
  - `/api/models` 33
  - unauth chat `401`
  - unknown `/api/*` and `/v1/*` JSON `404`
  - funded smoke key successful chat
  - low balance smoke key `402`

- [ ] **Step 4: Rollback drill**

  Run on VPS:

  ```bash
  sudo -u yapayzekalab /opt/yapayzekalab/.deploy/rollback-last.sh
  ```

  Expected: rollback smoke passes. If rollback passes, redeploy latest release again before leaving production.

### Phase 3: Customer Activation Panel

**Files:**
- Modify: `src/App.tsx`
- Modify or create tests according to existing frontend test pattern if available.
- Update: `agent-team/WORKLOG.md`

- [ ] **Step 1: Promote temporary API tab flow to real dashboard routes**

  Routes to expose:

  ```text
  /login
  /register
  /dashboard
  /billing
  /docs
  /status
  ```

  Expected: customer can move from signup to key creation to first request without admin UI.

- [ ] **Step 2: Verify API key one-time reveal**

  Expected: full key appears only in create response/modal, later tables show prefix only.

- [ ] **Step 3: Browser smoke**

  Run local app and check:

  ```bash
  npm run build
  ```

  Then browser-check desktop and mobile:
  - homepage
  - dashboard
  - API key create/revoke
  - usage table
  - IBAN flow

### Phase 4: Billing, Ledger and Reconciliation Hardening

**Files:**
- Modify: `src/server/services/billing-service.ts`
- Modify: `src/server/services/reconciliation-service.ts`
- Add or modify focused tests under `src/server/**/*.test.ts`

- [ ] **Step 1: Add streaming billing outbox plan**

  Expected: missing final stream usage never creates negative balance; admin can reconcile stuck records.

- [ ] **Step 2: Expand idempotency tests**

  Required tests:
  - duplicate usage request id charges once
  - duplicate payment callback credits once
  - provider error writes usage record with zero charge
  - reconciliation reports drift

### Phase 5: Security and Abuse Controls

**Files:**
- Modify: rate limit service files under `src/server/services/`
- Modify: admin audit/export routes
- Add tests under `src/server/**/*.test.ts`

- [ ] **Step 1: Move rate limit from memory to persistent store**

  Expected: per-key limits survive process restart.

- [ ] **Step 2: Add account-level safety limits**

  Required controls:
  - daily TL limit per API key
  - max token per request
  - model allowlist
  - admin audit for limit changes

### Phase 6: Image and Video Live Usage Verification

**Files:**
- Modify: provider adapter tests and modality metering services.
- Update: `pricing/` evidence files.

- [ ] **Step 1: Test real image usage payload**

  Expected: raw payload, normalized usage, TL charge and remaining balance are recorded.

- [ ] **Step 2: Keep video beta-disabled until polling proves settlement**

  Expected: no public production-ready label for video until real task lifecycle passes.

### Phase 7: 9Router POC

**Files:**
- Create or modify provider adapter implementation.
- Add tests matching CloseRouter adapter tests.

- [ ] **Step 1: Add `NineRouterAdapter` behind feature flag**

  Expected: default remains CloseRouter.

- [ ] **Step 2: Run shadow comparison**

  Compare:
  - latency
  - error rate
  - usage payload quality
  - billing consistency

  Expected: no production traffic until auth, billing, ledger and smoke tests match CloseRouter direct path.

## Global Verification Gate

Before any phase is called complete:

```bash
git diff --check
npm run lint
npm test
npm run build
npm run scan:public
```

For live phases also run:

```bash
npm run preflight:live
SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps
```

## Immediate Next Step

Start with **Phase 2A**. The current VPS is CentOS Stream 8, while the existing setup script was originally written for Ubuntu-style `apt-get` and `sites-enabled`; deploying before that compatibility patch risks breaking or bypassing the real VPS layout.
