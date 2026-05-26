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
