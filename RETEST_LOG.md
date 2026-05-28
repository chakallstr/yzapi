# YapayZekaLab Repair Retest Log

## R-BUG-001 Targeted Retest

Bug ID: R-BUG-001
Fix decision ID: DEC-FIX-001
Retest decision ID: DEC-RETEST-001
Command or manual flow: `npm test -- src/server/routes/v1-catalog.test.ts`
Expected: Public catalog contract helpers return sanitized model list, count, and provider list.
Actual: PASS after route/auth integration test was added, 1 test file / 5 tests.
Passed/Failed: Passed
Evidence: Vitest output: `src/server/routes/v1-catalog.test.ts`, 5 passed.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: TARGETED_PASS

## R-BUG-001 Regression Retest

Bug ID: R-BUG-001
Fix decision ID: DEC-FIX-001 / DEC-FIX-001A
Retest decision ID: DEC-RETEST-002
Command or manual flow:
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
Expected:
- TypeScript passes.
- Existing route/admin/payment/auth tests remain green.
- Production build includes new route.
- Public bundle and source scans have zero secret hits.
Actual:
- `npm run lint`: PASS.
- `npm test`: PASS, 23 files / 99 tests.
- `npm run build`: PASS; existing chunk-size warning only.
- `npm run scan:public`: PASS, 3 scanned / 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 206 scanned / 0 hits.
Passed/Failed: Passed
Evidence: Command outputs in current repair session.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LOCAL_REGRESSION_PASS_LIVE_SMOKE_PENDING

## ADMIN-GOOGLE-001 Live Retest

Bug ID: ADMIN-GOOGLE-001
Fix decision ID: DEC-ADMIN-LIVE-STALE-001
Retest decision ID: DEC-RETEST-ADMIN-GOOGLE-001
Command or manual flow: Standard Chrome live flow: open `https://yapayzekalab.org`, verify Admin hidden while anonymous, click Google login, choose `cix.crazy666@gmail.com`, click Admin after `/dashboard`.
Expected: Admin is visible only after allowlisted Google login and opens the dashboard without a separate admin password form.
Actual: OAuth completed, Admin appeared, and clicking Admin opened `YZ Admin` / `Gösterge Paneli` directly. No admin password prompt appeared.
Passed/Failed: Passed
Evidence: Live deploy id `manual-20260526T233319Z-8a8f1bc`; `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` returned 10 pass / 0 fail; live bundle stale-string check found no `admin parola`, `Admin paneline gir`, `ADMİN GİRİŞİ`, or `adminToken`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LIVE_ADMIN_GOOGLE_PASS_FULL_RELEASE_BLOCKED_BY_BILLING_PAYMENT

## LIVE-BILLING-001 Live Billing / Provider Diagnostic Retest

Bug ID: R-BUG-006
Fix decision ID: DEC-LIVE-BILLING-TEST-001
Retest decision ID: DEC-RETEST-LIVE-BILLING-001
Command or manual flow: Live service environment with isolated `qa-live-billing-*` users/keys, tiny text calls only, raw keys kept out of reports/logs, test keys revoked after use. Direct CloseRouter `/credits`, `/models/count`, `/models?output_modalities=text`, model endpoint metadata, and chat/responses inference diagnostics.
Expected: Funded key should receive a successful text response with billing headers, balance decrement, transaction, and success `usage_records`; low-balance should return safe `402`; invalid/revoked keys should return `401`; direct provider should support at least one tiny text inference route.
Actual: Low-balance returned `402`, invalid key returned `401`, upstream failure usage records were zero-cost and funded balance did not decrement. Direct CloseRouter account/catalog/balance checks passed, but OpenAI/Anthropic/Deepseek/Google chat and OpenAI responses inference returned `502 upstream_connection_refused` or `502 upstream_connect_timeout`.
Passed/Failed: Partial. Security/failure-path billing passed; success billing failed due upstream inference.
Evidence: CloseRouter `/credits` 200 with approximately `$1.99998845`; `/models/count` 200 with `34`; text catalog 18 models; direct inference 502 across tested providers; follow-up read-only DB check found no remaining `qa-live-billing-*` test rows.
Agent 1 retest vote: REJECT_FULL_RELEASE
Agent 2 retest vote: REJECT_FULL_RELEASE
Agent 3 retest vote: REJECT_FULL_RELEASE
Approval count: 0/3
Final retest status: FAILURE_PATH_PASS_SUCCESS_BILLING_BLOCKED_BY_UPSTREAM_502

## LIVE-CLOSEROUTER-HEARTBEAT-001 Safe Provider Recheck

Bug ID: R-BUG-006
Fix decision ID: DEC-CMD-LIVE-CLOSEROUTER-HEARTBEAT-001
Retest decision ID: DEC-RETEST-LIVE-CLOSEROUTER-HEARTBEAT-001
Command or manual flow:
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
- Live VPS env read without printing secrets.
- Direct CloseRouter `/credits`, `/models/count`, `/models?output_modalities=text`.
- One direct tiny `/chat/completions` request with `max_tokens=4`.
Expected:
- Live public smoke stays PASS.
- CloseRouter account/catalog endpoints stay reachable.
- If direct tiny text inference succeeds, proceed to smallest funded gateway billing verification only if a safe test key exists.
Actual:
- Live smoke PASS for health/status/models/authless/JSON-404 checks; successful and low-balance gateway key checks skipped because safe key env was absent.
- `/credits` `200`, `/models/count` `200`, text catalog `200`.
- Direct tiny `deepseek/deepseek-v4-pro` chat inference returned `502 upstream_error`, request id `b00967ca-09ae-4ffa-8a64-7d78f14d9cb5`.
- Funded YapayZekaLab gateway billing verification was not run because the direct provider gate failed.
Passed/Failed: Failed for successful inference; passed for safe smoke/account/catalog checks.
Evidence: `API_TEST_REPORT.md` heartbeat section dated `2026-05-27 11:01 TRT`.
Agent 1 retest vote: REJECT
Agent 2 retest vote: REJECT
Agent 3 retest vote: REJECT
Approval count: 0/3
Final retest status: SUCCESS_BILLING_STILL_BLOCKED_BY_UPSTREAM_502

## LIVE-OMNIROUTE-001 Temporary Provider Check

Bug ID: R-BUG-006
Fix decision ID: DEC-CMD-LIVE-OMNIROUTE-CHECK-001
Retest decision ID: DEC-RETEST-LIVE-OMNIROUTE-001
Command or manual flow:
- Live YapayZekaLab smoke.
- Public and local OmniRoute no-auth checks.
- Live VPS env name scan without printing values.
- Existing CloseRouter key tested against OmniRoute `/v1/models` without printing the key.
- Read-only OmniRoute DB key lookup without printing the raw key.
- Authenticated direct OmniRoute `/v1/models`.
- One direct tiny OmniRoute `/v1/chat/completions` with `max_tokens=4`.
Expected:
- Determine whether OmniRoute can temporarily replace CloseRouter.
- Do not print secrets, do not use real payments, do not mutate customer data.
- Do not run funded gateway billing unless a safe test key is already present and direct provider gate passes.
Actual:
- Live YapayZekaLab smoke PASS.
- Public OmniRoute no-auth returned expected `401 AUTH_002`.
- No dedicated OmniRoute env exists in YapayZekaLab live env.
- Current CloseRouter key is not valid for OmniRoute (`401 AUTH_002`).
- Active OmniRoute DB key found but not printed.
- Authenticated direct OmniRoute `/v1/models` returned `200`, `70` models.
- Direct tiny OmniRoute chat returned `200`, request id `chatcmpl-1779896002128`, usage `total_tokens=6125`.
- Live YapayZekaLab env was not switched because no safe funded gateway key was present and the large OmniRoute prompt usage creates billing-risk.
Passed/Failed: Partial. OmniRoute direct provider is working; YapayZekaLab funded billing is still unverified.
Evidence: `API_TEST_REPORT.md` temporary OmniRoute section dated `2026-05-27 18:28 TRT`.
Agent 1 retest vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: Direct OmniRoute works, but end-user first API request through YapayZekaLab is not yet proven.
Agent 2 retest vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Provider usage is unusually high for a tiny prompt; billing impact must be verified before routing customers through it.
Agent 3 retest vote: NEEDS_MORE_EVIDENCE
Agent 3 reason: No secrets leaked and no customer data mutated, but live switch requires rollback and billing guard.
Approval count: 0/3
Final retest status: OMNIROUTE_DIRECT_PASS_GATEWAY_BILLING_BLOCKED

## DESIGN-REGRESSION-001 Template Removal Retest

Bug ID: DESIGN-REGRESSION-001
Fix decision ID: DEC-FIX-DESIGN-RESTORE-001
Retest decision ID: DEC-RETEST-DESIGN-RESTORE-001
Command or manual flow:
- `npm test -- src/rejected-template-guard.test.ts src/admin-single-owner-contract.test.ts src/api-docs-content.test.ts`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run qa:uat`
- Playwright browser smoke at `http://localhost:4567/`
Expected:
- Rejected template fingerprints do not exist in active source, HTML, or public bundle.
- Old approved YapayZekaLab hero/theme is active through `src/yapayzekalab/`.
- Admin single-owner and API docs contracts remain green.
- Build and smoke UAT pass.
Actual:
- `src/yapayzekalab/` is active as the restored old visual shell.
- Template guard/admin/docs tests PASS.
- Full Vitest PASS, 27 files / 113 tests.
- `npm run lint` PASS.
- `npm run build` PASS with existing chunk-size warning only.
- `npm run scan:public` PASS, 3 scanned / 0 hits.
- `node scripts/scan-secrets.mjs` PASS, 226 scanned / 0 hits.
- Local UAT smoke PASS, 10/10.
- Browser smoke: old hero present, rejected dashboard/template absent, anonymous Admin hidden.
Passed/Failed: Passed locally
Evidence:
- `qa-artifacts/uat-smoke-2026-05-27T06-27-08-404Z/uat-smoke-report.md`
- Browser screenshot: `yzapi-home-after-copy-fix.png`
- Public scan returned zero hits.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LOCAL_PASS_LIVE_DEPLOY_PENDING

## UX-FAKE-LIVE-001 Fake Live Claim Retest

Bug ID: UX-FAKE-LIVE-001
Fix decision ID: DEC-FIX-UX-FAKE-LIVE-001
Retest decision ID: DEC-RETEST-UX-FAKE-LIVE-001
Command or manual flow:
- `npm test -- src/api-docs-content.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run qa:uat`
- Playwright browser smoke.
Expected: Public source and rendered UI do not show random-looking fake `yzk_live_a8f3`, `Playground · canlı test`, or `sağlayıcı çağrılıyor`; examples remain clearly placeholder-based.
Actual: Targeted test PASS 5/5; full Vitest PASS 27 files / 113 tests; lint/build/scans/UAT PASS; browser text has `Playground · örnek akış`, `yzk_live_YOUR_KEY`, and no fake-live claim.
Passed/Failed: Passed locally
Evidence: `qa-artifacts/uat-smoke-2026-05-27T06-27-08-404Z/uat-smoke-report.md`; browser screenshot `yzapi-home-after-copy-fix.png`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LOCAL_PASS_LIVE_DEPLOY_PENDING

## DESIGN-CSS-001 Leftover Template CSS Retest

Bug ID: DESIGN-CSS-001
Fix decision ID: DEC-FIX-DESIGN-CSS-001
Retest decision ID: DEC-RETEST-DESIGN-CSS-001
Command or manual flow:
- `npm test -- src/rejected-template-guard.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run qa:uat`
- Playwright browser CSS smoke.
Expected: `src/main.tsx` does not import the leftover global `index.css`; no Tailwind/Inter/Space Grotesk/JetBrains Mono/skeleton template CSS remains in active source, dependency wiring, public bundle or rendered styles; old theme still renders.
Actual: Target guard PASS 7/7; lint PASS; full Vitest PASS 27 files / 114 tests; build PASS with existing chunk-size warning; public scan and secret scan PASS 0 hits; local UAT PASS 10/10. Browser smoke: old page renders, anonymous Admin hidden, rejected template absent, template CSS fingerprints absent.
Passed/Failed: Passed locally
Evidence: `qa-artifacts/uat-smoke-2026-05-27T06-29-41-955Z/uat-smoke-report.md`; browser screenshot `yzapi-home-final-local-template-clean.png`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LOCAL_PASS_LIVE_DEPLOY_PENDING

## SECURITY-DEPS-001 Dependency Security Retest

Bug ID: SECURITY-DEPS-001
Fix decision ID: DEC-FIX-SEC-DEPS-001
Retest decision ID: DEC-RETEST-SEC-DEPS-001
Command or manual flow:
- `npm audit --json`
- controlled dependency update, no `--force`
- `npm audit --omit=dev --json`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run scan:public`
- `node scripts/scan-secrets.mjs`
- `npm run qa:uat`
Expected: Production dependency audit has zero high/critical/moderate vulnerabilities; Drizzle/uuid upgrades do not break build, tests, scans, or UAT.
Actual: Initial audit had 1 high and 5 moderate. After updating `drizzle-orm`, `uuid`, `drizzle-kit` and removing `@types/uuid`, production audit returned 0 vulnerabilities. Full regression PASS 27 files / 114 tests; build/scans/UAT PASS. General audit still reports 4 moderate dev-only advisories under `drizzle-kit`/nested esbuild.
Passed/Failed: Passed for production runtime; dev-only moderate follow-up remains.
Evidence: `npm audit --omit=dev --json` metadata total 0; `qa-artifacts/uat-smoke-2026-05-27T06-34-09-399Z/uat-smoke-report.md`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE_WITH_DEV_FOLLOWUP
Approval count: 3/3
Final retest status: PRODUCTION_AUDIT_PASS_DEV_MODERATE_FOLLOWUP

## LIVE-DEPLOY-RESTORED-THEME-001 Live Deploy Retest

Bug ID: LIVE-DEPLOY-RESTORED-THEME-001, DESIGN-REGRESSION-001, DESIGN-CSS-001, UX-FAKE-LIVE-001, R-BUG-009
Fix decision ID: DEC-LIVE-DEPLOY-RESTORED-THEME-001
Retest decision ID: DEC-RETEST-LIVE-DEPLOY-RESTORED-THEME-001
Command or manual flow:
- Fresh local `npm run lint`
- Fresh local `npm test`
- Fresh local `npm run build`
- Fresh local `npm run scan:public`
- Fresh local `node scripts/scan-secrets.mjs`
- Fresh local `npm audit --omit=dev --json`
- Fresh local `npm run qa:uat`
- Corrected rollback deploy to `/opt/turkapiprojesi`, service `turkapiprojesi.service`
- Live `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`
- Live `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`
- Live `/v1/models`, `/v1/providers`, `/v1/models/count`, unknown `/v1/*`, authless `/v1/chat/completions`
- Live bundle forbidden-fingerprint scan
- Browser visual/admin anonymous smoke
Expected:
- Deploy uses the real active service, not inactive `/opt/yapayzekalab`.
- Rollback script restores from the timestamped backup directory, not `/dist`.
- Live site shows the restored approved theme.
- Rejected template, admin password UI, fake live claim, Tailwind/template CSS fingerprints are absent.
- Anonymous Admin remains hidden.
- Live smoke and UAT pass.
Actual:
- Deploy ID `manual-20260527T064341Z-6021b8e` completed; service returned `active`.
- Rollback file: `/opt/turkapiprojesi/.deploy/rollback-manual-20260527T064341Z-6021b8e.sh`.
- Local lint PASS; tests PASS 27/27 files and 114/114 tests; build PASS with existing chunk warning only; public scan hits `[]`; secret scan hits `[]`; production audit vulnerabilities total `0`; local UAT 10/10.
- Live smoke PASS for `/health`, `/status`, `/api/models`, authless `/v1/chat/completions` 401, unknown `/api/*` and `/v1/*` JSON 404. Successful funded/low-balance key smoke was skipped because no safe key env was present.
- Live UAT 10/10, report `qa-artifacts/uat-smoke-2026-05-27T06-44-24-709Z/uat-smoke-report.md`.
- Live public `/v1/models`, `/v1/providers`, `/v1/models/count` returned 200 JSON; unknown `/v1/__missing_template_check__` returned JSON 404.
- Live bundle forbidden-fingerprint scan found `[]`.
- Browser visual smoke: old YapayZekaLab hero visible, rejected dashboard/template absent, anonymous Admin hidden, fake-live claim absent.
Passed/Failed: Passed for live deploy/theme/API smoke; release still blocked for successful funded billing/payment E2E.
Evidence:
- Deploy ID `manual-20260527T064341Z-6021b8e`
- Live UAT report `qa-artifacts/uat-smoke-2026-05-27T06-44-24-709Z/uat-smoke-report.md`
- Live bundle asset scan returned `hits: []`
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE_WITH_BILLING_GAP
Agent 3 retest vote: APPROVE_WITH_RELEASE_BLOCKER
Approval count: 3/3
Final retest status: LIVE_DEPLOY_PASS_RELEASE_BLOCKED_BY_BILLING_PAYMENT_E2E

## PAYMENT-LIVE-001 Live Payment Schema / IBAN E2E Retest

Bug ID: PAYMENT-LIVE-001, R-BUG-007
Fix decision ID: DEC-FIX-LIVE-PAYMENT-MIGRATION-001
Retest decision ID: DEC-RETEST-PAYMENT-LIVE-001
Command or manual flow:
- Took live PostgreSQL 14 backup before schema change.
- Applied additive `ADD COLUMN IF NOT EXISTS` quote fields to `payments` and `pending_iban_payments`.
- Verified both live tables expose `amount_usd`, `payable_tl`, `credit_tl`, `kur_at_payment`, and `rounding_tl`.
- Created isolated temporary user/session; no real money; no real provider payment.
- Called `/api/payments/methods`, `/api/payments/shopier/init`, `/api/payments/crypto/init`, `/api/payments/iban/init`, admin pending list, approve, duplicate approve, second pending reject without reason, reject with reason, DB/audit reads, cleanup.
Expected:
- Missing columns no longer crash live payment init.
- IBAN init creates pending/payment records with rounded TL quote.
- Normal user cannot access admin payment queue.
- Admin approve credits exactly once and writes ledger/audit.
- Duplicate approve cannot double-credit.
- Reject requires reason and does not credit.
- Shopier/Cryptomus remain disabled with 503 when env credentials are absent.
Actual:
- Payment methods: `shopier.enabled=false`, `iban.enabled=true`, `cryptomus.enabled=false`.
- `shopier/init`: `503`; `crypto/init`: `503`.
- `iban/init` for `$10`: `200`, `kur=47.279606`, `payableTL=473`, `creditTL=472.7961`, `roundingTL=0.2039`.
- Normal user admin pending endpoint: `403`.
- Admin pending before approve: `200`, count `1`.
- Approve: `200`, `durum=onaylandi`, transaction id present.
- Duplicate approve: `409`.
- Reject without reason: `400`; reject with reason: `200`, `durum=reddedildi`.
- DB after approve: user balance `472.7961`, one `yukleme` transaction, one approved pending, one rejected pending, matching `payments`, audit actions `iban_approve` and `iban_reject`.
- Cleanup removed temporary users/payments/pending/transactions/audit rows.
Passed/Failed: Passed for IBAN/payment schema; provider E2E still blocked.
Evidence: Live backup `/opt/turkapiprojesi/.deploy/db-backups/payment-quote-cols-20260527T070013Z.dump`; command output retained in current repair session; raw tokens/API keys were not printed.
Agent 1 retest vote: APPROVE_WITH_PROVIDER_GAP
Agent 2 retest vote: APPROVE_WITH_PROVIDER_GAP
Agent 3 retest vote: APPROVE_WITH_PROVIDER_GAP
Approval count: 3/3
Final retest status: IBAN_LIVE_PASS_SHOPIER_CRYPTOMUS_PROVIDER_E2E_BLOCKED

## PAYMENT-UI-001 Payment UI Rounded Quote Retest

Bug ID: PAYMENT-UI-001, R-BUG-007
Fix decision ID: DEC-FIX-PAYMENT-UI-ROUNDING-001
Retest decision ID: DEC-RETEST-PAYMENT-UI-ROUNDING-001
Command or manual flow:
- Wrote RED source contract test for rounded TL payment display and unimplemented commission copy.
- Patched `src/yapayzekalab/tab-account.jsx` text/calculation only.
- Ran targeted and full local regression.
Expected:
- Account top-up UI mirrors backend: Shopier/IBAN collect `Math.ceil(amountUsd * tlRate)` TL, credit selected USD equivalent, show rounding difference.
- Cryptomus display uses USD/USDT invoice amount rounded upward to 2 decimals.
- Payment history shows method/status/USD credit/TL collection/rounding/date fields.
- No style/theme/template/class/layout changes.
Actual:
- RED test failed before fix, then `npm test -- src/api-docs-content.test.ts` passed 7/7.
- `npm run lint`: PASS.
- `npm test`: PASS, 27 files / 116 tests.
- `npm run build`: PASS, existing chunk-size warning only.
- `npm run scan:public`: PASS, hits `[]`.
- `node scripts/scan-secrets.mjs`: PASS, hits `[]`.
- `npm run qa:uat`: PASS, 10/10, report `qa-artifacts/uat-smoke-2026-05-27T07-10-10-016Z/uat-smoke-report.md`.
Passed/Failed: Passed locally
Evidence: Source contract tests and UAT screenshots under `qa-artifacts/uat-smoke-2026-05-27T07-10-10-016Z/`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Live deploy:
- Deploy ID: `manual-20260527T071659Z-ddee303`.
- Backup: `/opt/turkapiprojesi/.deploy/dist-backups/manual-20260527T071659Z-ddee303`.
- Rollback: `/opt/turkapiprojesi/.deploy/rollback-manual-20260527T071659Z-ddee303.sh`.
- Service: `turkapiprojesi.service` active.
- Live smoke: `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` PASS for health/status/models/authless/JSON-404 checks; funded/low-balance keys skipped.
- Live UAT: `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` PASS 10/10, report `qa-artifacts/uat-smoke-2026-05-27T07-17-37-093Z/uat-smoke-report.md`.
- Live bundle check: required payment labels present; old `%5 komisyon`/`Komisyon %`, rejected template, admin-password and fake-live fingerprints absent.
Final retest status: LIVE_PASS

## LIVE-BILLING-001 Direct CloseRouter Recheck

Bug ID: R-BUG-006, LIVE-BILLING-001
Fix decision ID: DEC-CMD-LIVE-BILLING-RECHECK-001
Retest decision ID: DEC-RETEST-LIVE-BILLING-RECHECK-001
Command or manual flow: Read provider key from live env without printing it; tiny direct CloseRouter `/chat/completions` attempts with `max_tokens <= 4`; no image/video/payment calls.
Expected: At least one cheap text model should return 200 with choices before attempting funded gateway billing.
Actual:
- `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- `/models/count`: `200`, `count=34`.
- `anthropic/claude-haiku-4.5`: timeout.
- `openai/gpt-5.4-mini`: timeout.
- `deepseek/deepseek-v4-pro`: timeout.
- `google/gemini-3.5-flash`: timeout.
- `moonshotai/kimi-k2.5`: timeout.
- `qwen/qwen3.6-plus`: timeout.
Passed/Failed: Failed for success inference readiness.
Evidence: Current repair session command output; no secrets printed.
Agent 1 retest vote: REJECT
Agent 2 retest vote: REJECT
Agent 3 retest vote: REJECT
Approval count: 0/3
Final retest status: SUCCESS_BILLING_STILL_BLOCKED_BY_UPSTREAM_TIMEOUT

## LIVE-BILLING-002 Current Catalog / Messages Diagnostic

Bug ID: R-BUG-006, LIVE-BILLING-002
Fix decision ID: DEC-CMD-LIVE-CLOSEROUTER-DIAGNOSTICS-002, DEC-CMD-LIVE-CLOSEROUTER-MESSAGES-001
Retest decision ID: DEC-RETEST-LIVE-BILLING-DIAGNOSTICS-002
Command or manual flow:
- Read live CloseRouter env from VPS without printing the key.
- Fetched `/credits` and `/models?output_modalities=text`.
- Tested current low-cost chat-capable catalog candidates with `max_tokens <= 4`.
- Tested one Anthropic-style `/messages` request with `max_tokens <= 4`.
Expected:
- If provider inference is healthy, at least one current catalog model should return `200`, allowing a funded YapayZekaLab gateway billing test.
Actual:
- `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- Catalog: `200`, 18 text models and 18 chat-capable candidates.
- `deepseek/deepseek-v4-pro`, `google/gemini-3.1-flash-lite-preview`, `mimo/mimo-v2-pro`, `minimax/minimax-m2.7`, `openai/gpt-5.4-mini`, and `qwen/qwen3.6-plus` all returned `502 upstream_error`.
- `deepseek/deepseek-v4-pro` detailed metadata: `provider_name=Deepseek`, `failure_reason=upstream_connection_refused`, request id `c2c53a5e-1cd3-474d-8136-17da70c0d922`.
- `/messages` `anthropic/claude-haiku-4.5`: `502`, `failure_reason=upstream_connect_timeout`, request id `98a159de-f6df-4a97-a7e6-78516f90bf65`.
Passed/Failed: Failed for success inference readiness.
Evidence: Current repair session command output; no provider key or Authorization value printed.
Agent 1 retest vote: REJECT
Agent 2 retest vote: REJECT
Agent 3 retest vote: REJECT
Approval count: 0/3
Final retest status: SUCCESS_BILLING_STILL_BLOCKED_BY_CLOSEROUTER_PROVIDER_502

## DEPLOY-TARGET-METADATA-001 Deploy Target and Live Metadata Retest

Bug ID: R-BUG-002, R-BUG-009, DEPLOY-TARGET-METADATA-001
Fix decision ID: DEC-FIX-DEPLOY-TARGET-METADATA-001, DEC-FIX-LIVE-LEGACY-ADMINPASSWORD-ENV-001
Retest decision ID: DEC-RETEST-DEPLOY-TARGET-METADATA-001
Command or manual flow:
- Added a deploy target contract test and verified it failed before the script/docs patch.
- Updated deploy script/docs to the real live target.
- Created the missing live release manifest for `manual-20260527T071659Z-ddee303`.
- Moved stale env backup artifact out of the regular deploy backup directory into root-only secure storage.
- Removed unused legacy `ADMIN_PASSWORD` line from live `.env.production` without printing env contents.
- Restarted `turkapiprojesi.service` and ran live smoke/status checks.
Expected:
- Deploy tooling defaults to `/opt/turkapiprojesi`, `turkapiprojesi`, and `127.0.0.1:4568`.
- `/status.deploy.id` shows the latest payment UI deploy.
- Legacy admin password config is absent and service remains healthy.
- Secret scan remains clean.
Actual:
- RED test initially failed 2/2 against old `/opt/yapayzekalab` defaults.
- After patch, targeted test passed 2/2.
- `bash -n scripts/vps-deploy.sh scripts/vps-live-preflight.sh scripts/vps-setup.sh`: PASS.
- `npm run lint`: PASS.
- `npm test`: PASS, 28 files / 118 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 227 scanned / 0 hits.
- Live smoke: PASS for health/status/models/authless/JSON-404 checks.
- `/status.deploy.id`: `manual-20260527T071659Z-ddee303`.
- Live legacy admin password line: absent.
- Stale env backup artifact: moved to secure `600 root:root` storage; none remains in regular `.deploy/backups`.
Passed/Failed: Passed for deploy target/metadata/security hygiene.
Evidence: Current repair session command output; no env contents or secret values are included in committed files.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: DEPLOY_TARGET_METADATA_FIXED_LIVE_RELEASE_STILL_BLOCKED_BY_PROVIDER_BILLING

## LIVE-OMNI-BILLING-001 Temporary OmniRoute GPT Gateway Billing Retest

Bug ID: R-BUG-006, LIVE-BILLING-OMNI-001
Fix decision ID: DEC-CMD-LIVE-OMNI-PAYMENT-E2E-001
Retest decision ID: DEC-RETEST-LIVE-OMNI-BILLING-001
Command or manual flow:
- Loaded live VPS env without printing secrets.
- Created isolated temporary live user and temporary funded `yzk_live_*` key.
- Sent one tiny `/v1/chat/completions` request with `model=openai/gpt-5.4-mini`, `max_tokens=4`.
- Queried live DB for user balance, spend, request count and latest `usage_records`.
- Cleaned temporary user/API key/usage/transaction/payment rows.
Expected:
- Gateway returns `200`.
- `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, and `X-YZ-Request-Id` are present.
- Balance decreases, `usage_records.status=success`, and no test rows remain.
Actual:
- HTTP `200`; response choices present.
- `X-YZ-Cost-TL=0.0329`, `X-YZ-Remaining-TL=49.97`, request id present.
- DB balance `49.9671`, total spend `0.0329`, total requests `1`.
- `usage_records`: model `openai/gpt-5.4-mini`, status `success`, input `2022`, output `66`, cost `0.0329`, remaining `49.9671`, error `null`.
- Cleanup leftovers `0`.
Passed/Failed: Passed
Evidence: Current repair session command output; raw API key and provider secrets were not printed.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE_WITH_MONITORING
Approval count: 3/3
Final retest status: LIVE_OMNI_GPT_BILLING_PASS_MONITOR_TOKEN_USAGE

## LIVE-PAYMENT-PROVIDER-ENV-001 Shopier/Cryptomus Live Method Gate Retest

Bug ID: R-BUG-007, PAYMENT-PROVIDER-E2E-001
Fix decision ID: DEC-CMD-LIVE-OMNI-PAYMENT-E2E-001
Retest decision ID: DEC-RETEST-LIVE-PAYMENT-PROVIDER-ENV-001
Command or manual flow:
- Checked live `.env.production` provider variable presence as SET/UNSET only.
- Created temporary user/JWT and called `/api/payments/methods`.
- Called disabled `/api/payments/shopier/init` and `/api/payments/crypto/init`.
- Called `/api/payments/iban/init` to verify the working fallback payment method.
- Ran local provider contract tests and secret scan.
Expected:
- If provider credentials are absent, Shopier/Cryptomus must be disabled, init must return 503, and no payment rows should be created.
- IBAN must still work.
- Secret scan must remain clean.
Actual:
- `SHOPIER_API_KEY=UNSET`, `SHOPIER_API_SECRET=UNSET`, `CRYPTOMUS_API_KEY=UNSET`, `CRYPTOMUS_MERCHANT_ID=UNSET`.
- `/api/payments/methods`: 200; Shopier disabled, Cryptomus disabled, IBAN enabled.
- `/api/payments/shopier/init`: 503, no Shopier payment row.
- `/api/payments/crypto/init`: 503, no Cryptomus payment row.
- `/api/payments/iban/init`: 200; reference present, `payableTL=473`, `creditTL=472.7961`, `roundingTL=0.2039`.
- `npm test -- src/server/services/shopier-service.test.ts src/server/services/cryptomus-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-common.test.ts src/server/services/payment-guards.test.ts src/server/services/payment-pricing.test.ts`: 6 files / 32 tests passed.
- `node scripts/scan-secrets.mjs`: 227 scanned / 0 hits.
Passed/Failed: Safe-disabled behavior passed; provider E2E remains blocked.
Evidence: Current repair session command output; no secrets printed.
Agent 1 retest vote: NEEDS_MORE_EVIDENCE
Agent 2 retest vote: NEEDS_MORE_EVIDENCE
Agent 3 retest vote: REJECT_FOR_PROVIDER_LAUNCH
Approval count: 0/3
Final retest status: SHOPIER_CRYPTOMUS_PROVIDER_E2E_BLOCKED_BY_MISSING_ROTATED_ENV

## LOCAL-PAYMENT-AMOUNT-CURRENCY-GUARDS-001 Provider Amount/Currency Guard Retest

Bug ID: R-BUG-007, PAYMENT-PROVIDER-E2E-001
Fix decision ID: DEC-FIX-PAYMENT-PROVIDER-AMOUNT-001
Retest decision ID: DEC-RETEST-PAYMENT-PROVIDER-AMOUNT-001
Command or manual flow:
- Added local source/service coverage for Shopier signed callback amount and currency fields.
- Added local route-level guards so Shopier callbacks cannot credit if signed paid TL or currency does not match the stored payment quote.
- Added local route-level guards so Cryptomus webhooks cannot credit if signed amount/currency/to_currency does not match the stored USD/USDT invoice expectation.
- Ran targeted and full non-provider tests without real payment calls.
Expected:
- Signed provider callbacks/webhooks must match amount and currency before crediting.
- Invalid amount/currency must be treated as non-crediting suspicious/failure state.
- No secrets are logged or committed.
Actual:
- `npm test -- src/admin-single-owner-contract.test.ts`: PASS, 3/3.
- `npm run lint`: PASS.
- `npm test`: PASS, 28 files / 126 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 227 scanned / 0 hits.
Passed/Failed: Passed locally for static/service/route guard coverage; live provider E2E still blocked by missing rotated Shopier/Cryptomus env.
Evidence: Current repair session command output; no provider token, Authorization header, callback secret, or raw webhook payload printed.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: LOCAL_PAYMENT_AMOUNT_CURRENCY_GUARDS_ACCEPTED_PROVIDER_E2E_STILL_BLOCKED

## LOCAL-OAUTH-RETURN-001 Google OAuth Return Token Handling Retest

Bug ID: R-BUG-003, AUTH-OAUTH-RETURN-001
Fix decision ID: DEC-FIX-OAUTH-RETURN-001
Retest decision ID: DEC-RETEST-OAUTH-RETURN-001
Command or manual flow:
- Standard Chrome live UAT proved Google returned to `/dashboard?at=...&rt=...` but the live frontend stayed anonymous.
- Added a non-visual frontend effect that stores returned `at/rt` tokens using existing token aliases and removes them from the address bar with `history.replaceState`.
- Mapped `/dashboard` to the existing account/API area.
- Ran targeted and full local verification.
Expected:
- After Google OAuth callback returns tokens, the frontend becomes authenticated without exposing tokens in the URL.
- `/dashboard` opens the existing account/API area.
- The visual shell, CSS, classes, colors, layout and template remain unchanged.
Actual:
- `npm test -- src/admin-single-owner-contract.test.ts`: PASS, 3/3.
- `npm run lint`: PASS.
- `npm test`: PASS, 28 files / 126 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 227 scanned / 0 hits.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: PASS 10/10, report `qa-artifacts/uat-smoke-2026-05-27T17-51-32-980Z/uat-smoke-report.md`.
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`: PASS for health/status/models/authless/JSON-404 checks; funded/low-balance keys skipped because safe env keys were absent.
Passed/Failed: Passed locally. Live Google OAuth/admin owner UAT still requires deployment of this frontend fix and a post-deploy Chrome retest.
Evidence: Current repair session command output and previous standard Chrome live OAuth reproduction; token values were not recorded.
Agent 1 retest vote: APPROVE_FOR_LOCAL_FIX
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE_WITH_DEPLOY_RETEST_REQUIRED
Approval count: 3/3
Final retest status: LOCAL_OAUTH_RETURN_FIX_ACCEPTED_PENDING_LIVE_DEPLOY_RETEST

## LOCAL-OAUTH-STATE-RESTART-001 Restart-Safe Google OAuth State Retest

Bug ID: R-BUG-003, AUTH-OAUTH-STATE-001
Fix decision ID: DEC-FIX-OAUTH-STATE-001
Retest decision ID: DEC-RETEST-OAUTH-STATE-001
Command or manual flow:
- Reproduced the likely restart/deploy failure mode in code: Google OAuth state was kept only in a process-local `Map`.
- Added TDD coverage requiring signed OAuth state to verify without in-memory process state, and to reject tampered/expired values.
- Replaced in-memory OAuth state storage with an HMAC-signed, 5-minute TTL state token.
Expected:
- A user who starts Google login before a server restart can still return with a valid signed state inside TTL.
- Tampered and expired state values are rejected.
- No visual design changes and no secret logging.
Actual:
- RED: `npm test -- src/server/services/google-oauth-service.test.ts` initially failed because `createOAuthState` did not exist.
- GREEN: targeted OAuth state test PASS 2/2.
- `npm test -- src/admin-single-owner-contract.test.ts src/server/services/google-oauth-service.test.ts`: PASS 5/5.
- `npm run lint`: PASS.
- `npm test`: PASS 29 files / 128 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 229 scanned / 0 hits.
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`: PASS for live safe public/backend checks.
Passed/Failed: Passed locally. Live deploy is blocked by the four-agent capacity gate until real agent votes are available.
Evidence: Current repair session command output; no OAuth token, state value, provider key, or secret printed.
Agent 1 retest vote: BLOCKED_BY_AGENT_CAPACITY
Agent 2 retest vote: BLOCKED_BY_AGENT_CAPACITY
Agent 3 retest vote: BLOCKED_BY_AGENT_CAPACITY
Approval count: 0/3
Final retest status: LOCAL_OAUTH_STATE_FIX_VERIFIED_DEPLOY_BLOCKED_BY_AGENT_CAPACITY

## LOCAL-PAYMENT-INSTRUCTIONS-001 Manual Payment Instruction Retest

Bug ID: PAYMENT-INSTRUCTIONS-001, PAYMENT-UX-001
Fix decision ID: DEC-FIX-PAYMENT-INSTRUCTIONS-001
Retest decision ID: DEC-RETEST-PAYMENT-INSTRUCTIONS-001
Command or manual flow:
- Added RED source-contract coverage requiring inline `paymentInstruction`, WhatsApp notification link, backend notification payload, and admin manual crypto wallet settings.
- Replaced IBAN reference-only alert with inline payment instructions.
- Added admin-configurable non-secret WhatsApp/crypto wallet fields.
- Added manual crypto fallback that creates a pending payment record but does not credit balance.
Expected:
- IBAN top-up returns and displays bank name, IBAN, owner, payable amount, balance amount, reference code, and WhatsApp notification path.
- Crypto manual mode displays asset, network, wallet address, optional memo, reference code, and WhatsApp notification path.
- Admin can configure WhatsApp and manual crypto wallet fields without seeing or editing provider API secrets.
- Manual IBAN/crypto instructions do not auto-credit balance.
- Existing theme, colors, layout, buttons, cards and modal visual style remain unchanged.
Actual:
- RED: `npm test -- src/payment-safety-contract.test.ts` failed 2/8 before implementation.
- GREEN: `npm test -- src/payment-safety-contract.test.ts` passed 8/8 after implementation.
- `npm test -- src/server/services/google-oauth-service.test.ts src/payment-safety-contract.test.ts`: PASS 10/10.
- `npm run lint`: PASS.
- `npm test`: PASS 29 files / 130 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 230 scanned / 0 hits.
- `npm run qa:uat`: PASS 10/10, report `qa-artifacts/uat-smoke-2026-05-27T19-24-23-128Z/uat-smoke-report.md`.
Passed/Failed: Passed locally for source/build/UAT route smoke. DB-backed local browser payment E2E was blocked because Docker/Postgres was not running.
Evidence: Current session command output; no real payment provider, no real money, no provider secret used.
Agent 1 retest vote: APPROVE_FOR_LOCAL_FIX
Agent 2 retest vote: APPROVE_WITH_MIGRATION_REQUIRED_BEFORE_DEPLOY
Agent 3 retest vote: APPROVE_WITH_LIVE_VISUAL_AND_PAYMENT_UAT_REQUIRED
Approval count: 3/3
Final retest status: LOCAL_PAYMENT_INSTRUCTIONS_ACCEPTED_DEPLOY_BLOCKED_BY_4_AGENT_GATE

## LOCAL-OAUTH-STATE-TEST-FLAKE-001 OAuth Test Determinism Retest

Bug ID: OAUTH-STATE-RESTART-001
Fix decision ID: DEC-FIX-OAUTH-STATE-TEST-FLAKE-001
Retest decision ID: DEC-RETEST-OAUTH-STATE-TEST-FLAKE-001
Command or manual flow:
- Investigated full test failure in `google-oauth-service.test.ts`.
- Changed only the test tamper method to alter the signed payload instead of relying on last signature character replacement.
Expected:
- Tampered state must always differ from the valid state and fail verification.
- Production OAuth state implementation remains unchanged.
Actual:
- Targeted OAuth/payment tests PASS 10/10.
- Full `npm test` PASS 29 files / 130 tests.
Passed/Failed: Passed.
Evidence: Current session command output.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED

## LOCAL-SHOPIER-TL-COLLECTION-001 Shopier TRY Collection Retest

Bug ID: PAYMENT-SHOPIER-TL-COLLECTION-001
Fix decision ID: DEC-FIX-SHOPIER-TL-COLLECTION-001
Retest decision ID: DEC-RETEST-SHOPIER-TL-COLLECTION-001
Command or manual flow:
- Added regression coverage for Shopier checkout form fields and payment route source contract.
- Ran `npm test -- src/server/services/shopier-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-pricing.test.ts`.
Expected:
- User can select USD top-up amount.
- Backend preserves `amountUsd` metadata for user-facing USD balance.
- Shopier receives TRY collection payload with `currency=0` and rounded whole-TL `total_order_value`.
- TL rounding delta is not credited as extra USD balance.
- No frontend visual/theme/layout change.
Actual:
- Test output: 3 files passed, 21 tests passed.
- `shopier-service.test.ts` verifies `currency=0`, `total_order_value=1182`, and `product_name="Bakiye Yukleme — 1182 TL"`.
- `payment-safety-contract.test.ts` verifies `/shopier/init` stores `amountUsd`, `payableTL`, `creditTL`, and sends `quote.payableTL` into `buildCheckoutForm`.
Passed/Failed: Passed locally.
Evidence: Current session command output; no real provider key, no real payment, no secret printed.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LOCALLY_PROVIDER_E2E_STILL_BLOCKED

## LOCAL-AUTH-SESSION-REFRESH-001 Protected Request Refresh Retest

Bug ID: AUTH-SESSION-REFRESH-001, PAYMENT-INSTRUCTIONS-001
Fix decision ID: DEC-FIX-AUTH-REFRESH-PROTECTED-POST-001
Retest decision ID: DEC-RETEST-AUTH-REFRESH-PROTECTED-POST-001
Command or manual flow:
- Reproduced source-level root cause from live Chrome symptom: dashboard can have stale auth state while protected payment POST returns `Invalid or expired token`.
- Added RED test for one-time refresh + retry and stale token cleanup.
- Added shared auth client helper and wired account/payment/profile requests to it.
Expected:
- A protected JSON request returning 401 refreshes with existing refresh token and retries once with the new access token.
- Refresh failure clears both current and legacy token aliases.
- IBAN/Crypto payment instruction flow can proceed after access token refresh instead of showing stale-token error.
- No visual/template/layout/style change.
Actual:
- RED: `npm test -- src/auth-client-refresh.test.ts` failed 2/2 because `src/yapayzekalab/auth-client.js` did not exist.
- GREEN: `npm test -- src/auth-client-refresh.test.ts` passed 2/2.
- Targeted: `npm test -- src/auth-client-refresh.test.ts src/payment-safety-contract.test.ts src/admin-single-owner-contract.test.ts src/admin-fetch-guard.test.ts` passed 4 files / 15 tests.
- Full: `npm run lint` PASS; `npm test` PASS 30 files / 134 tests; `npm run build` PASS; `npm run scan:public` PASS 0 hits; `node scripts/scan-secrets.mjs` PASS 232 scanned / 0 hits.
- UAT: default local smoke failed because `127.0.0.1:4567` was not listening; live smoke `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` passed 10/10.
Passed/Failed: Passed locally for source/build/regression. Live functional payment-button retest is blocked until this patch is deployed.
Evidence: Current session command output; no real payment, no provider secret, no API credit spend.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LOCALLY_DEPLOY_AND_LIVE_PAYMENT_RETEST_REQUIRED

## LIVE-PAYMENT-CONFIG-001 Live Manual Payment Instruction Retest

Bug ID: PAYMENT-INSTRUCTIONS-001
Fix decision ID: DEC-LIVE-PAYMENT-CONFIG-001
Retest decision ID: DEC-RETEST-LIVE-PAYMENT-CONFIG-001
Command or manual flow:
- Backed up live payment config, updated only live IBAN display env and non-secret manual payment DB config, then restarted `turkapiprojesi.service`.
- Ran live smoke and live UAT against `https://yapayzekalab.org`.
- Ran safe live backend E2E using a temporary short-lived user token: `POST /api/payments/iban/init` and `POST /api/payments/crypto/init` with `$2`, asserted current method/reference/WhatsApp mapping, then deleted the temporary payment rows.
- Used the existing standard Chrome YapayZekaLab tab to verify manual USDT TRC20 wallet instructions and WhatsApp button are visible. No new Chrome tab was created for this check.
Expected:
- IBAN instruction response contains the configured bank, recipient, IBAN, matching reference and WhatsApp notification message.
- Manual crypto response is enabled as USDT TRC20, contains the configured wallet, matching reference and WhatsApp notification message.
- BEP20 is not advertised as enabled without a separate BEP20 address.
- No balance is credited automatically; manual records remain pending/admin-reviewed unless explicitly approved.
- No visual/template/layout/style change.
Actual:
- Live smoke PASS: `/health`, `/status`, `/api/models`, authless `/v1/chat/completions=401`, unknown `/api/*` and `/v1/*` JSON 404.
- Live UAT PASS 10/10: `qa-artifacts/uat-smoke-2026-05-27T20-24-23-736Z/uat-smoke-report.md`.
- Safe backend E2E PASS: IBAN and crypto assertions passed and cleanup passed.
- Chrome visual UAT PASS for manual USDT TRC20 instruction visibility and WhatsApp payment notification button. IBAN placeholder issue is fixed at backend/config level; further Chrome clicking was stopped because user focus moved to another tab.
Passed/Failed: Passed for live manual payment config.
Evidence: Current session command output and standard Chrome screenshot/state. No real money, no provider payment, no customer balance mutation.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LIVE_MANUAL_PAYMENT_CONFIG

Agent 4 integrity guard: APPROVE

## SHOPIER-OSB-RELAY-002 Non-success unknown callback fallback regression

Bug ID: SHOPIER-OSB-RELAY-002
Fix decision ID: DEC-FIX-SHOPIER-OSB-NON-SUCCESS-001
Retest decision ID: DEC-RETEST-SHOPIER-OSB-NON-SUCCESS-001
Command or manual flow:
- RED: `npm test -- src/payment-safety-contract.test.ts` before production change.
- GREEN: `npm test -- src/payment-safety-contract.test.ts` after backend-only fix.
- Targeted: `npm test -- src/payment-safety-contract.test.ts src/server/services/shopier-service.test.ts src/server/services/payment-pricing.test.ts`.
- Regression: `npm run lint`, full `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, live smoke and live UAT.
Expected:
- Contract test fails before the fix because non-success callbacks do not prove fallback routing.
- After the fix, unknown non-success `/shopier/osb` callbacks can forward to `SHOPIER_OSB_FALLBACK_URL`.
- Known YapayZekaLab non-success callbacks still mark only the local payment failed.
- No frontend/theme files change and no secrets are introduced.
Actual:
- RED test failed as expected: 1 failed / 9 passed.
- GREEN contract passed: 10/10.
- Targeted payment tests passed: 3 files / 22 tests.
- Full tests passed: 30 files / 135 tests.
- Lint/typecheck passed.
- Build passed.
- Public scan passed: 3 scanned / 0 hits.
- Secret scan passed: 233 scanned / 0 hits.
- Live smoke passed for health/status/models/authless gateway/JSON 404; funded/low-balance env keys absent for smoke.
- Live UAT passed: 10/10, report `qa-artifacts/uat-smoke-2026-05-28T05-28-20-934Z/uat-smoke-report.md`.
Passed/Failed: Passed locally; not deployed because fourth integrity guard agent could not be spawned and provider E2E remains incomplete.
Evidence: Current session command output; changed files are `src/server/routes/payments.ts` and `src/payment-safety-contract.test.ts`.
Agent 1 retest vote: APPROVE_FOR_LOCAL_FIX
Agent 2 retest vote: CONDITIONAL_APPROVE
Agent 3 retest vote: APPROVE_FOR_LOCAL_FIX_REJECT_FOR_LAUNCH
Approval count: 3/3 for local fix, 0/3 for launch
Final retest status: ACCEPTED_LOCALLY_DEPLOY_BLOCKED

Residual policy note:
- Backend/Billing flagged that if fallback returns non-OK or is missing, the current non-success JSON-mode branch may still acknowledge a non-success callback after admin logging. Before final Shopier launch, decide whether fallback failure should force a non-2xx response so Shopier retries, or whether admin alert plus acknowledgement is intentional.

## SHOPIER-OSB-LIVE-DEPLOY-001 Live Relay Deploy Retest

Bug ID: R-BUG-007
Fix decision ID: DEC-FIX-SHOPIER-OSB-RELAY-001
Retest decision ID: DEC-RETEST-SHOPIER-OSB-LIVE-DEPLOY-001
Command or manual flow:
- Ran local secret scan and targeted Shopier/payment tests before live mutation.
- Created rollback backup on the VPS and deployed local `dist/` from commit `62a1fe4`.
- Added only the non-secret `SHOPIER_OSB_FALLBACK_URL` env key to the live server env.
- Restarted `turkapiprojesi.service`.
- Ran live smoke and live UAT against `https://yapayzekalab.org`.
- Opened the existing standard Chrome Shopier tab and prepared the OSB URL field for YapayZekaLab.
Expected:
- Live service remains active.
- Live code contains `/api/payments/shopier/osb`.
- Existing service fallback key exists server-side before any Shopier panel OSB URL change.
- Live smoke and UAT still pass.
- No secrets are printed or committed.
Actual:
- Pre-deploy secret scan PASS: 233 scanned / 0 hits.
- Targeted tests PASS: `npm test -- src/server/services/shopier-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-pricing.test.ts`, 3 files / 22 tests.
- Deploy ID `manual-20260527T205709Z-62a1fe4` completed; service active.
- VPS verification: `osb_code=present`, `fallback_env=present`.
- Live smoke PASS.
- Live UAT PASS 10/10, report `qa-artifacts/uat-smoke-2026-05-27T20-57-26-842Z/uat-smoke-report.md`.
- Shopier panel field is prepared but not saved; final save remains a provider-side global setting change.
Passed/Failed: Passed for live relay deployment. Provider-side Shopier OSB save and live callback E2E remain pending.
Evidence: Current session command output and standard Chrome state. Raw Shopier credentials were not copied into files or reports.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LIVE_RELAY_DEPLOY_PROVIDER_SAVE_PENDING

Agent 4 integrity guard: APPROVE_WITH_PROVIDER_SAVE_PENDING

## FULL-LIVE-REGRESSION-20260528-001 Shopier Save And Launch Gate Retest

Bug ID: R-BUG-006, R-BUG-007, PAYMENT-INSTRUCTIONS-001
Fix decision ID: DEC-PROVIDER-SHOPIER-OSB-SAVE-001
Retest decision ID: DEC-RETEST-FULL-LIVE-REGRESSION-20260528-001
Command or manual flow:
- Saved the Shopier OSB URL in the existing standard Chrome Shopier tab.
- Read the Shopier OSB test tab; it requires an existing Shopier order number.
- Ran safe incomplete Shopier callback test against the live YapayZekaLab OSB endpoint.
- Checked DB side effects for recent Shopier payments and payment transactions.
- Ran local lint/typecheck, full tests, build, public bundle scan and secret scan.
- Ran live smoke and live UAT.
- Ran live funded and low-balance API gateway billing with temporary users/keys and cleanup.
- Ran live authenticated payment-method, IBAN init, manual crypto init and Shopier disabled-state checks with temporary user/session and cleanup.
- Checked Google OAuth start redirect and unauthenticated admin/API guards.
Expected:
- Shopier panel saves the YapayZekaLab OSB URL.
- Incomplete callback returns JSON error and does not credit or create payment rows.
- Funded text API call returns 200, billing headers, usage record and balance decrement.
- Low-balance key returns 402 with no spend/usage.
- IBAN and manual crypto instructions return references and WhatsApp notification path.
- Shopier remains disabled until true checkout credentials are installed.
- No secrets are committed or leaked by scans.
Actual:
- Shopier panel save PASS; URL persisted as YapayZekaLab OSB endpoint.
- Safe negative callback PASS: `400 application/json`, `{"ok":false}`.
- DB side effects PASS: recent Shopier payments `0`, recent payment transactions `0`.
- Local regression PASS: `npm run lint`; `npm test` 30 files / 135 tests; `npm run build`; `npm run scan:public`; `node scripts/scan-secrets.mjs`.
- Live smoke PASS.
- Live UAT PASS 10/10: `qa-artifacts/uat-smoke-2026-05-27T21-12-22-270Z/uat-smoke-report.md`.
- Funded gateway billing PASS: status `200`, all three billing headers present, balance `50 -> 49.9679`, spend `0.0321`, requests `1`, `usage_records.status=success`, cleanup leftovers `0`.
- Low-balance PASS: status `402`, balance/spend/requests unchanged, usage rows `0`.
- Payment methods PASS under temp JWT: IBAN enabled, Shopier disabled; IBAN init and manual crypto init returned reference/instructions/WhatsApp; Shopier init `503` and created `0` rows; cleanup leftovers `0`.
- Google OAuth start PASS: `/api/auth/google` returned `302` to Google with callback domain `https://yapayzekalab.org/api/auth/google/callback`.
- Admin anonymous guard PASS: `/api/admin/me`, `/api/admin/config`, `/api/admin/users`, `/api/admin/api-keys`, `/api/payments/admin/all`, `/api/payments/admin/pending-iban` all returned `401 JSON`.
Passed/Failed: Passed for verified surfaces. Launch still blocked for automatic Shopier card payment and Cryptomus provider E2E because live provider credentials are unset.
Evidence: Current session command output and Chrome state. No real money, no image/video generation, no persistent test data.
Agent 1 retest vote: APPROVE_FOR_VERIFIED_SURFACES / REJECT_FULL_SALES_READY
Agent 2 retest vote: APPROVE_FOR_API_BILLING_AND_MANUAL_PAYMENTS / REJECT_PROVIDER_PAYMENT_READY
Agent 3 retest vote: APPROVE_SECURITY_GUARDS / REJECT_FULL_RELEASE
Approval count: 0/3 for full sales readiness
Final retest status: VERIFIED_PARTIAL_NOT_FULL_LAUNCH_READY

Agent 4 integrity guard: REJECT_FULL_RELEASE_UNTIL_PROVIDER_E2E

## SHOPIER-OSB-RELAY-001 Local Backend Relay Retest

Bug ID: R-BUG-007
Fix decision ID: DEC-FIX-SHOPIER-OSB-RELAY-001
Retest decision ID: DEC-RETEST-SHOPIER-OSB-RELAY-001
Command or manual flow:
- Added RED source contract for `SHOPIER_OSB_FALLBACK_URL` and `/api/payments/shopier/osb`.
- Implemented backend-only OSB relay/fallback; no frontend/template/style change.
- Ran targeted Shopier/payment tests, lint, full tests, build, public scan and secret scan.
Expected:
- YapayZekaLab Shopier callbacks still require signature, TRY currency and exact amount match before crediting.
- Unknown/non-YapayZekaLab callbacks can be forwarded to a fixed fallback URL so an existing service is not broken by a global OSB URL change.
- No secrets are committed.
Actual:
- RED failed before the relay existed.
- GREEN source contract passed 10/10.
- Targeted Shopier/payment tests passed 3 files / 22 tests.
- Full regression passed: `npm run lint`, `npm test` 30 files / 135 tests, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`.
Passed/Failed: Passed locally. Live Shopier E2E still pending provider credentials and panel configuration.
Evidence: Current session command output; raw Shopier credentials were not printed or committed.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LOCAL_RELAY_LIVE_E2E_PENDING

Agent 4 integrity guard: APPROVE

## SHOPIER-SETUP-001 Provider Setup Guard Retest

Bug ID: R-BUG-007
Fix decision ID: DEC-SHOPIER-SETUP-001
Retest decision ID: DEC-RETEST-SHOPIER-SETUP-001
Command or manual flow:
- Read-only Shopier panel inspection for developer app/OSB status.
- Official Shopier help/docs review for API, PAT and OSB/webhook distinction.
- Added `SHOPIER_INTEGRATION_STATUS.md` and clarified `.env.example`.
- Ran `npm test -- src/server/services/shopier-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-pricing.test.ts`.
- Ran `node scripts/scan-secrets.mjs`.
Expected:
- Dynamic amount support remains covered by tests.
- PAT/JWT is not documented as legacy checkout `SHOPIER_API_KEY`.
- Existing OSB-dependent service is not overwritten.
- No real payment/provider mutation occurs.
Actual:
- Targeted tests PASS: 3 files / 21 tests.
- Secret scan PASS: 233 scanned / 0 hits.
- Shopier remains disabled until safe legacy credentials plus callback or modern webhook support are verified.
Passed/Failed: Passed for provider setup guard; provider E2E still blocked.
Evidence: Current session command output and `SHOPIER_INTEGRATION_STATUS.md`.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_GUARD_PROVIDER_E2E_BLOCKED

Agent 4 integrity guard: APPROVE

## LIVE-PAYMENT-PHONE-002 Live WhatsApp Payment Number Recheck

Bug ID: PAYMENT-INSTRUCTIONS-001
Fix decision ID: DEC-LIVE-PAYMENT-CONFIG-001
Retest decision ID: DEC-RETEST-LIVE-PAYMENT-PHONE-002
Command or manual flow:
- Ran live smoke against `https://yapayzekalab.org`.
- Ran secret scan locally.
- Ran safe live backend E2E with a temporary short-lived user token: verified the configured WhatsApp number matches the supplied payment notification phone, called `POST /api/payments/iban/init` and `POST /api/payments/crypto/init` with `$2`, checked that both responses include `wa.me` notification links with matching references, then deleted the temporary user/payment rows.
Expected:
- Live public/backend smoke remains healthy.
- Payment notification phone is configured server-side and not committed to the repo.
- IBAN and manual crypto init responses include WhatsApp notification links tied to the generated payment reference.
- Temporary test data is cleaned up; no real payment or provider call occurs.
Actual:
- Live smoke PASS for `/health`, `/status`, `/api/models`, authless gateway `401`, and JSON 404 checks.
- Secret scan PASS: 232 scanned / 0 hits.
- Safe live backend E2E PASS: `livePaymentPhone=pass`, `ibanInstruction=pass`, `cryptoInstruction=pass`, `cleanup=pass`.
Passed/Failed: Passed.
Evidence: Current session command output; exact phone, IBAN and wallet values were not written to repo reports.
Agent 1 retest vote: APPROVE
Agent 2 retest vote: APPROVE
Agent 3 retest vote: APPROVE
Approval count: 3/3
Final retest status: ACCEPTED_LIVE_PAYMENT_PHONE_RECHECK

Agent 4 integrity guard: APPROVE
