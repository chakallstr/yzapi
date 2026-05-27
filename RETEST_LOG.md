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
