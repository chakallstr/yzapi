# YapayZekaLab Full E2E Test Report

Date: 2026-05-28 15:12 TRT
Scope: local production E2E, live smoke/UAT, API negative/balance safety, build and leak checks.

## Agent Gate

- Agent 1 — QA/UAT: APPROVE local/live safe E2E evidence.
- Agent 2 — Backend/API/Billing: APPROVE negative auth, low-balance and catalog checks; funded success remains blocked without safe provider/test key.
- Agent 3 — Security/Visual: APPROVE scans and no visual/template change.
- Agent 4 — Integrity Guard: REJECT final launch until live deploy parity and funded billing are proven.

## Commands Run

- `npm test`
- `npm test -- src/payment-safety-contract.test.ts src/server/services/shopier-service.test.ts src/server/services/payment-pricing.test.ts src/server/routes/v1-catalog.test.ts src/server/services/model-catalog.test.ts src/claude-popusk-contract.test.ts`
- `npm test -- src/server/middleware/error-handler.test.ts`
- `npm run lint`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run db:up`
- `npm run db:migrate`
- `npm run db:seed`
- `SMOKE_BASE_URL=http://127.0.0.1:4567 SMOKE_EXPECTED_MODEL_COUNT=42 npm run smoke:vps`
- `QA_BASE_URL=http://127.0.0.1:4567 npm run qa:uat`
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`
- `APP_DIR=/opt/turkapiprojesi SERVICE=turkapiprojesi EXPECTED_MODELS=42 SMOKE_BASE_URL=https://yapayzekalab.org npm run preflight:live`

## Passed

- Local full tests: 31 files / 144 tests.
- Targeted payment/catalog/provider contract tests: 6 files / 37 tests.
- Typecheck/lint: PASS.
- Production build: PASS.
- Public bundle scan: 0 hits.
- Secret scan: 235 scanned / 0 hits.
- Local production smoke: PASS, 42 models, DB ok, authless gateway 401, JSON 404 checks.
- Local UAT smoke: PASS 10/10, `qa-artifacts/uat-smoke-2026-05-28T12-12-35-627Z/uat-smoke-report.md`.
- Live public smoke: PASS for health/status/models/authless gateway/JSON 404 checks.
- Live UAT smoke: PASS 10/10, `qa-artifacts/uat-smoke-2026-05-28T12-04-50-626Z/uat-smoke-report.md`.

## API Negative E2E

Local temporary API key rows were created and deleted during the test.

- No auth `/v1/chat/completions`: 401 JSON.
- Invalid key `/v1/chat/completions`: 401 JSON.
- Revoked key `/v1/chat/completions`: 401 JSON.
- Low-balance key `/v1/chat/completions`: 402 JSON.
- Unknown model with valid local key: 404 JSON.
- Malformed JSON body: initially 500, fixed to 400 JSON.
- No auth `/v1/messages`: 401 JSON.
- No auth `/v1/images/generations`: 401 JSON.

## Fixed During E2E

- `E2E-BUG-001`: malformed JSON parser errors returned 500.
- Fix: `src/server/middleware/error-handler.ts` maps Express JSON parser `entity.parse.failed` to 400 JSON without stack leakage.
- Test: `src/server/middleware/error-handler.test.ts`.

## Blockers

- Live deploy parity: live `/api/models` returns 33 models; local Claude Popusk catalog returns 42.
- Live preflight with `EXPECTED_MODELS=42` fails due live model mismatch.
- Live active service is `/opt/turkapiprojesi` / `turkapiprojesi.service`; generic preflight defaults still point to old `/opt/yapayzekalab` unless overridden.
- Funded successful gateway billing was not run because no safe `SMOKE_API_KEY` / provider test key is present in env.
- Low-balance live gateway test was skipped because `SMOKE_LOW_BALANCE_API_KEY` is absent.

## Final E2E Verdict

NOT READY — API/BILLING/BALANCE BLOCKERS

Reason: local E2E is now clean, but live has not received the 42-model Claude Popusk catalog and live funded billing headers/balance decrement/usage_records are still unproven.
