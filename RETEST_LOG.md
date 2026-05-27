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
