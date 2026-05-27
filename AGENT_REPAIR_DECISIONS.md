# YapayZekaLab Agent Repair Decisions

Exactly 3 voting agents are used:

- Agent 1: QA / UAT / Regression Agent
- Agent 2: Backend / API / Billing Agent
- Agent 3: Visual Integrity / Security / Release Guard Agent

No decision is valid unless at least 2 of 3 agents approve.

---

Decision ID: DEC-PHASE0-001
Decision title: Are the available reports sufficient to create a repair plan?
Decision type: Report intake approval
Related bug IDs: R-BUG-001, R-BUG-002, R-BUG-003, R-BUG-004, R-BUG-005, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009, R-BUG-010
Evidence from reports: `QA_FINAL_REPORT.md`, `API_TEST_REPORT.md`, `BACKEND_TEST_REPORT.md`, `FRONTEND_BACKEND_CONSISTENCY_REPORT.md`, `PAYMENT_BILLING_REPORT.md`, `ADMIN_REPORT.md`, `BUG_LIST.md`, `FIX_PLAN.md`, `LAUNCH_READINESS_REPORT.md` consistently identify the same blockers.
Files likely affected: `REPAIR_INPUT_FILES.md`, `REPAIR_EVIDENCE_INDEX.md`
Risk level: Low
Design/template impact: None
Security impact: No code/runtime change; secrets intentionally excluded.
Backend/API/billing impact: None; report-only.
Proposed action: Create repair intake and evidence index from existing reports.
Agent 1 vote: APPROVE
Agent 1 reason: UAT/report evidence is sufficient to extract confirmed user-facing failures and blocked flows.
Agent 2 vote: APPROVE
Agent 2 reason: API, billing, payment, admin and DB-related gaps are identified with enough precision for triage.
Agent 3 vote: APPROVE
Agent 3 reason: Security/payment and visual-lock risks are explicit; no secret values are needed.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write `REPAIR_INPUT_FILES.md` and `REPAIR_EVIDENCE_INDEX.md`.
Status: COMPLETED

---

Decision ID: DEC-FIX-SHOPIER-OSB-RELAY-001
Decision title: Implement safe Shopier OSB relay/fallback before changing provider panel
Decision type: Backend payment safety fix
Related bug IDs: R-BUG-007
Evidence from reports: Shopier OSB is a legacy global notification URL in the panel and currently points to another service. YapayZekaLab needs automatic Shopier credit without breaking that service. Existing Shopier tests already verify TRY collection and amount/currency guards.
Files likely affected: `src/server/routes/payments.ts`, `src/server/lib/env.ts`, `.env.example`, `src/payment-safety-contract.test.ts`, `SHOPIER_INTEGRATION_STATUS.md`, payment/retest reports.
Risk level: Medium
Design/template impact: None; backend/env/report only.
Security impact: Positive; uses fixed fallback URL only, keeps callback payload logs sanitized, and does not commit credentials.
Backend/API/billing impact: Adds a new public OSB endpoint that reuses existing Shopier signature, TRY amount, idempotency and balance-credit rules. Existing callback route behavior remains redirect-based.
Proposed action: Add RED contract test, implement `/api/payments/shopier/osb` with optional `SHOPIER_OSB_FALLBACK_URL`, run full regression, then deploy only after git backup.
Agent 1 vote: APPROVE
Agent 1 reason: Enables a real user payment path while preserving existing Shopier-dependent service continuity.
Agent 2 vote: APPROVE
Agent 2 reason: Automatic balance credit remains guarded by payment row, signature, currency, amount and idempotency checks.
Agent 3 vote: APPROVE
Agent 3 reason: No visual change and no credential misuse; fallback avoids breaking SesLab OSB unexpectedly.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Commit, push, and prepare rollbackable live deploy.
Status: COMPLETED

---

Decision ID: DEC-RETEST-SHOPIER-OSB-RELAY-001
Decision title: Accept local Shopier OSB relay retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-007
Evidence from reports: RED source contract failed before `SHOPIER_OSB_FALLBACK_URL` and `/shopier/osb`; after implementation targeted tests passed 3 files / 22 tests; full `npm test` passed 30 files / 135 tests; lint/build/public scan/secret scan passed.
Files likely affected: Same as fix decision.
Risk level: Medium until live provider E2E.
Design/template impact: None.
Security impact: Secret scan passed; no raw Shopier credentials committed.
Backend/API/billing impact: Local callback safety accepted; live provider E2E still required.
Proposed action: Accept local fix and keep launch gate pending live deploy + Shopier credential/panel E2E.
Agent 1 vote: APPROVE
Agent 1 reason: Local behavior is covered and no UI regression was introduced.
Agent 2 vote: APPROVE
Agent 2 reason: Billing/credit path remains protected and fallback is bounded to a fixed env URL.
Agent 3 vote: APPROVE
Agent 3 reason: Visual lock preserved and provider secrets stayed out of repo.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Backup and deploy relay, then configure live env/panel when credentials are available.
Status: COMPLETED

---

Decision ID: DEC-SHOPIER-SETUP-001
Decision title: Keep Shopier disabled until safe credential and callback path is confirmed
Decision type: Provider setup / release gate
Related bug IDs: R-BUG-007, PAYMENT-INSTRUCTIONS-001
Evidence from reports: Current code supports dynamic USD top-up converted to rounded TRY Shopier form fields. Official Shopier help distinguishes PAT/account API access from checkout form credentials, and the panel OSB page marks OSB as legacy. Chrome panel inspection found the existing OSB notification URL configured for another service, so overwriting it could break that service.
Files likely affected: `.env.example`, `SHOPIER_INTEGRATION_STATUS.md`, `PAYMENT_BILLING_REPORT.md`, `AGENT_REPAIR_DECISIONS.md`
Risk level: High if enabled blindly; low for documentation-only update.
Design/template impact: None.
Security impact: Positive; prevents leaked PAT/JWT from being misused as legacy checkout credentials.
Backend/API/billing impact: Shopier remains disabled until a verified provider path is available; manual IBAN/manual crypto remain active.
Proposed action: Document the safe Shopier paths, clarify `.env.example`, and keep provider E2E blocked until legacy credentials plus safe callback or modern webhook support are verified.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing Shopier button should stay disabled instead of presenting an unverified payment path.
Agent 2 vote: APPROVE
Agent 2 reason: Billing safety requires verified amount/currency/signature/idempotency before automatic credit.
Agent 3 vote: APPROVE
Agent 3 reason: Avoids credential misuse and avoids breaking the existing OSB-dependent service.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Search for true legacy checkout credentials or implement modern webhook support only after provider contract is confirmed.
Status: COMPLETED

---

Decision ID: DEC-RETEST-LIVE-PAYMENT-PHONE-002
Decision title: Accept live WhatsApp payment phone recheck
Decision type: Retest acceptance
Related bug IDs: PAYMENT-INSTRUCTIONS-001
Evidence from reports: Live smoke passed; local secret scan reported 232 scanned / 0 hits. Safe live backend E2E with a temporary user verified the server-side payment notification phone, IBAN init WhatsApp link/reference, manual crypto init WhatsApp link/reference, and cleanup. Exact phone, IBAN and wallet values were not written to repo reports.
Files likely affected: `RETEST_LOG.md`, `PAYMENT_BILLING_REPORT.md`, `AGENT_REPAIR_DECISIONS.md`
Risk level: Low
Design/template impact: None; no frontend/CSS/layout/template files changed.
Security impact: Positive; confirms payment notification data is configured server-side while keeping raw values out of committed reports.
Backend/API/billing impact: Safe verification only; temporary rows were cleaned up and no balance credit/provider payment occurred.
Proposed action: Mark the live manual payment phone recheck accepted while keeping Shopier/Cryptomus provider E2E blocked until rotated credentials are installed.
Agent 1 vote: APPROVE
Agent 1 reason: The end-user missing WhatsApp notification path is now verified for both manual payment methods.
Agent 2 vote: APPROVE
Agent 2 reason: Backend responses and cleanup were verified without mutating customer balance or provider state.
Agent 3 vote: APPROVE
Agent 3 reason: Visual lock is untouched and sensitive payment details were not committed.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Continue Shopier credential/app investigation and provider E2E planning.
Status: COMPLETED

---

Decision ID: DEC-LIVE-PAYMENT-CONFIG-001
Decision title: Apply live IBAN, WhatsApp and manual USDT TRC20 payment instructions
Decision type: Live configuration change / payment UAT gate
Related bug IDs: PAYMENT-INSTRUCTIONS-001
Evidence from reports: Live Chrome payment UAT showed IBAN instruction panel opens after auth-refresh deploy, but production config still displays placeholder IBAN and no WhatsApp notification number. User supplied the real IBAN recipient, bank, IBAN, phone and USDT wallet details in the current thread.
Files likely affected: Remote `/opt/turkapiprojesi/.env.production`, remote `system_config` row, report files.
Risk level: Medium
Design/template impact: None; no frontend source, CSS, layout, color, spacing, card, button or modal style changes.
Security impact: Do not print full env contents or secrets. Payment display data is intentionally user-facing; provider secrets remain untouched. Use TRC20 only because the supplied wallet address is TRON-format and using it for BEP20 could cause loss of funds.
Backend/API/billing impact: Low to medium; enables manual payment instructions and WhatsApp link. It does not auto-credit balance, does not call Shopier/Cryptomus, and does not mutate customer balances.
Proposed action: Update live env for IBAN display, update `system_config` for WhatsApp and manual USDT TRC20 wallet, restart the service to load env changes, then run live smoke and Chrome UAT for IBAN/crypto instruction visibility.
Agent 1 vote: APPROVE
Agent 1 reason: This directly fixes the reproduced user-facing payment instruction blocker without changing the visual template.
Agent 2 vote: APPROVE
Agent 2 reason: Manual IBAN/crypto remains pending/admin-reviewed; no automatic crediting or provider payment mutation is introduced.
Agent 3 vote: APPROVE
Agent 3 reason: Approved with TRC20-only guard, no secret printing, and post-change live smoke/UAT.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Apply the live configuration change, restart service, run live smoke and browser UAT, then record retest.
Status: COMPLETED

Agent 4 integrity guard:
Vote: APPROVE
Reason: The change is configuration-only, preserves the restored site design, and reduces payment-loss risk by not advertising BEP20 without a BEP20 address.

---

Decision ID: DEC-RETEST-LIVE-PAYMENT-CONFIG-001
Decision title: Accept live IBAN, WhatsApp and manual USDT TRC20 payment instruction retest
Decision type: Retest acceptance / payment UAT
Related bug IDs: PAYMENT-INSTRUCTIONS-001
Evidence from reports: Live service restarted active after config update. `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` passed health/status/models/authless/JSON-404 checks. `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` passed 10/10. Safe live backend E2E created temporary IBAN and manual crypto init records with a test admin JWT, asserted current method/reference/WhatsApp data, and deleted those temporary records. Standard Chrome showed manual USDT TRC20 wallet instructions and WhatsApp button without visual template changes.
Files likely affected: Remote config only; report files.
Risk level: Low after retest
Design/template impact: None; no source style or layout changed.
Security impact: PASS. No provider secrets printed or changed. Test records were cleaned. BEP20 remains guarded by a warning rather than advertised as enabled without a BEP20 address.
Backend/API/billing impact: PASS for manual payment instructions. No automatic credit occurred; manual payments remain pending/admin-reviewed.
Proposed action: Mark live manual payment configuration accepted. Keep Shopier/Cryptomus provider E2E launch blocker open until rotated provider credentials are installed and valid/invalid/duplicate callback/webhook tests pass.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing payment instruction blocker is resolved for IBAN/manual crypto and live UAT stays green.
Agent 2 vote: APPROVE
Agent 2 reason: Backend assertions proved the correct reference/message mapping and cleanup; no balance mutation was introduced.
Agent 3 vote: APPROVE
Agent 3 reason: Visual lock held and payment-loss risk was reduced by TRC20-only display.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Update final reports, run local secret scan, and continue Shopier/Cryptomus provider E2E setup separately.
Status: COMPLETED

Agent 4 integrity guard:
Vote: APPROVE
Reason: The live manual payment change is isolated configuration, does not disturb the restored site design, and does not weaken provider/payment security gates.

---

Decision ID: DEC-FIX-AUTH-REFRESH-PROTECTED-POST-001
Decision title: Refresh expired user access token before protected payment/account requests
Decision type: Code/edit approval
Related bug IDs: AUTH-SESSION-REFRESH-001, PAYMENT-INSTRUCTIONS-001
Evidence from reports:
- Live Chrome UAT showed the dashboard still rendered user balance, but clicking the IBAN top-up button returned `Invalid or expired token` instead of showing IBAN/WhatsApp instructions.
- Source inspection shows `src/yapayzekalab/tab-account.jsx` sends `Authorization: Bearer <stored access token>` through `apiJson`, but never calls `/api/auth/refresh` on 401.
- Backend `/api/auth/refresh` already rotates refresh tokens safely; frontend does not use it for protected account/payment POSTs.
Files likely affected:
- `src/yapayzekalab/auth-client.js`
- `src/yapayzekalab/App.jsx`
- `src/yapayzekalab/tab-account.jsx`
- `src/auth-client-refresh.test.ts`
- `FIX_LOG.md`
- `RETEST_LOG.md`
Risk level: High
Design/template impact: None. Auth request helper only; no CSS, class names, layout, colors, typography, cards, buttons, modals, icons, or responsive rules may change.
Security impact: Positive if implemented correctly. Expired access tokens are refreshed with the existing refresh token; failed refresh must clear stale auth and must not leak tokens.
Backend/API/billing impact: Positive for protected payment/account requests. No backend route behavior, billing calculation, payment crediting, Shopier/Cryptomus callback, or DB schema change.
Proposed action:
1. Add RED tests for protected request retry after a 401 and for stale auth cleanup when refresh fails.
2. Add a small shared frontend auth client helper that reads/stores the existing token aliases, calls `/api/auth/refresh` once, retries the original request once, and clears stale tokens on refresh failure.
3. Switch `AccountTab` account/payment requests and `App.jsx` profile load to the helper.
4. Run targeted tests, full tests, lint/build/scans if targeted tests pass.
Agent 1 vote: APPROVE
Agent 1 reason: This directly addresses the live user-visible payment instruction failure and login/session breakage without redesign.
Agent 2 vote: APPROVE
Agent 2 reason: It reuses the existing backend refresh contract and does not alter payment crediting, billing, or API key behavior.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only because the change is non-visual and reduces stale token/security risk by clearing unusable credentials on refresh failure.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write failing auth-client regression tests, verify RED, then implement minimal helper and integrations.
Status: COMPLETED_LOCAL_RETEST_PENDING_LIVE_DEPLOY

---

Decision ID: DEC-RETEST-AUTH-REFRESH-PROTECTED-POST-001
Decision title: Accept local retest for expired-token refresh on protected payment/account requests
Decision type: Retest acceptance
Related bug IDs: AUTH-SESSION-REFRESH-001, PAYMENT-INSTRUCTIONS-001
Evidence from reports:
- RED test failed before implementation because the shared frontend auth client did not exist.
- GREEN targeted auth test passed after implementation.
- Targeted payment/admin regression passed 4 files / 15 tests.
- Full regression passed: lint, 30 test files / 134 tests, build, public bundle scan, secret scan.
- Default local UAT smoke failed due to `ERR_CONNECTION_REFUSED` on `127.0.0.1:4567`, not an application assertion failure.
- Live smoke against `https://yapayzekalab.org` passed 10/10, but the new auth refresh patch is not proven live until deploy.
Files likely affected:
- `src/yapayzekalab/auth-client.js`
- `src/yapayzekalab/App.jsx`
- `src/yapayzekalab/tab-account.jsx`
- `src/auth-client-refresh.test.ts`
- `FIX_LOG.md`
- `RETEST_LOG.md`
Risk level: Medium
Design/template impact: None. Source diff only changes auth request wiring and adds a helper/test.
Security impact: Positive; stale tokens are cleared if refresh fails, and token values are not logged.
Backend/API/billing impact: No backend behavior changed. Protected frontend account/payment calls can now recover from expired access tokens.
Proposed action: Accept local fix, create rollbackable Git backup, then deploy only after 4-agent deploy gate and run live payment-button retest.
Agent 1 vote: APPROVE
Agent 1 reason: The exact user-facing stale-token failure is covered by RED/GREEN regression and account/payment paths use the helper.
Agent 2 vote: APPROVE
Agent 2 reason: Existing `/api/auth/refresh` contract is reused; payment crediting and billing logic are untouched.
Agent 3 vote: APPROVE
Agent 3 reason: No style/template files changed beyond auth imports; secret scan and public scan passed.
Approval count: 3/3
Final decision: APPROVED_LOCALLY
Allowed next action: Commit/push backup and prepare deploy candidate; live payment retest remains required.
Status: COMPLETED_LOCAL_RETEST_ACCEPTED

---

Decision ID: DEC-FIX-SHOPIER-TL-COLLECTION-001
Decision title: Lock Shopier top-up collection as TRY while preserving USD balance quote
Decision type: Test/repair approval
Related bug IDs: PAYMENT-SHOPIER-TL-001, R-BUG-007
Evidence from reports: Payment reports require USD balance top-up with Shopier/IBAN TRY collection rounded upward to whole TL. Source inspection shows `/api/payments/shopier/init` stores `amountUsd`, `payableTL`, `creditTL`, `roundingTL` and sends `quote.payableTL` to `buildCheckoutForm`; `shopier-service.ts` sends `currency = 0` and `total_order_value = opts.miktarTL`.
Files likely affected: `src/server/services/shopier-service.test.ts`, `src/payment-safety-contract.test.ts`, `RETEST_LOG.md`, `FIX_LOG.md`
Risk level: Low
Design/template impact: None. No frontend CSS, class, layout, spacing, color, typography, card, button or modal structure changes.
Security impact: Positive. Prevents accidental USD/TRY confusion in provider payment payloads and avoids over-credit from TL rounding.
Backend/API/billing impact: No production behavior change planned; adds regression coverage for existing Shopier TRY collection and USD quote metadata.
Proposed action: Add regression tests proving Shopier checkout form sends whole TRY amount/currency to Shopier, while the payment route preserves USD quote metadata and credits only the selected USD equivalent in TL.
Agent 1 vote: APPROVE
Agent 1 reason: The user-facing requirement is specific and can be verified without visual change.
Agent 2 vote: APPROVE
Agent 2 reason: The tests protect billing semantics and do not alter live provider credentials or payment credit behavior.
Agent 3 vote: APPROVE
Agent 3 reason: This is non-visual, avoids secret exposure, and keeps deploy blocked until real provider E2E passes.
Agent 4 release guard: APPROVE_FOR_TEST_ONLY
Agent 4 reason: Safe to add tests; not sufficient for deploy or launch approval.
Approval count: 3/3 voting agents, 4th guard test-only approval
Final decision: APPROVED
Allowed next action: Add tests, run targeted payment test command, then update retest/fix logs.
Status: COMPLETED

---

Decision ID: DEC-RETEST-SHOPIER-TL-COLLECTION-001
Decision title: Accept Shopier TRY collection regression retest
Decision type: Retest acceptance
Related bug IDs: PAYMENT-SHOPIER-TL-COLLECTION-001, R-BUG-007
Evidence from reports: Targeted test command `npm test -- src/server/services/shopier-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-pricing.test.ts` passed 3 files / 21 tests. Tests prove Shopier checkout sends `currency=0`, whole-TL `total_order_value`, and TL product name while route preserves `amountUsd`, `payableTL`, and `creditTL`.
Files likely affected: `src/server/services/shopier-service.test.ts`, `src/payment-safety-contract.test.ts`, `FIX_LOG.md`, `RETEST_LOG.md`
Risk level: Low
Design/template impact: None; frontend visual files were not changed.
Security impact: Positive; no secret/provider credential used or printed.
Backend/API/billing impact: No production behavior changed; local regression coverage added. Live Shopier/Cryptomus E2E remains blocked until rotated credentials and panel callback settings are verified.
Proposed action: Accept local test guard and continue provider panel/env setup separately before any launch approval.
Agent 1 vote: APPROVE
Agent 1 reason: The user-facing USD selection to TL Shopier charge behavior is now covered by tests.
Agent 2 vote: APPROVE
Agent 2 reason: Billing metadata and provider charge separation are protected without changing runtime behavior.
Agent 3 vote: APPROVE
Agent 3 reason: No design change and no secret exposure; launch remains correctly blocked for live provider E2E.
Agent 4 release guard: NEEDS_MORE_EVIDENCE_FOR_DEPLOY
Agent 4 reason: Regression tests are not a live Shopier transaction or provider callback proof.
Approval count: 3/3 voting agents, 4th guard blocks deploy readiness
Final decision: APPROVED_LOCALLY
Allowed next action: Configure/verify Shopier panel credentials and callback URL in a secure browser session, then run sandbox/provider E2E without real money.
Status: COMPLETED

---

Decision ID: DEC-FIX-PAYMENT-INSTRUCTIONS-001
Decision title: Show IBAN/crypto payment instructions and WhatsApp notification without changing the visual theme
Decision type: Code/edit approval
Related bug IDs: PAYMENT-INSTRUCTIONS-001, PAYMENT-UX-001
Evidence from reports:
- User screenshot shows `$25` IBAN top-up creates only a reference alert.
- Source inspection confirms `/api/payments/iban/init` returns `iban.bankName`, `iban.ibanNumber`, `iban.owner`, `referansKodu`, `quote`, but `src/yapayzekalab/tab-account.jsx` ignores those fields and calls `window.alert`.
- `/api/payments/methods` has no WhatsApp notification field and no manual crypto wallet instructions.
- Admin UI has no payment settings section for WhatsApp notification number or crypto wallet/network/address.
Files likely affected:
- `src/payment-safety-contract.test.ts`
- `src/server/db/schema.ts`
- `src/server/db/seed.ts`
- `src/server/db/migrations/0006_manual_payment_settings.sql`
- `src/server/routes/admin.ts`
- `src/server/routes/payments.ts`
- `src/yapayzekalab/tab-account.jsx`
- `src/yapayzekalab/tab-admin.jsx`
- `.env.example`
Risk level: Medium
Design/template impact: Text/data/state only; no theme, color, spacing, class, button/card/modal style, page order, or layout rewrite is allowed.
Security impact: Manual payment instructions must not auto-credit balance. WhatsApp message must contain only payment reference, amount, method and user-safe context. Provider secrets remain server-only and are not exposed in admin UI.
Backend/API/billing impact: Adds non-secret manual payment config fields and returns instructions in existing payment endpoints. Shopier/Cryptomus signed callback/webhook credit behavior must remain unchanged.
Proposed action:
1. Write source-contract tests first for inline payment instructions, WhatsApp notification, and admin-configurable crypto wallet fields.
2. Add additive `system_config` columns for non-secret manual payment settings.
3. Include these fields in admin config serialization/update and payment methods response.
4. Replace IBAN reference-only alert with an inline instruction panel using existing returned backend data.
5. Support manual crypto instructions when admin wallet settings are enabled and Cryptomus provider env is absent; this creates a pending payment record but does not credit balance.
6. Run targeted contract tests, full tests, lint/build/scans as approved.
Agent 1 vote: APPROVE
Agent 1 reason: The customer cannot complete a bank transfer without bank/IBAN/recipient/reference and a clear notification path.
Agent 2 vote: APPROVE
Agent 2 reason: Additive config and pending-payment-only manual crypto keeps billing safe while improving payment clarity.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only because it preserves visual theme and does not expose provider API secrets or auto-credit manual payments.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Verify RED contract tests, then implement the minimal non-visual payment instruction fix.
Status: IN_PROGRESS

---

Decision ID: DEC-CMD-PAYMENT-INSTRUCTIONS-RED-001
Decision title: Run targeted payment safety contract as RED test
Decision type: Command/test approval
Related bug IDs: PAYMENT-INSTRUCTIONS-001, PAYMENT-UX-001
Evidence from reports: New contract tests were added before production code changes to prove the missing payment-instruction behavior is covered.
Files likely affected: None by command.
Risk level: Low
Design/template impact: None; test command only.
Security impact: No provider call, no payment provider, no secret output expected.
Backend/API/billing impact: No DB mutation, no live API call, no payment mutation.
Proposed action: Run `npm test -- src/payment-safety-contract.test.ts`.
Agent 1 vote: APPROVE
Agent 1 reason: Targeted RED test is required before editing payment UI/backend code.
Agent 2 vote: APPROVE
Agent 2 reason: Static/source contract test does not touch DB or payment providers.
Agent 3 vote: APPROVE
Agent 3 reason: Safe command and supports visual/security gate.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run the targeted RED test and record failure.
Status: APPROVED

---

Decision ID: DEC-FIX-OAUTH-STATE-TEST-FLAKE-001
Decision title: Make OAuth state tamper test deterministic
Decision type: Test-only fix approval
Related bug IDs: OAUTH-STATE-RESTART-001
Evidence from reports:
- Full `npm test` failed in `src/server/services/google-oauth-service.test.ts`.
- Root cause: the test builds `tampered` by replacing the last character with `x`; if the signed state already ends in `x`, the tampered string is identical to the valid state.
Files likely affected:
- `src/server/services/google-oauth-service.test.ts`
Risk level: Low
Design/template impact: None.
Security impact: Positive test accuracy only; no production OAuth behavior changes.
Backend/API/billing impact: None; test-only change.
Proposed action: Change the tamper helper to flip the final character to a different base64url-safe character.
Agent 1 vote: APPROVE
Agent 1 reason: Full regression must be deterministic before accepting payment changes.
Agent 2 vote: APPROVE
Agent 2 reason: Test-only correction does not affect auth implementation or billing.
Agent 3 vote: APPROVE
Agent 3 reason: It strengthens the security test without changing frontend/design.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Patch the OAuth state test only, then rerun targeted/full tests.
Status: APPROVED

---

Decision ID: DEC-CMD-PAYMENT-INSTRUCTIONS-REGRESSION-001
Decision title: Run local regression for manual payment instruction repair
Decision type: Command/test approval
Related bug IDs: PAYMENT-INSTRUCTIONS-001, PAYMENT-UX-001
Evidence from reports: The targeted RED test failed before implementation and now passes after adding manual payment instruction behavior. Broader checks are required before accepting the fix.
Files likely affected: None by commands except build artifacts.
Risk level: Low
Design/template impact: Commands verify source/build; no UI style edit expected.
Security impact: Secret scan verifies no leaked provider/router/payment tokens.
Backend/API/billing impact: Typecheck/tests verify payment/admin route changes without hitting payment providers.
Proposed action: Run `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, and `node scripts/scan-secrets.mjs`.
Agent 1 vote: APPROVE
Agent 1 reason: Payment UX change needs full local regression and build verification.
Agent 2 vote: APPROVE
Agent 2 reason: Backend/schema/admin/payment route changes require typecheck and full tests.
Agent 3 vote: APPROVE
Agent 3 reason: Secret and public bundle scans are mandatory because payment/provider areas were touched.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run the local regression commands and record results.
Status: APPROVED

---

Decision ID: DEC-RETEST-PAYMENT-INSTRUCTIONS-001
Decision title: Accept local manual payment instruction repair
Decision type: Retest acceptance
Related bug IDs: PAYMENT-INSTRUCTIONS-001, PAYMENT-UX-001
Evidence from reports:
- RED test failed before implementation: `npm test -- src/payment-safety-contract.test.ts` failed on missing `paymentInstruction` and manual payment config fields.
- GREEN targeted test passed after implementation: `npm test -- src/payment-safety-contract.test.ts` PASS 8/8.
- Targeted OAuth/payment tests PASS 10/10.
- Full regression passed: `npm run lint`, `npm test` 29 files / 130 tests, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, and `npm run qa:uat` 10/10.
Files likely affected:
- `src/server/db/schema.ts`
- `src/server/db/seed.ts`
- `src/server/db/migrations/0006_manual_payment_settings.sql`
- `src/server/routes/admin.ts`
- `src/server/routes/payments.ts`
- `src/yapayzekalab/tab-account.jsx`
- `src/yapayzekalab/tab-admin.jsx`
- `.env.example`
- reports/tests
Risk level: Medium
Design/template impact: Preserved locally; frontend touched only with existing style tokens/patterns. Live visual retest required after deploy.
Security impact: Provider API secrets are not exposed; manual crypto/IBAN do not auto-credit balance; WhatsApp message uses non-secret payment reference/amount/method context.
Backend/API/billing impact: Additive migration required before deploy. Manual crypto creates pending payment instructions only; provider Cryptomus webhook behavior unchanged.
Proposed action: Mark local fix accepted, keep launch/deploy blocked until migration, admin config, live Chrome payment UAT, and four-agent deploy gate are complete.
Agent 1 vote: APPROVE_FOR_LOCAL_FIX
Agent 1 reason: The reported user failure is addressed locally and smoke passed across desktop/mobile routes.
Agent 2 vote: APPROVE_WITH_MIGRATION_REQUIRED_BEFORE_DEPLOY
Agent 2 reason: Backend behavior is safe locally, but new `system_config` columns must exist before live service restart.
Agent 3 vote: APPROVE_WITH_LIVE_VISUAL_AND_PAYMENT_UAT_REQUIRED
Agent 3 reason: Visual lock is preserved locally and secret scan is clean; release remains blocked pending live retest.
Approval count: 3/3
Final decision: LOCAL_FIX_ACCEPTED_RELEASE_BLOCKED
Allowed next action: Prepare deploy plan only after four-agent gate is available or explicitly overridden.
Status: COMPLETED

---

Decision ID: DEC-FIX-OAUTH-RETURN-001
Decision title: Persist Google OAuth return tokens and map `/dashboard` to account without changing the visual shell
Decision type: Code/edit approval
Related bug IDs: R-BUG-003, AUTH-OAUTH-RETURN-001
Evidence from reports: Live Chrome UAT reached `https://yapayzekalab.org/dashboard?at=...&rt=...` after Google login, but the frontend still showed anonymous `Giriş yap` state and Admin stayed hidden for the owner account. The TDD contract in `src/admin-single-owner-contract.test.ts` is RED for missing URL token capture and `/dashboard` route mapping.
Files likely affected: `src/App.tsx`, `src/yapayzekalab/App.jsx`, `src/admin-single-owner-contract.test.ts`
Risk level: High
Design/template impact: None. The fix only reads URL query tokens, stores existing auth token aliases, removes sensitive query parameters from the address bar, and maps a route to the existing account tab. No CSS, class names, colors, layout, spacing, typography, buttons, cards, or modal styles may change.
Security impact: Positive. Tokens are removed from the URL after storage and are not logged or rendered.
Backend/API/billing impact: None. Backend OAuth callback already emits `at` and `rt`; this only lets the existing frontend consume them.
Proposed action: Add a one-time OAuth return effect in the restored frontend shell and map `/dashboard` to the existing account area. Then rerun the targeted contract test, lint, full tests, build, and secret/public scans.
Agent 1 vote: APPROVE
Agent 1 reason: This directly fixes the confirmed user-facing Google login return failure.
Agent 2 vote: APPROVE
Agent 2 reason: Backend token issuance remains unchanged; the frontend only persists already-issued tokens.
Agent 3 vote: APPROVE
Agent 3 reason: Approved because it cleans token-bearing URLs and has no visual/template impact.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Apply the minimal non-visual OAuth return patch and run the approved retest commands.
Status: IN_PROGRESS

---

Decision ID: DEC-FIX-PAYMENT-PROVIDER-AMOUNT-001
Decision title: Enforce provider callback amount and currency matches before balance credit
Decision type: Code/edit approval
Related bug IDs: R-BUG-007, PAYMENT-PROVIDER-E2E-001
Evidence from reports: Payment reports require invalid, failed, mismatched and duplicate provider callbacks/webhooks to avoid balance credit. Existing local contracts covered signature/idempotency, but route-level amount/currency mismatch checks needed explicit source/test evidence.
Files likely affected: `src/server/services/shopier-service.ts`, `src/server/routes/payments.ts`, `src/server/services/shopier-service.test.ts`, `src/payment-safety-contract.test.ts`
Risk level: High
Design/template impact: None. Backend-only callback validation and tests.
Security impact: Positive. Prevents signed-but-wrong amount/currency callback/webhook from crediting balance.
Backend/API/billing impact: Positive. Balance credit remains tied to stored quote/invoice values; no schema or frontend behavior change.
Proposed action: Preserve existing signature/idempotency behavior while adding amount/currency verification for Shopier and Cryptomus provider callbacks.
Agent 1 vote: APPROVE
Agent 1 reason: Payment mismatch behavior is a launch-critical UAT safety requirement.
Agent 2 vote: APPROVE
Agent 2 reason: The change narrows credit eligibility and does not alter successful quote creation or IBAN flow.
Agent 3 vote: APPROVE
Agent 3 reason: It reduces payment bypass risk and has no visual impact.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Keep the backend hardening patch and run targeted/full regression.
Status: COMPLETED

---

Decision ID: DEC-RETEST-PAYMENT-PROVIDER-AMOUNT-001
Decision title: Accept local provider amount/currency guard retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-007, PAYMENT-PROVIDER-E2E-001
Evidence from reports: `npm run lint` PASS; `npm test` PASS 28 files / 126 tests; `npm run build` PASS; public scan PASS 0 hits; secret scan PASS 227 scanned / 0 hits. Payment reports updated to mark local guard coverage accepted while provider E2E remains blocked.
Files likely affected: Backend payment routes/services/tests and reports.
Risk level: Medium
Design/template impact: None.
Security impact: Positive; no secrets printed or committed.
Backend/API/billing impact: Positive; successful callback behavior still requires provider E2E after rotated env is installed.
Proposed action: Accept local hardening as fixed locally, keep launch blocked for Shopier/Cryptomus provider E2E.
Agent 1 vote: APPROVE
Agent 1 reason: The mismatch guard behavior is now covered by tests and does not affect UI.
Agent 2 vote: APPROVE
Agent 2 reason: Full regression passed and billing credit conditions are stricter.
Agent 3 vote: APPROVE
Agent 3 reason: Security posture improved; provider E2E is still correctly not marked as passed.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Deploy only after rollbackable Git backup and then run live provider E2E when rotated env exists.
Status: COMPLETED

---

Decision ID: DEC-RETEST-OAUTH-RETURN-001
Decision title: Accept local Google OAuth return fix pending live deploy retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-003, AUTH-OAUTH-RETURN-001
Evidence from reports: Targeted admin/OAuth source contract passed 3/3 after the patch; full lint/test/build/scans passed. Live Chrome previously reproduced the bug, so live owner login must be rerun after deploy.
Files likely affected: `src/App.tsx`, `src/yapayzekalab/App.jsx`, reports.
Risk level: Medium
Design/template impact: None; route/token handling only.
Security impact: Positive; token-bearing URL is cleaned with `history.replaceState`.
Backend/API/billing impact: None.
Proposed action: Accept local fix, deploy with rollback, then rerun Chrome Google OAuth/admin owner UAT.
Agent 1 vote: APPROVE_FOR_LOCAL_FIX
Agent 1 reason: The confirmed login return failure has a targeted passing test.
Agent 2 vote: APPROVE
Agent 2 reason: Backend callback contract remains unchanged.
Agent 3 vote: APPROVE_WITH_DEPLOY_RETEST_REQUIRED
Agent 3 reason: Token cleanup is a security improvement, but release needs post-deploy live browser evidence.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Prepare rollbackable Git backup and deploy the local OAuth/payment hardening patch.
Status: COMPLETED

---

Decision ID: DEC-GOV-FOUR-AGENT-GATE-001
Decision title: Require four-agent gate for all future deploy and release decisions
Decision type: Governance / deploy gate
Related bug IDs: DESIGN-REGRESSION-001, R-BUG-009, RELEASE-GATE-001
Evidence from reports: A previous live deploy caused a rejected visual/template regression. User explicitly required three QA agents plus a fourth end-to-end integrity guard before deploy/release decisions. Native sub-agent spawn attempted on 2026-05-27 and failed with `agent thread limit reached`; Ruflo swarm initialized but could not spawn hive workers, and task auto-assignment had no pending task consumer.
Files likely affected: `DEPLOY_AGENT_GATE.md`, `AGENT_REPAIR_DECISIONS.md`, future deploy/release workflows.
Risk level: Critical
Design/template impact: Positive; prevents unreviewed visual/template changes from reaching production.
Security impact: Positive; prevents silent deploy approval when security/payment/admin review is unavailable.
Backend/API/billing impact: Positive; deploy decisions remain blocked unless billing/API risks are reviewed.
Proposed action: Enforce a four-agent gate: Agent 1 QA/UAT, Agent 2 Backend/API/Billing, Agent 3 Security/Visual/Release. At least 2/3 must approve before Agent 4 End-to-End Integrity Guard is consulted. Agent 4 must approve the full-system impact before deploy/release can proceed. If real agent review is unavailable, mark `BLOCKED_BY_AGENT_CAPACITY`.
Agent 1 vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: Native agent spawn was capacity-limited, so no real QA agent vote was collected for continuing the current deploy.
Agent 2 vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Backend smoke was healthy, but this governance decision requires real agent review for future actions.
Agent 3 vote: NEEDS_MORE_EVIDENCE
Agent 3 reason: Visual/security guard cannot be silently simulated when the user required actual agents.
Approval count: 0/3
Final decision: BLOCKED_BY_AGENT_CAPACITY_FOR_CURRENT_DEPLOY_DECISION; GOVERNANCE RULE RECORDED BY DIRECT USER ORDER
Allowed next action: Read-only smoke/status checks are allowed; deploy/release continuation must wait for real agent capacity or explicit user override of the new gate.
Status: BLOCKED

---

Decision ID: DEC-FIX-OAUTH-STATE-001
Decision title: Make Google OAuth state restart-safe to prevent login breakage during deploy/restart
Decision type: Code/edit approval
Related bug IDs: R-BUG-003, AUTH-OAUTH-STATE-001
Evidence from reports: User reported login is broken after the latest live work. Source inspection showed OAuth state was process-local (`Map`), so any service restart while a user is on Google's account/consent screen invalidates the callback state and returns `Invalid or expired state`.
Files likely affected: `src/server/services/google-oauth-service.ts`, `src/server/routes/auth.ts`, `src/server/services/google-oauth-service.test.ts`, repair reports.
Risk level: High
Design/template impact: None. Backend OAuth state handling only.
Security impact: Positive if implemented with signed, TTL-bound state; no secret/state/token values may be logged.
Backend/API/billing impact: Auth-only; no payment, API billing, balance or provider behavior change.
Proposed action: Replace in-memory OAuth state map with HMAC-signed state using `JWT_SECRET`, 5-minute TTL, tamper/expiry rejection, and targeted tests.
Agent 1 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 1 reason: Native agent spawn returned `agent thread limit reached`; no real QA agent vote could be collected.
Agent 2 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 2 reason: Native agent spawn returned `agent thread limit reached`; no real backend/billing agent vote could be collected.
Agent 3 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 3 reason: Native agent spawn returned `agent thread limit reached`; no real security/visual agent vote could be collected.
Approval count: 0/3
Final decision: LOCAL_EMERGENCY_FIX_IMPLEMENTED_AND_TESTED; LIVE_DEPLOY_BLOCKED_BY_AGENT_CAPACITY_UNDER_4_AGENT_GATE
Allowed next action: Commit/push local fix for backup. Do not deploy until the four-agent gate can run or the user explicitly overrides the gate.
Status: LOCAL_FIXED_DEPLOY_BLOCKED

---

Decision ID: DEC-RETEST-OAUTH-STATE-001
Decision title: Accept local restart-safe OAuth state retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-003, AUTH-OAUTH-STATE-001
Evidence from reports: RED test failed before implementation. After the patch, targeted OAuth/admin tests passed 5/5, lint passed, full test suite passed 29 files / 128 tests, build passed, public scan passed, secret scan passed, and live safe smoke remained healthy.
Files likely affected: Auth route/service/tests and reports.
Risk level: Medium
Design/template impact: None.
Security impact: Positive; tampered/expired state rejection covered by tests.
Backend/API/billing impact: Auth-only; no billing/payment side effects.
Proposed action: Mark local fix verified; keep live deployment blocked by the 4-agent gate.
Agent 1 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 1 reason: Real agent vote unavailable due thread limit.
Agent 2 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 2 reason: Real agent vote unavailable due thread limit.
Agent 3 vote: BLOCKED_BY_AGENT_CAPACITY
Agent 3 reason: Real agent vote unavailable due thread limit.
Approval count: 0/3
Final decision: LOCAL_RETEST_PASSED_BUT_AGENT_ACCEPTANCE_BLOCKED
Allowed next action: Backup commit only; no deploy/release decision.
Status: BLOCKED_FOR_DEPLOY

---

Decision ID: DEC-CMD-LIVE-OMNI-PAYMENT-E2E-001
Decision title: Run safe live OmniRoute billing plus Shopier/Cryptomus server-side E2E verification
Decision type: Command/test approval
Related bug IDs: R-BUG-006, R-BUG-007, LIVE-BILLING-OMNI-001, PAYMENT-PROVIDER-E2E-001
Evidence from reports: CloseRouter inference was blocked by provider 502. Temporary OmniRoute switch has already been deployed and live funded gateway billing produced a successful text response with billing headers, balance decrement, usage record and transaction. Payment reports still require Shopier/Cryptomus valid, invalid and duplicate callback/webhook proof without real money.
Files likely affected: Reports only: `API_TEST_REPORT.md`, `PAYMENT_BILLING_REPORT.md`, `RETEST_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`, `AGENT_REPAIR_DECISIONS.md`.
Risk level: Medium
Design/template impact: None. No frontend file or styling will be changed.
Security impact: Test must not print secrets, must not use real payment money, must clean temporary users/payments, and must avoid destructive provider dashboard actions.
Backend/API/billing impact: Creates temporary live test users/payments only, performs one or few tiny text calls, simulates signed provider callbacks/webhooks server-side, verifies idempotency and cleanup.
Proposed action: From the live VPS, load env without printing secret values, create isolated test users/JWTs, call payment methods/init endpoints, simulate invalid and valid Shopier/Cryptomus callbacks using live server secrets without printing them, verify balance/transactions/payment statuses/idempotency in DB, clean all temporary rows, then run secret scan and update reports.
Agent 1 vote: APPROVE
Agent 1 reason: This is the missing real launch evidence for customer-facing billing and payment behavior, and it does not require real checkout/payment.
Agent 2 vote: APPROVE
Agent 2 reason: The test validates exact backend effects: headers, balance, transactions, payments, webhook idempotency and cleanup.
Agent 3 vote: APPROVE
Agent 3 reason: Approved because secrets are not printed, no real money is used, and no design/theme surface is touched.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Execute bounded live verification commands and record exact evidence.
Status: APPROVED

---

Decision ID: DEC-RETEST-LIVE-OMNI-BILLING-001
Decision title: Accept temporary OmniRoute GPT gateway billing retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-006, LIVE-BILLING-OMNI-001
Evidence from reports: Temporary funded live `yzk_live_*` call to `/v1/chat/completions` returned `200`; `X-YZ-Cost-TL=0.0329`, `X-YZ-Remaining-TL=49.97`, request id present; DB balance `49.9671`, spend `0.0329`, `usage_records.status=success`; cleanup leftovers `0`.
Files likely affected: `API_TEST_REPORT.md`, `PAYMENT_BILLING_REPORT.md`, `RETEST_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`.
Risk level: Medium
Design/template impact: None
Security impact: No secrets printed; temporary key/user cleaned up.
Backend/API/billing impact: Positive evidence for funded text billing through the temporary OmniRoute route. Token usage should still be monitored because direct OmniRoute provider routes have shown inconsistent token reporting.
Proposed action: Mark R-BUG-006 happy-path billing as accepted for the temporary OmniRoute GPT path, not for the original CloseRouter provider path.
Agent 1 vote: APPROVE
Agent 1 reason: The customer-visible first API call path now has live evidence with billing headers and cleanup.
Agent 2 vote: APPROVE
Agent 2 reason: Balance decrement, usage record and spend counters were verified in the live DB.
Agent 3 vote: APPROVE_WITH_MONITORING
Agent 3 reason: No secret exposure occurred; release still needs monitoring and payment provider gates.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Update launch readiness to remove API/billing blocker for the temporary OmniRoute GPT path.
Status: COMPLETED

---

Decision ID: DEC-RETEST-LIVE-PAYMENT-PROVIDER-ENV-001
Decision title: Evaluate live Shopier/Cryptomus provider E2E readiness
Decision type: Retest acceptance
Related bug IDs: R-BUG-007, PAYMENT-PROVIDER-E2E-001
Evidence from reports: Live env has `SHOPIER_API_KEY=UNSET`, `SHOPIER_API_SECRET=UNSET`, `CRYPTOMUS_API_KEY=UNSET`, `CRYPTOMUS_MERCHANT_ID=UNSET`. `/api/payments/methods` disables Shopier/Cryptomus and keeps IBAN enabled. Shopier/Cryptomus init each return `503` and create zero payment rows. Local provider contract tests pass 32/32 and secret scan is clean.
Files likely affected: `PAYMENT_BILLING_REPORT.md`, `RETEST_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`.
Risk level: High for launch if Shopier/Cryptomus are required payment methods.
Design/template impact: None
Security impact: Safe-disabled behavior passes; real provider E2E remains unverified.
Backend/API/billing impact: Payment provider launch is blocked by missing rotated credentials, not by currently observed unsafe credit behavior.
Proposed action: Keep Shopier/Cryptomus launch status blocked until rotated credentials are installed securely and valid/invalid/fail/duplicate callback/webhook tests pass.
Agent 1 vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: Customer cannot use Shopier/Cryptomus while methods are disabled.
Agent 2 vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Backend disabled-state is safe, but successful provider init and callback/webhook credit cannot be tested without env.
Agent 3 vote: REJECT
Agent 3 reason: Do not use leaked old credentials; require rotated live/sandbox provider credentials before approval.
Approval count: 0/3
Final decision: REJECTED_FOR_LAUNCH
Allowed next action: Install rotated provider credentials via secure server env path, then rerun provider E2E.
Status: BLOCKED_BY_MISSING_ROTATED_PROVIDER_ENV

---

Decision ID: DEC-CMD-GIT-BACKUP-PROVIDER-INCIDENT-001
Decision title: Commit and push provider incident/report-only updates
Decision type: Command approval
Related bug IDs: R-BUG-006
Evidence from reports: Provider diagnostics add launch-blocking evidence and request ids for support escalation. Secret scan returned zero hits and diff is report-only.
Files likely affected: Git metadata and remote branch `phase/release-vps-beta`.
Risk level: Low
Design/template impact: None.
Security impact: Secret scan passed; no provider keys or payment credentials are included.
Backend/API/billing impact: None; report-only backup.
Proposed action: Commit report-only provider incident updates and push to origin for rollback/audit continuity.
Agent 1 vote: APPROVE
Agent 1 reason: QA evidence should be backed up before the next loop.
Agent 2 vote: APPROVE
Agent 2 reason: The incident report documents the billing blocker without changing runtime code.
Agent 3 vote: APPROVE
Agent 3 reason: Backup is safe after secret scan and avoids losing launch-blocker evidence.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run git add/commit/push for report-only provider incident updates.
Status: APPROVED

---

Decision ID: DEC-RETEST-DEPLOY-TARGET-METADATA-001
Decision title: Accept deploy target metadata and live secret hygiene retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-002, R-BUG-009, DEPLOY-TARGET-METADATA-001, LIVE-LEGACY-ADMINPASSWORD-ENV-001
Evidence from reports: Deploy target contract test failed before patch on old `/opt/yapayzekalab`, `yapayzekalab`, `4567` defaults, then passed after script/docs were aligned to `/opt/turkapiprojesi`, `turkapiprojesi`, `4568`. `bash -n` deploy scripts passed. Full `npm test` passed 28 files / 118 tests. Build/public scan/secret scan passed. Live service restarted active; smoke passed; `/status.deploy.id` now reports `manual-20260527T071659Z-ddee303`; legacy `ADMIN_PASSWORD` line is absent; env backup artefact is outside regular `.deploy/backups` and secured as `600 root:root`.
Files likely affected: `scripts/vps-deploy.sh`, `docs/vps-deploy.md`, `docs/release-vps-beta-checklist.md`, `src/deploy-target-contract.test.ts`, report files, remote deploy metadata/config hygiene.
Risk level: Low after retest.
Design/template impact: None; no frontend component/CSS/theme/layout files changed.
Security impact: Positive; stale env backup artefact secured and unused legacy admin password removed from live env. Provider-side credential rotation remains recommended.
Backend/API/billing impact: No billing behavior changed; live smoke stayed PASS.
Proposed action: Mark deploy target metadata and live secret hygiene accepted; continue release blocking on provider inference billing and Shopier/Cryptomus E2E.
Agent 1 vote: APPROVE
Agent 1 reason: This prevents future stale live-target/template deploy mistakes and live smoke still passes.
Agent 2 vote: APPROVE
Agent 2 reason: Runtime metadata is now accurate and backend smoke stayed healthy.
Agent 3 vote: APPROVE
Agent 3 reason: Visual surface untouched and secret hygiene improved.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Commit/push deploy metadata and report updates after final secret scan.
Status: COMPLETED

---

Decision ID: DEC-FIX-LIVE-LEGACY-ADMINPASSWORD-ENV-001
Decision title: Remove unused legacy ADMIN_PASSWORD from live env without printing secrets
Decision type: Live config hygiene approval
Related bug IDs: DESIGN-REGRESSION-001, R-BUG-008
Evidence from reports: Admin password flow is removed in source and live UI. `src/server/lib/env.ts` no longer requires `ADMIN_PASSWORD`; `/api/admin/login` returns 410. Live env still contains an unused legacy `ADMIN_PASSWORD` key, which is inconsistent with the single-owner Google admin model.
Files likely affected: Remote `/opt/turkapiprojesi/.env.production`; service restart; reports.
Risk level: Medium
Design/template impact: None.
Security impact: Positive; no secret values may be printed. Other credentials still require provider-side rotation if considered exposed.
Backend/API/billing impact: Low; source does not read `ADMIN_PASSWORD`, but service smoke must pass after restart.
Proposed action: Remove only the `ADMIN_PASSWORD=` line from live `.env.production` using a non-printing edit, keep file mode 600, restart `turkapiprojesi.service`, then run live smoke.
Agent 1 vote: APPROVE
Agent 1 reason: Aligns live config with the verified no-admin-password UX.
Agent 2 vote: APPROVE
Agent 2 reason: Backend schema/routes no longer require this env key and smoke will catch runtime issues.
Agent 3 vote: APPROVE
Agent 3 reason: Reduces secret surface and supports the release guard without visual impact.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Remove legacy live `ADMIN_PASSWORD` line without printing env contents and retest.
Status: APPROVED

---

Decision ID: DEC-FIX-DEPLOY-TARGET-METADATA-001
Decision title: Align deploy script/runbook with real VPS target and repair live deploy metadata
Decision type: Code/docs/live-metadata approval
Related bug IDs: R-BUG-002, R-BUG-009
Evidence from reports: Live active service is `turkapiprojesi.service` under `/opt/turkapiprojesi` on port `4568`, but `scripts/vps-deploy.sh` and deploy docs still default to `/opt/yapayzekalab`, `yapayzekalab`, and port `4567`. Latest `/status.deploy.id` still shows the restored-theme deploy instead of the later payment UI deploy because the manual deploy did not write a release manifest.
Files likely affected: `scripts/vps-deploy.sh`, `docs/vps-deploy.md`, `docs/release-vps-beta-checklist.md`, a deploy contract test, report files, and remote `.deploy/releases/manual-20260527T071659Z-ddee303.json`.
Risk level: Medium
Design/template impact: None.
Security impact: Do not print env contents. Remove or quarantine plaintext env backup artifacts from `.deploy/backups` if present. No secret values in source/report files.
Backend/API/billing impact: No app code or DB behavior change; improves deploy safety and `/status` observability.
Proposed action: Add a failing contract test for the real live deploy target, update script/docs defaults, create the missing live release manifest for the latest deploy, secure stale env backup file without exposing contents, run targeted test and secret scan, then update reports.
Agent 1 vote: APPROVE
Agent 1 reason: Correct deploy metadata and docs reduce future stale-template/live-drift regressions.
Agent 2 vote: APPROVE
Agent 2 reason: This does not touch billing logic but protects the real runtime path used for live verification.
Agent 3 vote: APPROVE
Agent 3 reason: Approved because it is non-visual and explicitly includes secret hygiene for env backup artifacts.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Add RED deploy-target test, patch deploy script/docs, repair remote manifest and secure env backup.
Status: APPROVED

---

Decision ID: DEC-CMD-LIVE-CLOSEROUTER-DIAGNOSTICS-002
Decision title: Re-read live CloseRouter catalog and attempt one bounded tiny text inference
Decision type: Command/test approval
Related bug IDs: R-BUG-006
Evidence from reports: Latest live checks show `/credits` and `/models/count` pass, but tiny text inference timed out across several model IDs. Successful funded API billing cannot be accepted until at least one upstream text inference succeeds.
Files likely affected: None by command; report files may be updated afterward.
Risk level: Medium
Design/template impact: None.
Security impact: Must not print Authorization values, cookies, raw API keys, or env files. Only model IDs, status codes, timing and non-secret error codes may be printed.
Backend/API/billing impact: Direct provider call may spend a tiny amount only if successful; max output is capped at 4 tokens and testing stops on first success or bounded failures. No database or payment mutation.
Proposed action: From the live VPS env, read CloseRouter base URL and key without printing the key, fetch current text model catalog, choose current chat-capable low-cost candidates, then try tiny `/chat/completions` calls with `max_tokens <= 4` under timeout. Do not test images/videos.
Agent 1 vote: APPROVE
Agent 1 reason: This directly addresses the remaining first API call launch blocker and keeps user-facing UI untouched.
Agent 2 vote: APPROVE
Agent 2 reason: It separates model-ID drift from upstream/provider failure with bounded spend and no DB mutation.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only with strict secret redaction and no image/video/payment calls.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run live CloseRouter bounded diagnostic.
Status: APPROVED

---

Decision ID: DEC-RETEST-LIVE-BILLING-DIAGNOSTICS-002
Decision title: Is successful live API billing unblocked after current catalog and messages diagnostics?
Decision type: Retest acceptance
Related bug IDs: R-BUG-006
Evidence from reports: Live VPS CloseRouter `/credits` returned 200 with `total_credits=1.99998845`; live `/models?output_modalities=text` returned 18 text/chat-capable models. Tiny `/chat/completions` calls for current low-cost catalog candidates returned `502 upstream_error`. Detailed Deepseek metadata showed `upstream_connection_refused`, request id `c2c53a5e-1cd3-474d-8136-17da70c0d922`. One `/messages` call for `anthropic/claude-haiku-4.5` returned `502 upstream_connect_timeout`, request id `98a159de-f6df-4a97-a7e6-78516f90bf65`.
Files likely affected: Reports only.
Risk level: High for release, Low for code.
Design/template impact: None.
Security impact: No keys or Authorization values printed; provider request ids are safe to use for support escalation.
Backend/API/billing impact: Successful billing remains blocked; failure confirms provider inference route is unhealthy despite account/catalog/balance being reachable.
Proposed action: Mark successful API billing as still blocked, stop large token tests, and escalate provider `502` evidence before another funded gateway success attempt.
Agent 1 vote: REJECT
Agent 1 reason: A first API request still cannot complete as a customer.
Agent 2 vote: REJECT
Agent 2 reason: Billing headers, positive ledger transaction and success usage record cannot be proven while provider inference returns 502.
Agent 3 vote: REJECT
Agent 3 reason: Launch would misrepresent a core paid API capability; keep release blocked.
Approval count: 0/3
Final decision: REJECTED
Allowed next action: Create provider incident notes and continue non-destructive verification only.
Status: COMPLETED

---

Decision ID: DEC-CMD-LIVE-CLOSEROUTER-HEARTBEAT-001
Decision title: Heartbeat live CloseRouter recheck with at most one tiny inference
Decision type: Command/test approval
Related bug IDs: R-BUG-006
Evidence from reports: Prior launch readiness and API reports show CloseRouter account/catalog are reachable but inference returns provider `502`, blocking successful funded API billing.
Files likely affected: Report files only after command.
Risk level: Medium
Design/template impact: None.
Security impact: Must not print live env, Authorization values, raw API keys, cookies, or payment credentials. Only status codes, model ids, non-secret error codes and provider request ids may be recorded.
Backend/API/billing impact: Direct provider call may spend a negligible amount only if successful; output capped at `max_tokens=4`. No image/video, no payments, no customer data mutation.
Proposed action: Verify git/live smoke, then from live VPS env check CloseRouter `/credits`, `/models/count`, text catalog, and run exactly one tiny `/chat/completions` inference. Run funded gateway billing only if direct inference succeeds and a safe test key is already present.
Agent 1 vote: APPROVE
Agent 1 reason: This safely retests the remaining first API request blocker with minimal spend.
Agent 2 vote: APPROVE
Agent 2 reason: It separates upstream inference health from YapayZekaLab billing and avoids DB mutation unless the provider gate passes.
Agent 3 vote: APPROVE
Agent 3 reason: Approved because it preserves the visual theme, avoids secret output, and blocks launch if provider inference still fails.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run safe live smoke and one bounded direct provider inference from the VPS environment.
Status: COMPLETED

---

Decision ID: DEC-CMD-LIVE-OMNIROUTE-CHECK-001
Decision title: Check temporary OmniRoute upstream viability without live switch
Decision type: Command/test approval
Related bug IDs: R-BUG-006
Evidence from reports: CloseRouter direct inference remains blocked by upstream `502`; user requested temporary OmniRoute usage. Memory/live context shows OmniRoute exists as `api.seslab.tr` and local VPS container `omniroute`.
Files likely affected: Report files only.
Risk level: Medium
Design/template impact: None.
Security impact: Must not print OmniRoute API key, env values, cookies, provider secrets, or raw DB secret fields.
Backend/API/billing impact: Direct provider checks may spend a tiny amount only if successful; no YapayZekaLab customer data or payment data mutation. Do not switch live env until billing risk and rollback are documented.
Proposed action: Verify live smoke, no-auth OmniRoute behavior, live env key presence, current key compatibility, read-only active OmniRoute API key availability, and one tiny direct text call.
Agent 1 vote: APPROVE
Agent 1 reason: Determines whether OmniRoute can unblock the first API request path.
Agent 2 vote: APPROVE
Agent 2 reason: Direct provider viability must be known before any gateway routing change.
Agent 3 vote: APPROVE
Agent 3 reason: Approved with strict secret redaction and no live config/customer mutation.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run read-only OmniRoute viability checks and one bounded direct text call.
Status: COMPLETED

---

Decision ID: DEC-RETEST-LIVE-OMNIROUTE-001
Decision title: Is OmniRoute ready to be used by YapayZekaLab live gateway now?
Decision type: Retest acceptance
Related bug IDs: R-BUG-006
Evidence from reports: Live smoke passed. OmniRoute no-auth returned `401 AUTH_002`. Existing CloseRouter key failed against OmniRoute. Read-only OmniRoute DB lookup found one active key without printing it. Authenticated direct `/v1/models` returned `200` and `70` models. One tiny direct chat returned `200`, request id `chatcmpl-1779896002128`, but usage was `total_tokens=6125` for a tiny prompt.
Files likely affected: `API_TEST_REPORT.md`, `RETEST_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`, `AGENT_REPAIR_DECISIONS.md`.
Risk level: High for billing if switched blindly.
Design/template impact: None.
Security impact: No secrets printed. Live switch would need a no-print env backup/edit and rollback.
Backend/API/billing impact: Direct provider works, but gateway billing still unverified and provider-reported usage may be unexpectedly high.
Proposed action: Do not mark launch ready. Before switching customer traffic, create a rollbackable env-switch decision and run safe funded gateway billing test with OmniRoute.
Agent 1 vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: Customer path through YapayZekaLab is not proven yet.
Agent 2 vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Billing must be validated because OmniRoute reported 6125 tokens for a tiny request.
Agent 3 vote: NEEDS_MORE_EVIDENCE
Agent 3 reason: A live switch without rollback and billing guard is not release-safe.
Approval count: 0/3
Final decision: NOT APPROVED
Allowed next action: Prepare rollbackable OmniRoute env switch and funded billing verification if a safe test key is available.
Status: COMPLETED

---

Decision ID: DEC-RETEST-LIVE-CLOSEROUTER-HEARTBEAT-001
Decision title: Did the heartbeat recheck unblock successful funded API billing?
Decision type: Retest acceptance
Related bug IDs: R-BUG-006
Evidence from reports: Live smoke passed; live VPS CloseRouter `/credits` returned 200 with `total_credits=1.99998845`, `/models/count` returned 34, and text catalog returned 18 models. The only direct tiny `/chat/completions` attempt used `deepseek/deepseek-v4-pro` with `max_tokens=4` and returned `502 upstream_error`, request id `b00967ca-09ae-4ffa-8a64-7d78f14d9cb5`.
Files likely affected: `API_TEST_REPORT.md`, `RETEST_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`, `AGENT_REPAIR_DECISIONS.md`.
Risk level: High for release, Low for code.
Design/template impact: None.
Security impact: No secrets printed; no image/video/payment/provider mutation beyond one tiny text attempt.
Backend/API/billing impact: Successful billing remains blocked; funded gateway billing was correctly skipped because direct provider inference failed.
Proposed action: Keep final launch verdict blocked by API/billing/balance; continue periodic provider rechecks or escalate request id to CloseRouter.
Agent 1 vote: REJECT
Agent 1 reason: First customer text API request still cannot be accepted as working.
Agent 2 vote: REJECT
Agent 2 reason: Positive billing headers, balance deduction, transaction and success usage record cannot be proven.
Agent 3 vote: REJECT
Agent 3 reason: Release remains unsafe while the core paid API route depends on an upstream path returning 502.
Approval count: 0/3
Final decision: REJECTED
Allowed next action: Do not run larger token tests; keep launch blocked and recheck later or escalate provider evidence.
Status: COMPLETED

---

Decision ID: DEC-CMD-LIVE-CLOSEROUTER-MESSAGES-001
Decision title: Test one bounded Anthropic-style CloseRouter messages route
Decision type: Command/test approval
Related bug IDs: R-BUG-006
Evidence from reports: Direct chat route still returns `502 upstream_connection_refused` across current chat models. CloseRouter public docs/homepage advertise Anthropic-style `/messages`; YapayZekaLab exposes `/v1/messages`, so one bounded direct messages test can determine whether all inference is down or only chat routing is affected.
Files likely affected: None by command; report files may be updated afterward.
Risk level: Medium
Design/template impact: None.
Security impact: Must not print API keys, env files, Authorization headers, cookies, prompt content beyond safe test text, or full raw response.
Backend/API/billing impact: May spend a negligible amount if successful; capped to `max_tokens <= 4`, one request only, no images/videos/payments/database mutation.
Proposed action: From live VPS env, call direct CloseRouter `/messages` once with a current Anthropic text model and `max_tokens <= 4`; print status, timing, error metadata/request id and usage only.
Agent 1 vote: APPROVE
Agent 1 reason: A successful `/messages` route would be useful for the first API-call launch path, and a failure gives provider evidence.
Agent 2 vote: APPROVE
Agent 2 reason: This isolates endpoint-specific routing without changing billing code or live data.
Agent 3 vote: APPROVE
Agent 3 reason: Approved with strict redaction and bounded spend.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run one bounded direct `/messages` inference diagnostic.
Status: APPROVED

---

Decision ID: DEC-FIX-LIVE-PAYMENT-MIGRATION-001
Decision title: Apply missing live payment USD quote columns
Decision type: Production DB migration approval
Related bug IDs: R-BUG-007, PAYMENT-LIVE-001
Evidence from reports: Live payment provider E2E was still blocked. Live IBAN init test failed because production DB lacks `payments.amount_usd` and related quote columns while the deployed code reads/writes those fields. Local migration `0005_payment_usd_quote_fields.sql` is idempotent and uses `ADD COLUMN IF NOT EXISTS`.
Files likely affected: Production PostgreSQL schema only; no source file edit.
Risk level: High
Design/template impact: None.
Security impact: No secrets printed; DB backup required before schema change.
Backend/API/billing impact: Enables live payment quote fields used by Shopier/IBAN/Cryptomus init/callback flows. No data deletion; additive columns only.
Proposed action: Take a PostgreSQL 14 backup, apply `0005_payment_usd_quote_fields.sql` equivalent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements on live DB, verify both `payments` and `pending_iban_payments` contain the new columns, then rerun safe IBAN init/admin approve/reject E2E with temporary data and cleanup.
Agent 1 vote: APPROVE
Agent 1 reason: Payment UI/API cannot be accepted while live init crashes on missing columns.
Agent 2 vote: APPROVE
Agent 2 reason: Additive idempotent migration matches current schema and is necessary for billing/payment correctness.
Agent 3 vote: APPROVE
Agent 3 reason: No visual impact; backup and no-secret constraints reduce release risk.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Backup live DB, apply missing payment columns, retest payment E2E.
Status: APPROVED

---

Decision ID: DEC-FIX-PAYMENT-UI-ROUNDING-001
Decision title: Align account top-up UI with backend USD-to-TL rounded payment quote
Decision type: Code/edit approval
Related bug IDs: R-BUG-007, PAYMENT-UI-001
Evidence from reports: User required USD balance top-up with Shopier/IBAN TL collection rounded upward to whole TL. Live IBAN E2E showed backend quote `$10`, `kur=47.279606`, `payableTL=473`, `creditTL=472.7961`, `roundingTL=0.2039`. Source inspection found `src/yapayzekalab/tab-account.jsx` still displaying decimal approximate TL and frontend-only `%5 komisyon`, while backend init receives only `amountUsd` and does not apply this commission.
Files likely affected: `src/api-docs-content.test.ts`, `src/yapayzekalab/tab-account.jsx`, reports.
Risk level: Medium
Design/template impact: None allowed; no CSS/class/layout/spacing/color/button/card/modal changes. Only existing text and calculated values inside the current layout may change.
Security impact: Reduces payment confusion and prevents frontend/backend amount mismatch.
Backend/API/billing impact: None to backend behavior; frontend display will mirror existing backend quote rules.
Proposed action: Add a failing source contract test proving the account top-up UI uses rounded whole-TL payment display and does not advertise unimplemented frontend commission. Then update `tab-account.jsx` calculation/copy only: no fee, `payableTL = Math.ceil(effectiveAmount * tlRate)`, `creditTL = effectiveAmount * tlRate`, and rounded TL text.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing payment amount must match the server-side payment quote before launch.
Agent 2 vote: APPROVE
Agent 2 reason: Backend already stores payable/credit/rounding fields; frontend must stop showing a different amount.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only because visual template/style is locked and the change is calculation/copy-only.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write RED test, patch calculation/copy only, run targeted test.
Status: APPROVED

---

Decision ID: DEC-CMD-PAYMENT-UI-ROUNDING-001
Decision title: Run regression after payment UI quote alignment
Decision type: Command/test approval
Related bug IDs: PAYMENT-UI-001, R-BUG-007
Evidence from reports: Frontend account payment display was changed in copy/calculation only. Because payment amounts are user-facing billing information, targeted and full regression plus scans/build are required before accepting or deploying.
Files likely affected: Build/QA artifacts only.
Risk level: Medium
Design/template impact: No source style changes expected; build/UAT/browser checks must confirm rejected template stays absent.
Security impact: Secret scan must remain clean; no provider/payment spending commands are allowed by this decision.
Backend/API/billing impact: No DB/provider calls; verifies source contracts and production bundle only.
Proposed action: Run `npm test -- src/api-docs-content.test.ts`, `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, and `npm run qa:uat`.
Agent 1 vote: APPROVE
Agent 1 reason: UAT/payment display cannot be accepted without regression and smoke evidence.
Agent 2 vote: APPROVE
Agent 2 reason: The commands do not spend money and verify billing-facing contract expectations.
Agent 3 vote: APPROVE
Agent 3 reason: Public and secret scans protect release and visual guard requirements.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run the listed local verification commands and record exact results.
Status: APPROVED

---

Decision ID: DEC-LIVE-DEPLOY-PAYMENT-UI-001
Decision title: Deploy payment UI quote alignment to real live service
Decision type: Deploy approval
Related bug IDs: PAYMENT-UI-001, R-BUG-007
Evidence from reports: Commit `ddee303` is pushed to GitHub. Local regression after payment UI quote alignment passed: targeted test 7/7, lint PASS, full tests 27 files / 116 tests, build PASS, public scan 0 hits, secret scan 0 hits, local UAT 10/10. Live active service target is `/opt/turkapiprojesi` / `turkapiprojesi.service`; generic deploy script default target is not safe for this service.
Files likely affected: Live `/opt/turkapiprojesi/dist`, live `package.json`, live `package-lock.json`, deploy backup metadata.
Risk level: Medium
Design/template impact: Source style unchanged; deploy must preserve restored old theme and reject template fingerprints.
Security impact: No secrets printed; no payment/provider calls in deploy. Rollback backup required.
Backend/API/billing impact: Frontend display only; no DB migration in this deploy.
Proposed action: Create live dist backup and rollback script, rsync current `dist/`, `package.json`, and `package-lock.json` to `/opt/turkapiprojesi`, run `npm ci --omit=dev`, restart `turkapiprojesi.service`, then run live smoke/UAT/bundle checks.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing payment quote display must reach live site after passing local UAT.
Agent 2 vote: APPROVE
Agent 2 reason: No billing backend behavior changes; deploy is frontend bundle only with rollback.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only with backup, rollback and rejected-template scan after deploy.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Perform rollbackable live deploy to `/opt/turkapiprojesi` and retest.
Status: APPROVED

---

Decision ID: DEC-CMD-LIVE-BILLING-RECHECK-001
Decision title: Recheck CloseRouter tiny text inference after live payment UI deploy
Decision type: Command/test approval
Related bug IDs: R-BUG-006, LIVE-BILLING-001
Evidence from reports: Successful funded billing remains the primary launch blocker. Previous direct CloseRouter account/catalog/balance checks passed but tiny inference returned upstream `502`. User authorized continued testing with cost cap and no image/video spend.
Files likely affected: None.
Risk level: Medium
Design/template impact: None.
Security impact: Provider key must be read only from live env and never printed. Response body must not contain secrets.
Backend/API/billing impact: Tiny direct provider call may spend negligible text tokens only if upstream succeeds. No DB mutation unless a later gateway funded-key acceptance is separately run.
Proposed action: From VPS env, call direct CloseRouter `/chat/completions` with max_tokens <= 4 on a small set of text models, stop on first success, print only status/error code/model and no authorization values.
Agent 1 vote: APPROVE
Agent 1 reason: A successful first API path cannot be accepted until upstream inference is rechecked.
Agent 2 vote: APPROVE
Agent 2 reason: Tiny direct provider check is safe within budget and tells whether gateway success billing can be attempted.
Agent 3 vote: APPROVE
Agent 3 reason: No secrets printed and no image/video/real payment spend.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run bounded direct CloseRouter text inference recheck.
Status: APPROVED

---

Decision ID: DEC-RETEST-PAYMENT-UI-ROUNDING-001
Decision title: Accept payment UI rounded quote retest
Decision type: Retest acceptance
Related bug IDs: PAYMENT-UI-001, R-BUG-007
Evidence from reports: `npm test -- src/api-docs-content.test.ts` PASS 7/7; `npm run lint` PASS; `npm test` PASS 27 files / 116 tests; `npm run build` PASS; `npm run scan:public` PASS 0 hits; `node scripts/scan-secrets.mjs` PASS 0 hits; `npm run qa:uat` PASS 10/10. Live deploy `manual-20260527T071659Z-ddee303` completed and live bundle contains `Bakiye USD`, `Tahsilat TL`, `Yuvarlama`, `yukarı tam liraya` while old `%5 komisyon`/`Komisyon %` strings are absent.
Files likely affected: `src/yapayzekalab/tab-account.jsx`, `src/api-docs-content.test.ts`, reports.
Risk level: Low after verification
Design/template impact: None; source diff did not touch style/layout/class/theme files and live old theme screenshot remains intact.
Security impact: Positive; frontend now avoids misleading payment amount copy.
Backend/API/billing impact: Backend behavior unchanged; frontend display matches backend quote fields.
Proposed action: Mark payment UI quote alignment accepted locally and live.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing payment amount display now matches server quote and UAT stayed green.
Agent 2 vote: APPROVE
Agent 2 reason: Billing backend was not changed and display now reflects existing payable/credit/rounding fields.
Agent 3 vote: APPROVE
Agent 3 reason: Visual lock and bundle scans stayed clean.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Keep release blocked only by successful inference billing and non-IBAN provider E2E.
Status: COMPLETED

---

Decision ID: DEC-RETEST-LIVE-BILLING-RECHECK-001
Decision title: Is successful live API billing unblocked after direct CloseRouter recheck?
Decision type: Retest acceptance
Related bug IDs: R-BUG-006, LIVE-BILLING-001
Evidence from reports: Direct CloseRouter `/credits` 200 and `/models/count` 200 still pass from VPS env. Tiny `chat/completions` recheck with max_tokens <= 4 timed out for `anthropic/claude-haiku-4.5`, `openai/gpt-5.4-mini`, `deepseek/deepseek-v4-pro`, `google/gemini-3.5-flash`, `moonshotai/kimi-k2.5`, and `qwen/qwen3.6-plus`.
Files likely affected: API/report files only.
Risk level: High for release
Design/template impact: None.
Security impact: No secrets printed; no image/video/payment spend.
Backend/API/billing impact: Successful gateway billing cannot be re-attempted while upstream inference times out.
Proposed action: Keep launch verdict blocked; require provider/upstream recovery before tiny funded gateway success test.
Agent 1 vote: REJECT
Agent 1 reason: Developer first successful API call remains unproven.
Agent 2 vote: REJECT
Agent 2 reason: Success `usage_records`, transaction, cost headers and balance decrement are still blocked.
Agent 3 vote: REJECT
Agent 3 reason: Release guard remains closed due external provider/inference failure.
Approval count: 0/3
Final decision: NOT ACCEPTED FOR RELEASE
Allowed next action: Fix provider/upstream inference outside this UI deploy, then rerun tiny funded gateway acceptance.
Status: COMPLETED

---

Decision ID: DEC-LIVE-DEPLOY-RESTORED-THEME-001
Decision title: Deploy restored approved theme to the real live service with corrected rollback
Decision type: Deploy approval
Related bug IDs: DESIGN-REGRESSION-001, R-BUG-009, DESIGN-CSS-001, UX-FAKE-LIVE-001
Evidence from reports: The restored approved theme, rejected-template guards, fake-live copy cleanup and Tailwind/template CSS removal passed local lint/tests/build/scans/UAT. Read-only VPS inspection confirmed the real live service is `turkapiprojesi.service` with `WorkingDirectory=/opt/turkapiprojesi`; `/opt/yapayzekalab` is not the active service. Existing preflight also showed `/opt/turkapiprojesi` is not a git checkout, so the generic git-based deploy script must not be run blindly. Existing rollback script path from the previous manual deploy is malformed and must be replaced for this deploy.
Files likely affected: Local `dist/` build artifacts, remote `/opt/turkapiprojesi/dist`, remote `/opt/turkapiprojesi/package.json`, remote `/opt/turkapiprojesi/package-lock.json`, remote `/opt/turkapiprojesi/.deploy/*`.
Risk level: High
Design/template impact: Intended live update of the restored approved theme only; no new redesign or template changes.
Security impact: Must not print or copy `.env.production`; must not print provider/payment/API secrets; must keep anonymous Admin hidden and separate admin password removed.
Backend/API/billing impact: Live service restart; no DB migration planned for this deploy; payment/provider billing tests remain separate gates.
Proposed action: Run fresh local predeploy verification, create a remote timestamped backup of current live `dist` and package files, generate a corrected rollback script that restores from that backup path, upload the freshly built local `dist` and package lockfiles to `/opt/turkapiprojesi`, fix ownership to `turkapi:turkapi`, restart `turkapiprojesi.service`, then run live smoke and browser/template checks. If smoke fails, run the corrected rollback script and record the failure.
Agent 1 vote: APPROVE
Agent 1 reason: The user-facing rejected template must be removed from live; deployment is acceptable only with post-deploy visual/UAT checks.
Agent 2 vote: APPROVE
Agent 2 reason: No schema migration is planned; route/build changes need live smoke, and rollback protects the active service.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only because this uses the real active service, avoids secrets, and includes corrected rollback before restart.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Execute fresh verification, then perform the corrected manual live deploy to `/opt/turkapiprojesi`.
Status: APPROVED

---

Decision ID: DEC-RETEST-LIVE-DEPLOY-RESTORED-THEME-001
Decision title: Accept live restored-theme deploy and template removal retest
Decision type: Retest acceptance
Related bug IDs: DESIGN-REGRESSION-001, DESIGN-CSS-001, UX-FAKE-LIVE-001, R-BUG-001, R-BUG-009
Evidence from reports: Fresh local verification passed (`lint`, 114 Vitest tests, build, public scan, secret scan, production audit, local UAT). Live deploy `manual-20260527T064341Z-6021b8e` completed on real service `turkapiprojesi.service`. Live smoke and live UAT passed; live `/v1` catalog endpoints returned JSON 200; unknown `/v1/*` returned JSON 404; authless gateway returned JSON 401; live bundle scan returned no rejected template/admin-password/fake-live hits; browser smoke showed old hero and anonymous Admin hidden.
Files likely affected: Remote `/opt/turkapiprojesi/dist`, remote package files, report files.
Risk level: Medium
Design/template impact: Positive; live restored approved shell is active and rejected template is absent.
Security impact: No secrets printed or committed; anonymous admin exposure check passed; logged-in standard Chrome admin recheck remains blocked by unavailable Chrome automation.
Backend/API/billing impact: Public and authless gateway smoke passed; funded billing/payment E2E still not accepted.
Proposed action: Mark the deploy/theme retest accepted while keeping final release blocked by successful funded billing and payment provider E2E.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing live theme is restored, template is absent, live UAT passed.
Agent 2 vote: APPROVE_WITH_BILLING_GAP
Agent 2 reason: API catalog/authless behavior passed live, but successful funded billing remains a release blocker.
Agent 3 vote: APPROVE_WITH_RELEASE_BLOCKER
Agent 3 reason: Visual/security guard passed for anonymous/live bundle; final release must remain blocked until billing/payment evidence exists.
Approval count: 3/3
Final decision: APPROVED FOR DEPLOY RETEST ONLY
Allowed next action: Continue billing/payment/admin-session validation; do not mark production ready.
Status: COMPLETED

---

Decision ID: DEC-CMD-LIVE-PREDEPLOY-001
Decision title: Run fresh local predeploy verification before live restore deploy
Decision type: Command/test approval
Related bug IDs: DESIGN-REGRESSION-001, R-BUG-009, DESIGN-CSS-001, UX-FAKE-LIVE-001
Evidence from reports: Verification-before-completion requires fresh evidence before deploy/readiness claims.
Files likely affected: `dist/` and QA artifacts may be regenerated.
Risk level: Low
Design/template impact: Build verifies restored theme bundle; no source styling change.
Security impact: Secret/public scans required before upload.
Backend/API/billing impact: Local tests only; no paid provider or live DB mutation.
Proposed action: Run `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, `npm audit --omit=dev --json`, and `npm run qa:uat`.
Agent 1 vote: APPROVE
Agent 1 reason: Required for current local evidence before deploy.
Agent 2 vote: APPROVE
Agent 2 reason: Confirms backend/API/payment guards without mutating production data.
Agent 3 vote: APPROVE
Agent 3 reason: Public/secret scans are mandatory before upload.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run the listed local verification commands.
Status: APPROVED

---

Decision ID: DEC-FIX-SEC-DEPS-001
Decision title: Upgrade vulnerable production/dev dependencies without force fixing
Decision type: Dependency/security fix approval
Related bug IDs: SECURITY-DEPS-001
Evidence from reports: `npm audit --json` returned 1 high (`drizzle-orm <0.45.2`, SQL injection via escaped SQL identifiers) and 5 moderate advisories (`uuid <11.1.1`, old `drizzle-kit`/nested `esbuild`). `npm audit fix --force` would apply breaking changes blindly, so controlled explicit upgrades are safer.
Files likely affected: `package.json`, `package-lock.json`, maybe TypeScript compile fixes if APIs changed.
Risk level: Medium
Design/template impact: None.
Security impact: Positive; removes known dependency advisories if compatible.
Backend/API/billing impact: Medium; Drizzle ORM/kit affect DB query and migration tooling, so full test/build/migrate smoke must pass.
Proposed action: Explicitly upgrade `drizzle-orm` to `^0.45.2`, `drizzle-kit` to `^0.31.10`, and `uuid` to `^14.0.0`; remove obsolete `@types/uuid` if no longer needed; do not run `npm audit fix --force`. Then run lint, tests, build, audit, secret/public scans, and local UAT.
Agent 1 vote: APPROVE
Agent 1 reason: Launch readiness cannot ignore a high dependency advisory.
Agent 2 vote: APPROVE
Agent 2 reason: Controlled explicit upgrades plus full backend regression are safer than force fixing.
Agent 3 vote: APPROVE
Agent 3 reason: Security release guard requires zero known high advisories before launch approval.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run controlled npm dependency updates and full verification.
Status: APPROVED

---

Decision ID: DEC-RETEST-SEC-DEPS-001
Decision title: Accept production dependency security retest
Decision type: Retest acceptance
Related bug IDs: SECURITY-DEPS-001
Evidence from reports: Initial `npm audit --json` returned 1 high and 5 moderate. After controlled upgrades, `npm audit --omit=dev --json` returned 0 vulnerabilities. `npm run lint`, `npm test` (27 files / 114 tests), `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, and `npm run qa:uat` all passed.
Files likely affected: `package.json`, `package-lock.json`, reports.
Risk level: Low after retest
Design/template impact: None.
Security impact: Positive; production high advisory removed.
Backend/API/billing impact: Drizzle runtime upgraded; regression tests/build passed.
Proposed action: Mark production dependency security retest accepted; keep dev-only moderate `drizzle-kit` advisories as follow-up, not release approval.
Agent 1 vote: APPROVE
Agent 1 reason: UAT and full tests stayed green after dependency upgrade.
Agent 2 vote: APPROVE
Agent 2 reason: Drizzle upgrade did not break backend tests/build and production audit is clean.
Agent 3 vote: APPROVE_WITH_DEV_FOLLOWUP
Agent 3 reason: High production advisory is fixed; remaining moderate advisories are dev-only and should be tracked.
Approval count: 3/3
Final decision: APPROVED FOR PRODUCTION RUNTIME
Allowed next action: Continue live billing/payment/OAuth/deploy gating.
Status: COMPLETED

---

Decision ID: DEC-FIX-DESIGN-CSS-001
Decision title: Remove leftover rejected template global CSS import
Decision type: Code/edit approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports: User ordered the rejected template code removed everywhere. Source inspection found `src/main.tsx` still imports `src/index.css`, and that file contains Tailwind/Inter/Space Grotesk template globals that are separate from the approved old theme `src/yapayzekalab/tokens.css`.
Files likely affected: `src/rejected-template-guard.test.ts`, `src/main.tsx`, `src/index.css`, reports.
Risk level: Medium
Design/template impact: Intended preservation of old theme by removing conflicting leftover template CSS. No new colors/layout/classes are introduced.
Security impact: None.
Backend/API/billing impact: None.
Proposed action: Add a failing guard for leftover global template CSS/import, then remove the `./index.css` import and delete the unused template CSS file. The approved theme keeps using `src/yapayzekalab/tokens.css`.
Agent 1 vote: APPROVE
Agent 1 reason: Conflicting global CSS can cause the rejected template look to reappear or visually drift.
Agent 2 vote: APPROVE
Agent 2 reason: Frontend CSS cleanup has no backend/API/billing impact and is covered by build/UAT.
Agent 3 vote: APPROVE
Agent 3 reason: This directly enforces the visual lock and removes leftover template code.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write failing guard, verify RED, remove import/file, rerun target and full regression.
Status: IN_PROGRESS

---

Decision ID: DEC-RETEST-DESIGN-CSS-001
Decision title: Accept leftover template CSS removal retest
Decision type: Retest acceptance
Related bug IDs: DESIGN-REGRESSION-001, DESIGN-CSS-001
Evidence from reports: Guard test first failed on `./index.css`, `tailwindcss`, Space Grotesk/JetBrains template globals, then failed on Tailwind dependency/config wiring. After removing the import, deleting `src/index.css`, and uninstalling Tailwind wiring, `npm test -- src/rejected-template-guard.test.ts` passed 7/7; full `npm test` passed 27 files / 114 tests; lint/build/public scan/secret scan/UAT passed; Playwright smoke confirmed template CSS fingerprints absent.
Files likely affected: `src/rejected-template-guard.test.ts`, `src/main.tsx`, `src/index.css`, `vite.config.ts`, `package.json`, `package-lock.json`, reports.
Risk level: Low after retest
Design/template impact: Positive; removes conflicting template CSS/dependency wiring and leaves old `tokens.css` active.
Security impact: None.
Backend/API/billing impact: None.
Proposed action: Mark local CSS/template cleanup accepted and keep live deploy gated behind Git backup plus live smoke.
Agent 1 vote: APPROVE
Agent 1 reason: UI smoke and UAT stayed green after the CSS cleanup.
Agent 2 vote: APPROVE
Agent 2 reason: No backend/API/billing behavior changed.
Agent 3 vote: APPROVE
Agent 3 reason: Rejected template CSS is now blocked by source guard and absent in browser CSS.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Prepare Git backup and live deploy plan only after confirming no secrets and no unrelated destructive changes.
Status: COMPLETED

---

Decision ID: DEC-FIX-DESIGN-001
Decision title: Remove rejected frontend template fingerprints and add a no-return guard
Decision type: Code edit approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports: User explicitly rejected the current template-like landing. `DESIGN_REGRESSION_ACCOUNTABILITY.md` identifies `src/App.tsx` as carrying the rejected visual/copy state; grep confirmed active app strings and starter package identity.
Files likely affected: `src/App.tsx`, `src/rejected-template-guard.test.ts`, `scripts/scan-public-bundle.mjs`, `package.json`, `package-lock.json`
Risk level: Medium
Design/template impact: Intended removal of rejected template copy only; no CSS, Tailwind classes, layout structure, colors, spacing, cards, modals, or responsive breakpoints changed.
Security impact: None; no auth/payment/provider secrets touched.
Backend/API/billing impact: None; API examples, admin owner gate, and payment/backend calls remain unchanged.
Proposed action: Replace rejected landing copy with direct product copy, remove `react-example` starter identity, add a Vitest guard and public-bundle scan needles so rejected template fingerprints cannot return.
Agent 1 vote: APPROVE
Agent 1 reason: The user-facing rejected slogans must be removed and guarded by tests; replacing the entire app without a verified approved source would risk breaking UAT.
Agent 2 vote: APPROVE
Agent 2 reason: Text-only source changes preserve admin, API key, payment, and billing logic while preventing frontend regression.
Agent 3 vote: APPROVE
Agent 3 reason: This avoids importing the unrelated `/Users/ufuk/Desktop/yapayzekalab` scientific template and protects against future template reintroduction.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Edit the approved files and run targeted verification.
Status: IMPLEMENTED

---

Decision ID: DEC-CMD-DESIGN-001
Decision title: Run template guard, typecheck, build, and public scan
Decision type: Command approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports: The rejected template reached live because no visual/source guard stopped it before deploy.
Files likely affected: Build command may update `dist/`; tests should not alter source.
Risk level: Low
Design/template impact: Build output only; source visual classes/layout already checked.
Security impact: Public scan checks for banned secrets/pricing internals and rejected template text.
Backend/API/billing impact: No provider/payment/API spend; no DB migration.
Proposed action: Run `npm test -- src/rejected-template-guard.test.ts src/admin-single-owner-contract.test.ts src/api-docs-content.test.ts`, `npm run lint`, `npm run build`, and `npm run scan:public`.
Agent 1 vote: APPROVE
Agent 1 reason: Targeted regression tests must prove the bad template is blocked and core UI contracts remain.
Agent 2 vote: APPROVE
Agent 2 reason: Typecheck/build verifies the frontend change did not break API/admin integration at compile level.
Agent 3 vote: APPROVE
Agent 3 reason: Public bundle scan is required before any future deploy.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Execute verification commands.
Status: APPROVED

---

Decision ID: DEC-RETEST-DESIGN-001
Decision title: Accept rejected template removal retest
Decision type: Retest approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports: `src/yapayzekalab/` removed; rejected fingerprints absent from active source and public bundle; template guard, full tests, lint, build, public scan, secret scan, and local UAT smoke passed.
Files likely affected: `src/App.tsx`, `index.html`, `package.json`, `package-lock.json`, `scripts/scan-public-bundle.mjs`, `src/rejected-template-guard.test.ts`, reports.
Risk level: Low for local acceptance; live deploy still pending.
Design/template impact: Rejected template source deleted; active production app style/classes were not replaced by another template.
Security impact: Fake API-key-looking examples from rejected module deleted; secret scan clean.
Backend/API/billing impact: Admin owner, API docs, payment/billing contract tests remain green; no backend files changed.
Proposed action: Mark local template removal accepted and keep live deploy gated behind separate approval/screenshot smoke.
Agent 1 vote: APPROVE
Agent 1 reason: UAT smoke 10/10 and source guard prove the rejected copy/module is gone locally.
Agent 2 vote: APPROVE
Agent 2 reason: Full Vitest and build prove no known backend/API/admin contract broke from this cleanup.
Agent 3 vote: APPROVE
Agent 3 reason: Public bundle scan and secret scan are clean; no live deploy was performed without a new gate.
Approval count: 3/3
Final decision: APPROVED_LOCAL
Allowed next action: Prepare Git backup or deploy only after explicit live deploy gate.
Status: COMPLETED

---

Decision ID: DEC-FIX-DESIGN-002
Decision title: Delete untracked modular rejected template directory and restore tracked app entry
Decision type: Code cleanup approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports: `src/yapayzekalab/` contains the rejected live-template fingerprints: generated tweak panel, mock data, fake `yzk_live_*` examples, `Türkiye'nin Yapay Zekâ API Geçidi`, and cost-calculator copy. `src/App.tsx` was unexpectedly replaced with a wrapper importing that directory, causing build failure.
Files likely affected: `src/App.tsx`, `src/yapayzekalab/*`
Risk level: Medium
Design/template impact: Removes the rejected template implementation entirely; keeps the tracked production app source as the functional base.
Security impact: Deletes fake API-key-looking examples and mock admin/token UI from the rejected directory.
Backend/API/billing impact: Keeps existing tracked API/admin/payment integrations; no backend files changed.
Proposed action: Remove `src/yapayzekalab/`, restore `src/App.tsx` from the tracked production source, then reapply text-only rejected-fingerprint cleanup and guard tests.
Agent 1 vote: APPROVE
Agent 1 reason: The untracked modular directory is exactly the rejected template and must not remain available for future imports.
Agent 2 vote: APPROVE
Agent 2 reason: Restoring tracked App avoids breaking existing backend/payment/admin wiring while deleting the bad template module.
Agent 3 vote: APPROVE
Agent 3 reason: Deleting the rejected template source is required to prevent accidental redeploy; no secrets are exposed.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Delete `src/yapayzekalab/`, restore tracked `src/App.tsx`, reapply guard-safe copy edits.
Status: APPROVED

---

Decision ID: DEC-LIVE-BILLING-TEST-001
Decision title: Create isolated live test API keys to verify billing headers, balance decrement, and low-balance behavior
Decision type: Live test data approval
Related bug IDs: R-BUG-006
Evidence from reports: Final QA and billing reports mark funded `yzk_live_*`, low-balance, cost headers, balance decrement, and `usage_records` as unverified launch blockers.
Files likely affected: Live database test rows only; no source file edit. Test keys must not be printed or committed.
Risk level: Medium
Design/template impact: None.
Security impact: Full raw test keys must remain in remote temp files only and be revoked/cleaned after testing. No real user data should be mutated.
Backend/API/billing impact: Creates isolated `qa-live-billing-*` users/API keys with small test balances, performs tiny text API calls, verifies ledger/usage, then revokes test keys.
Proposed action: Use the live service environment to create test-only funded and zero-balance users/keys, run bounded text API tests, record only masked evidence, and revoke keys after retest.
Agent 1 vote: APPROVE
Agent 1 reason: This is the missing real developer flow evidence and uses no UI/design changes.
Agent 2 vote: APPROVE
Agent 2 reason: Isolated test rows allow real billing verification without touching production customers or payments.
Agent 3 vote: APPROVE
Agent 3 reason: Acceptable only with secret redaction, no image/video spend, no real payment, and cleanup/revoke after use.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run live billing test setup and bounded text API checks.
Status: APPROVED

---

Decision ID: DEC-ADMIN-LIVE-STALE-001
Decision title: Fix live admin password screen by deploying current single-owner Google admin build
Decision type: Live repair/deploy gate
Related bug IDs: R-BUG-008, ADMIN-GOOGLE-001
Evidence from reports: Chrome UAT on 2026-05-27 completed Google OAuth with `cix.crazy666@gmail.com`; Admin nav became visible, but live Admin tab still showed a separate admin password form. Local `src/App.tsx` already gates Admin on `isAdminUser`, `src/admin-single-owner-contract.test.ts` asserts no frontend `/api/admin/login`, and backend `/api/admin/login` returns 410.
Files likely affected: No source code change required; deploy uses current branch artifact. Reports may be updated with live evidence.
Risk level: Medium
Design/template impact: None expected; no CSS/classes/layout/template changes authorized.
Security impact: Positive; removes stale live password gate and keeps admin restricted to the allowlisted Google user token.
Backend/API/billing impact: Low; deploy must preserve existing backend auth and payment/billing behavior. No migrations expected for this specific repair.
Proposed action: Run local verification gates, confirm git backup exists, deploy current branch to the live target, then retest Admin in standard Chrome without requesting an admin password.
Agent 1 vote: APPROVE
Agent 1 reason: User cannot access Admin because live UI is stale; Chrome evidence reproduces the problem.
Agent 2 vote: APPROVE
Agent 2 reason: Local backend/frontend contracts already match the desired single-owner Google admin flow; deploy is the needed repair.
Agent 3 vote: APPROVE
Agent 3 reason: Safe only if visual design remains unchanged, secrets are not printed, and rollbackable git backup/deploy gate is preserved.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run local gates and live deploy preflight; deploy only after gates pass.
Status: APPROVED

---

Decision ID: DEC-RETEST-ADMIN-GOOGLE-001
Decision title: Is the live Google-admin/no-admin-password fix accepted?
Decision type: Retest acceptance
Related bug IDs: R-BUG-008, ADMIN-GOOGLE-001
Evidence from reports: Standard Chrome retest after live deploy showed anonymous Admin hidden, Google OAuth with `cix.crazy666@gmail.com` completed, Admin button appeared after login, and clicking Admin opened `YZ Admin` / `Gösterge Paneli` directly without a separate admin password form. Live frontend bundle does not contain stale admin password strings. Live `qa:uat` passed 10/10.
Files likely affected: `CHROME_PROVIDER_UAT_EXECUTION_REPORT.md`
Risk level: Low for accepted fix; remaining payment/billing release risk remains High.
Design/template impact: None observed; no CSS/layout/theme changes were made.
Security impact: Positive; live admin access now follows allowlisted Google user token.
Backend/API/billing impact: No billing/payment mutation was performed; live service health remained 200 with DB/kur/CloseRouter checks ok.
Proposed action: Mark the admin Google-only live fix accepted, but keep full launch blocked until funded billing and payment E2E pass.
Agent 1 vote: APPROVE
Agent 1 reason: Browser evidence matches the user requirement: admin visible only after admin Google login and no admin password prompt.
Agent 2 vote: APPROVE
Agent 2 reason: Backend stayed healthy after deploy and admin auth remains email/token based.
Agent 3 vote: APPROVE
Agent 3 reason: Visual design was preserved and stale password strings are absent from live frontend bundle.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Continue remaining billing/payment/provider tests; do not mark release ready yet.
Status: COMPLETED

---

Decision ID: DEC-AGENT-TEAM-001
Decision title: Continue with role-locked three-agent governance after external agent spawn limit
Decision type: Agent coordination / risk-control fallback
Related bug IDs: R-BUG-002, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009
Evidence from reports: User requires three-agent risk control; current tool calls returned `agent thread limit reached`; Ruflo fallback timed out.
Files likely affected: `AGENT_REPAIR_CHAT_LOG.md`, `AGENT_REPAIR_DECISIONS.md`, final reports only.
Risk level: Medium
Design/template impact: None.
Security impact: Prevents fake external-agent evidence; keeps no-secret and no-provider-call constraints active.
Backend/API/billing impact: No backend mutation; preserves blocked status for credential-dependent billing/payment verification.
Proposed action: Use the three voting roles inside this session as a transparent fallback until external subagent capacity is available.
Agent 1 vote: APPROVE
Agent 1 reason: QA evidence should continue instead of stalling, but external subagent failure must be disclosed.
Agent 2 vote: APPROVE
Agent 2 reason: Backend/billing decisions can remain explicitly voted while credential-blocked flows stay blocked.
Agent 3 vote: APPROVE
Agent 3 reason: This is safer than pretending agents were spawned; visual/security/deploy gates remain enforceable.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Continue three-agent role governance locally and record all limitations.
Status: APPROVED

---

Decision ID: DEC-CHROME-UAT-001
Decision title: Chrome provider/OAuth/admin UAT blocked by missing native host
Decision type: Test execution decision
Related bug IDs: R-BUG-003, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009
Evidence from reports: Chrome running and extension installed/enabled, but Codex Chrome native host manifest is missing; Chrome extension cannot connect.
Files likely affected: `CHROME_PROVIDER_UAT_EXECUTION_REPORT.md`
Risk level: High for launch evidence
Design/template impact: None.
Security impact: Avoids unsafe credential/cookie inspection and avoids self-installing native host.
Backend/API/billing impact: Authenticated UI/provider flows remain unverified; local unit/contract tests can still run.
Proposed action: Mark Chrome UAT blocked, run safe non-Chrome payment/auth/catalog tests, and require Chrome plugin/native host reinstall before authenticated browser UAT.
Agent 1 vote: NEEDS_MORE_EVIDENCE
Agent 1 reason: User-facing OAuth/admin/payment flows cannot be proven without a working Chrome connection.
Agent 2 vote: NEEDS_MORE_EVIDENCE
Agent 2 reason: Backend contracts can be tested, but real billing/payment DB effects require valid session/credentials.
Agent 3 vote: APPROVE
Agent 3 reason: Blocking Chrome UAT is safer than bypassing extension security or handling credentials unsafely.
Approval count: 1/3 for release, 3/3 for blocking Chrome UAT until fixed
Final decision: CHROME_UAT_BLOCKED
Allowed next action: Continue safe local/API tests; ask for Chrome plugin/native host reinstall before Chrome UAT.
Status: COMPLETED

---

Decision ID: DEC-GITHUB-BACKUP-PLAN-001
Decision title: Backup provider/OAuth/admin UAT plan
Decision type: Backup approval
Related bug IDs: R-BUG-003, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009
Evidence from reports: New plan documents the remaining Chrome/provider/OAuth/admin execution path and should be preserved before later live testing.
Files likely affected: Git index/commit history only.
Risk level: Low
Design/template impact: None.
Security impact: Backup allowed only after secret scan passes; plan contains no credentials.
Backend/API/billing impact: None; plan-only commit, no runtime mutation.
Proposed action: Run secret scan, stage `PROVIDER_OAUTH_ADMIN_UAT_PLAN.md` and updated decision log, commit, push current branch.
Agent 1 vote: APPROVE
Agent 1 reason: The remaining UAT plan should be checkpointed before execution.
Agent 2 vote: APPROVE
Agent 2 reason: Plan-only backup does not affect billing/runtime.
Agent 3 vote: APPROVE
Agent 3 reason: Safe if secret scan is clean and no deploy occurs.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Secret scan, commit and push plan checkpoint.
Status: APPROVED

---

Decision ID: DEC-CMD-FINAL-VERIFY-001
Decision title: Run final whitespace and secret checks before backup
Decision type: Command approval / final verification
Related bug IDs: R-BUG-006, R-BUG-007, R-BUG-009
Evidence from reports: User shared provider keys earlier; all new reports/source changes must be scanned before backup.
Files likely affected: None.
Risk level: Low
Design/template impact: None.
Security impact: Confirms no leaked secrets in source/report files.
Backend/API/billing impact: No DB/payment/provider effect.
Proposed action: Run `git diff --check` and `node scripts/scan-secrets.mjs`.
Agent 1 vote: APPROVE
Agent 1 reason: Final report/backup must not contain hidden formatting or credential mistakes.
Agent 2 vote: APPROVE
Agent 2 reason: Checks are read-only and do not touch billing data.
Agent 3 vote: APPROVE
Agent 3 reason: Secret scan is mandatory before GitHub backup.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run final diff and secret checks.
Status: APPROVED

---

Decision ID: DEC-GITHUB-BACKUP-001
Decision title: Create GitHub backup checkpoint for safe repair changes
Decision type: Backup approval
Related bug IDs: R-BUG-001, R-BUG-004, R-BUG-005, R-BUG-009
Evidence from reports: Local repairs and required report files are uncommitted; deploy gate requires rollbackable GitHub backup first.
Files likely affected: Git index/commit history on current branch only.
Risk level: Medium
Design/template impact: No further source edits; commit preserves current state.
Security impact: Allowed only after secret scan passes; do not stage credentials, build artifacts, or unrelated files.
Backend/API/billing impact: No runtime, DB, payment, or provider effect; backup only.
Proposed action: Stage intentional source/test/report files, commit a checkpoint, and push current branch.
Agent 1 vote: APPROVE
Agent 1 reason: QA evidence and repair files need a rollbackable checkpoint.
Agent 2 vote: APPROVE
Agent 2 reason: Backend catalog fix should be backed up before any later deploy work.
Agent 3 vote: APPROVE
Agent 3 reason: Backup is safe if secret scan passes and no deploy is performed.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Commit/push backup after final verification passes.
Status: APPROVED_PENDING_VERIFICATION

---

Decision ID: DEC-PLAN-PROVIDER-OAUTH-ADMIN-UAT-001
Decision title: Plan Chrome-based Shopier/Cryptomus/OAuth/Admin UAT execution
Decision type: Test planning approval
Related bug IDs: R-BUG-003, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009
Evidence from reports: Remaining blockers are credential/session-dependent: funded API billing, low-balance behavior, Shopier/Cryptomus E2E, Google OAuth callback, admin browser UAT, and live deploy drift.
Files likely affected: `PROVIDER_OAUTH_ADMIN_UAT_PLAN.md`
Risk level: Medium
Design/template impact: None; plan-only, no UI/style source changes.
Security impact: Plan requires Chrome/manual login handling, no credential storage, no secret printing, rotated provider credentials only.
Backend/API/billing impact: Plan covers payment/billing/admin tests but does not mutate runtime by itself.
Proposed action: Create a concrete Chrome-based execution plan with three-agent checkpoints and evidence requirements.
Agent 1 vote: APPROVE
Agent 1 reason: The plan closes the exact UAT gaps: OAuth, admin browser, payment UI/history, and user-visible recovery.
Agent 2 vote: APPROVE
Agent 2 reason: The plan ties every UI/provider action to backend evidence in `payments`, `transactions`, `usage_records`, and balance.
Agent 3 vote: APPROVE
Agent 3 reason: The plan preserves visual lock, blocks real-money tests, and requires secret rotation/no logging.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write `PROVIDER_OAUTH_ADMIN_UAT_PLAN.md`.
Status: APPROVED

---

Decision ID: DEC-CMD-RESOURCE-001
Decision title: Stop local dev server and PostgreSQL container after test run
Decision type: Command approval / resource cleanup
Related bug IDs: R-BUG-002
Evidence from reports: Long-running local QA left dev server and Docker DB active; user requested system should stay light and stable.
Files likely affected: None.
Risk level: Low
Design/template impact: None.
Security impact: Reduces accidental local exposure; no secrets printed.
Backend/API/billing impact: Stops local runtime only; no migration, no payment/provider call, no data deletion command.
Proposed action: Send interrupt to the local dev server session and stop the PostgreSQL compose service.
Agent 1 vote: APPROVE
Agent 1 reason: Site testing phase is complete; keeping browser/dev runtime open is unnecessary load.
Agent 2 vote: APPROVE
Agent 2 reason: Stopping services does not alter source code or billing state; it protects local resources.
Agent 3 vote: APPROVE
Agent 3 reason: Resource cleanup is safer before backup/closeout.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Stop dev server session and `docker compose stop postgres`.
Status: APPROVED

---

Decision ID: DEC-FIX-001
Decision title: Add public `/v1` catalog endpoints without changing authenticated gateway behavior
Decision type: Code edit approval
Related bug IDs: R-BUG-001
Evidence from reports: `API_TEST_REPORT.md`, `BACKEND_TEST_REPORT.md`, `BUG_LIST.md` and `LAUNCH_READINESS_REPORT.md` show `GET /v1/models`, `/v1/providers`, `/v1/models/count` returning 404 while unknown `/v1/*` JSON 404 and authenticated POST gateway behavior must remain unchanged.
Files likely affected: `src/server/routes/v1-catalog.ts`, `src/server/routes/v1-catalog.test.ts`, `src/server/index.ts`, `FIX_LOG.md`, `RETEST_LOG.md`
Risk level: Medium
Design/template impact: None; backend-only route and test.
Security impact: Public catalog must not expose upstream secrets, API keys, internal URLs, routing weights, DB credentials or health internals.
Backend/API/billing impact: Adds no-auth read-only catalog routes before `apiKeyAuth`; does not alter `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, images, videos, billing, API key auth or usage deduction.
Proposed action: First add a failing Vitest contract for public catalog payload, then implement a minimal read-only router and mount it before the authenticated proxy route.
Agent 1 vote: APPROVE
Agent 1 reason: Developer onboarding and docs/UAT need model catalog endpoints; targeted tests can verify behavior without browser or design change.
Agent 2 vote: APPROVE
Agent 2 reason: This is isolated from billing and provider calls; public catalog can be generated from `MASTER_MODELS` without DB writes or provider spend.
Agent 3 vote: APPROVE
Agent 3 reason: Backend-only read endpoint is acceptable if response is sanitized and unknown `/v1/*` JSON 404 remains.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Add failing test for public `/v1` catalog response helpers, then run only the approved targeted test.
Status: APPROVED

---

Decision ID: DEC-RETEST-002
Decision title: Accept local regression retest for R-BUG-001 after agent-requested changes
Decision type: Retest approval
Related bug IDs: R-BUG-001
Evidence from reports: Backend and security agents required removal of raw provider economics, preserving `FIX_LOG.md`, and route/auth regression evidence.
Files likely affected: `src/server/routes/v1-catalog.ts`, `src/server/routes/v1-catalog.test.ts`, `src/server/index.ts`, `FIX_LOG.md`, `RETEST_LOG.md`
Risk level: Medium
Design/template impact: None; no frontend/style/template files changed.
Security impact: Public catalog no longer serializes raw provider fields; public and source scans passed with zero hits.
Backend/API/billing impact: Local tests pass; route smoke proves catalog 200, unknown 404 and proxy 401 separation in a local Express harness. Live DB-backed route smoke remains pending.
Proposed action: Mark R-BUG-001 fixed locally and keep live smoke/deploy as pending.
Agent 1 vote: APPROVE
Agent 1 reason: Added route smoke and full regression satisfy local UAT-risk control for this specific bug.
Agent 2 vote: APPROVE
Agent 2 reason: Customer-facing computed pricing and enabled filtering address the billing drift objection without changing charge logic.
Agent 3 vote: APPROVE
Agent 3 reason: Audit history restored, no visual files touched, scans are clean.
Approval count: 3/3
Final decision: APPROVED LOCAL FIX
Allowed next action: Create final repair summaries and leave remaining blockers explicit.
Status: COMPLETED

---

Decision ID: DEC-FINAL-REPAIR-RELEASE-001
Decision title: After current repairs, is YapayZekaLab ready for real users without changing existing site design?
Decision type: Final repair release vote
Related bug IDs: R-BUG-001, R-BUG-002, R-BUG-003, R-BUG-004, R-BUG-005, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009, R-BUG-010
Evidence from reports: R-BUG-001 fixed locally; R-BUG-006 funded billing, R-BUG-007 payment provider E2E, R-BUG-003 real Google callback, R-BUG-009 live deploy retest remain unresolved.
Files likely affected: Reports only.
Risk level: High for launch.
Design/template impact: No design changes made.
Security impact: Secret scans passed locally, but payment/OAuth/live admin verification remains incomplete.
Backend/API/billing impact: Public catalog local fixed; real usage billing and payment provider flows still not validated.
Proposed action: Do not approve production launch yet; continue next phases only after credentials/live deploy approval.
Agent 1 vote: REJECT
Agent 1 reason: User onboarding and live UAT are not complete: Google callback, docs/video content phase and live smoke remain open.
Agent 2 vote: REJECT
Agent 2 reason: Successful funded API call, billing headers, balance decrement, usage_records, and payment provider E2E are still blocked.
Agent 3 vote: REJECT
Agent 3 reason: Release guard cannot approve with OAuth/payment/admin/live deploy verification missing, even though design was preserved.
Approval count: 0/3
Final decision: NOT READY — API/BILLING/BALANCE BLOCKERS
Allowed next action: Continue phased repairs; do not deploy/launch without separate approval and backup.
Status: COMPLETED

---

Decision ID: DEC-CMD-006
Decision title: Run source secret scan after repair docs and backend route change
Decision type: Command approval
Related bug IDs: R-BUG-001
Evidence from reports: User-provided provider keys are considered leaked and must not be written to files; previous QA requires secret scan before completion.
Files likely affected: None by command.
Risk level: Low
Design/template impact: None
Security impact: Positive; checks tracked source files for accidental secret patterns.
Backend/API/billing impact: No DB, provider, payment, or network calls expected.
Proposed action: Run `node scripts/scan-secrets.mjs`.
Agent 1 vote: APPROVE
Agent 1 reason: Secret scan is a required release guard.
Agent 2 vote: APPROVE
Agent 2 reason: It does not modify backend state or call providers.
Agent 3 vote: APPROVE
Agent 3 reason: Needed because user previously pasted real-looking API keys in chat.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `node scripts/scan-secrets.mjs`.
Status: APPROVED

---

Decision ID: DEC-FIX-001A
Decision title: Adjust public `/v1` catalog to avoid raw provider economics and reflect override-aware customer catalog
Decision type: Code edit approval
Related bug IDs: R-BUG-001
Evidence from reports: Backend/Billing risk agent found that `v1-catalog.ts` exposed prices derived from raw provider cost fields and ignored DB model overrides, while existing billing/API model routes compute customer-facing pricing through config and overrides.
Files likely affected: `src/server/routes/v1-catalog.ts`, `src/server/routes/v1-catalog.test.ts`, `RETEST_LOG.md`, `FIX_LOG.md`
Risk level: Medium
Design/template impact: None; backend-only.
Security impact: Reduces public leakage risk by removing raw provider economics from catalog payload.
Backend/API/billing impact: Public catalog read path will use the same pricing config/override mapping pattern as `/api/models`; authenticated proxy and billing mutations remain unchanged.
Proposed action: Change public catalog builder to accept catalog entries with computed customer pricing and enabled state, have route load pricing config and model overrides, and add tests that raw provider price fields are absent.
Agent 1 vote: APPROVE
Agent 1 reason: Public docs/model catalog should match user-facing availability and pricing to avoid UAT confusion.
Agent 2 vote: APPROVE
Agent 2 reason: This addresses billing drift without touching chargeUsage or balance logic.
Agent 3 vote: APPROVE
Agent 3 reason: Removing raw provider economics lowers release/security risk and keeps visual design untouched.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Patch `v1-catalog.ts` and tests.
Status: APPROVED

---

Decision ID: DEC-CMD-005
Decision title: Run public bundle scan after build
Decision type: Command approval
Related bug IDs: R-BUG-001, R-BUG-010
Evidence from reports: Security/readiness reports require secret/static public scan before fixed/release claims.
Files likely affected: None by command.
Risk level: Low
Design/template impact: None
Security impact: Positive; scans built public assets for accidental secret exposure.
Backend/API/billing impact: No DB, provider, payment, or network calls expected.
Proposed action: Run `npm run scan:public`.
Agent 1 vote: APPROVE
Agent 1 reason: Public bundle scan is part of existing QA gate.
Agent 2 vote: APPROVE
Agent 2 reason: It does not touch backend state and helps catch accidental leakage.
Agent 3 vote: APPROVE
Agent 3 reason: Required security guard before closeout.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `npm run scan:public`.
Status: APPROVED

---

Decision ID: DEC-RETEST-001
Decision title: Accept targeted retest for R-BUG-001 public catalog helper contract
Decision type: Retest approval
Related bug IDs: R-BUG-001
Evidence from reports: Original reports showed `/v1` catalog missing; new targeted test validates sanitized catalog response builders.
Files likely affected: `src/server/routes/v1-catalog.ts`, `src/server/routes/v1-catalog.test.ts`, `src/server/index.ts`
Risk level: Medium
Design/template impact: None; backend-only.
Security impact: Sanitization test checks for common secret/internal strings.
Backend/API/billing impact: Targeted test does not prove live Express route order or auth regression; broader regression still required.
Proposed action: Mark targeted helper contract as passed, then run approved lint/full test/build commands.
Agent 1 vote: APPROVE
Agent 1 reason: The contract covers the developer-facing payload expected by UAT/docs for the missing catalog.
Agent 2 vote: APPROVE
Agent 2 reason: The unit contract passes but needs full regression to verify TypeScript and route integration.
Agent 3 vote: APPROVE
Agent 3 reason: No visual change and sanitized payload assertions reduce leak risk.
Approval count: 3/3
Final decision: TARGETED PASS, FULL REGRESSION PENDING
Allowed next action: Run approved regression commands.
Status: COMPLETED

---

Decision ID: DEC-CMD-002
Decision title: Run TypeScript lint after R-BUG-001 backend route change
Decision type: Command approval
Related bug IDs: R-BUG-001
Evidence from reports: Backend route code changed and must be typechecked before any fixed claim.
Files likely affected: None by command.
Risk level: Low
Design/template impact: None
Security impact: No network/provider/payment calls; no secrets needed.
Backend/API/billing impact: No DB migration, no server start, no payment/provider calls.
Proposed action: Run `npm run lint`.
Agent 1 vote: APPROVE
Agent 1 reason: Type errors can break UAT/runtime; lint is required before completion.
Agent 2 vote: APPROVE
Agent 2 reason: Backend route and test imports must compile.
Agent 3 vote: APPROVE
Agent 3 reason: No visual or secret risk.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `npm run lint`.
Status: APPROVED

---

Decision ID: DEC-RETEST-LIVE-BILLING-001
Decision title: Is live billing accepted after isolated funded/low-balance/provider diagnostics?
Decision type: Retest acceptance
Related bug IDs: R-BUG-006
Evidence from reports: Isolated live test users/API keys were used without printing raw keys and then revoked. Low-balance returned `402`; invalid key returned `401`; upstream failure records were zero-cost and did not decrement the funded test balance. Direct CloseRouter `/credits` and `/models` passed, but direct text inference across OpenAI/Anthropic/Deepseek/Google returned `502`.
Files likely affected: `API_TEST_REPORT.md`, `API_COST_PLAN.md`, `PAYMENT_BILLING_REPORT.md`, `BACKEND_TEST_REPORT.md`, `RETEST_LOG.md`, `FIX_LOG.md`, `LAUNCH_READINESS_AFTER_REPAIR.md`
Risk level: High for release, Low for documentation update.
Design/template impact: None; no frontend source/style/template change.
Security impact: Raw provider keys and raw `yzk_live_*` test keys must remain excluded; test keys were revoked.
Backend/API/billing impact: Failure and low-balance paths are safer, but success billing cannot be approved without a successful provider response.
Proposed action: Record partial pass and keep launch blocked until CloseRouter inference route is restored and a successful funded text call proves headers, transaction, usage record, and balance decrement.
Agent 1 vote: REJECT
Agent 1 reason: A normal developer still cannot complete the first successful API call.
Agent 2 vote: REJECT
Agent 2 reason: Billing success path, positive charge, transaction and success usage record are not proven.
Agent 3 vote: REJECT
Agent 3 reason: Release guard must stay closed; no design issue, but billing/payment proof is a launch gate.
Approval count: 0/3
Final decision: NOT ACCEPTED FOR FULL RELEASE
Allowed next action: Fix/restore provider upstream inference outside this source change, then rerun tiny funded billing acceptance.
Status: COMPLETED

---

Decision ID: DEC-CMD-003
Decision title: Run full unit/integration test suite after R-BUG-001
Decision type: Command approval
Related bug IDs: R-BUG-001
Evidence from reports: Unknown `/v1` JSON 404 and auth behavior must not regress after adding public catalog.
Files likely affected: None by command.
Risk level: Low/Medium
Design/template impact: None
Security impact: Test suite should use local/mocked env only; no real provider/payment spend.
Backend/API/billing impact: No DB migration or live provider call expected from Vitest suite.
Proposed action: Run `npm test`.
Agent 1 vote: APPROVE
Agent 1 reason: Existing route/admin/payment guards must remain green.
Agent 2 vote: APPROVE
Agent 2 reason: Full test suite is needed to catch billing/auth/payment regressions.
Agent 3 vote: APPROVE
Agent 3 reason: Automated regression is required before marking safe.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `npm test`.
Status: APPROVED

---

Decision ID: DEC-CMD-004
Decision title: Run production build after R-BUG-001
Decision type: Command approval
Related bug IDs: R-BUG-001, R-BUG-002
Evidence from reports: Runtime/build reliability is a launch blocker; backend bundle must include new route.
Files likely affected: Build output `dist/` may be created/updated by command.
Risk level: Medium
Design/template impact: No source design changes; build artifacts may update.
Security impact: No provider/payment calls; no secrets should be emitted.
Backend/API/billing impact: No DB migration; build only.
Proposed action: Run `npm run build`.
Agent 1 vote: APPROVE
Agent 1 reason: Production build validity is required for deploy readiness.
Agent 2 vote: APPROVE
Agent 2 reason: New ESM route import must bundle successfully.
Agent 3 vote: APPROVE
Agent 3 reason: Build is necessary but generated artifacts must be reviewed for secret exposure if tracked.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `npm run build`.
Status: APPROVED

---

Decision ID: DEC-CMD-001
Decision title: Run targeted red test for R-BUG-001 public v1 catalog
Decision type: Command approval
Related bug IDs: R-BUG-001
Evidence from reports: `/v1` catalog endpoints confirmed 404; test must prove the contract before implementation.
Files likely affected: None by command, except Vitest may write no persistent app files.
Risk level: Low
Design/template impact: None
Security impact: No network/provider/payment calls; no secrets needed.
Backend/API/billing impact: No DB migration, no server start, no payment/provider call.
Proposed action: Run `npm test -- src/server/routes/v1-catalog.test.ts` after adding the failing test file.
Agent 1 vote: APPROVE
Agent 1 reason: Targeted test is necessary to prevent a fake fix and should fail before implementation.
Agent 2 vote: APPROVE
Agent 2 reason: It only validates pure route/catalog contract and cannot alter balance/payment state.
Agent 3 vote: APPROVE
Agent 3 reason: No design or secret exposure risk.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run `npm test -- src/server/routes/v1-catalog.test.ts`.
Status: APPROVED

---

Decision ID: DEC-PHASE1-001
Decision title: Is the deduplicated bug list and severity classification approved?
Decision type: Bug triage approval
Related bug IDs: R-BUG-001, R-BUG-002, R-BUG-003, R-BUG-004, R-BUG-005, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009, R-BUG-010
Evidence from reports: Existing `BUG_LIST.md` plus final QA/readiness/payment/admin reports support the deduplicated list.
Files likely affected: `REPAIR_BUG_LIST.md`
Risk level: Low
Design/template impact: None
Security impact: Report-only; security/payment blockers preserved.
Backend/API/billing impact: None; report-only.
Proposed action: Create deduplicated repair bug list with severity and phase assignment.
Agent 1 vote: APPROVE
Agent 1 reason: Severity matches user-facing impact: runtime/login/API billing/payment/admin are launch-critical or high-confidence blockers.
Agent 2 vote: APPROVE
Agent 2 reason: API catalog and successful billing/payment verification are correctly separated from credential-blocked tests.
Agent 3 vote: APPROVE
Agent 3 reason: Visual-change risk is explicitly tracked and no design edits are authorized by this decision.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write `REPAIR_BUG_LIST.md`.
Status: COMPLETED

---

Decision ID: DEC-PHASE2-001
Decision title: Is the phased repair plan approved?
Decision type: Repair planning approval
Related bug IDs: R-BUG-001, R-BUG-002, R-BUG-003, R-BUG-004, R-BUG-005, R-BUG-006, R-BUG-007, R-BUG-008, R-BUG-009, R-BUG-010
Evidence from reports: Launch verdict is `NOT READY — API/BILLING/BALANCE BLOCKERS`; immediate safe fix candidate is public `/v1` catalog because it is confirmed 404 and does not require secrets/payment/live DB.
Files likely affected: `REPAIR_PHASE_PLAN.md`
Risk level: Low for planning; Medium/High for later fixes.
Design/template impact: None for planning; frontend fixes limited to text/data-only.
Security impact: Fix order keeps auth/payment/admin blockers gated.
Backend/API/billing impact: Plan keeps public catalog separate from authenticated billing gateway behavior.
Proposed action: Create phased repair plan and proceed only with individually approved fix decisions.
Agent 1 vote: APPROVE
Agent 1 reason: Phases prioritize confirmed customer/API blockers before cosmetic or deploy-only cleanup.
Agent 2 vote: APPROVE
Agent 2 reason: API catalog can be fixed safely first; billing/payment flows remain blocked until valid test credentials exist.
Agent 3 vote: APPROVE
Agent 3 reason: Design lock is explicit and deploy/provider operations remain blocked pending separate approval.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write `REPAIR_PHASE_PLAN.md`, then open `DEC-FIX-001` before code edits.
Status: COMPLETED
Decision ID: DEC-FIX-DESIGN-RESTORE-001
Decision title: Remove rejected template code and restore approved YapayZekaLab visual shell
Decision type: Code/edit approval
Related bug IDs: DESIGN-REGRESSION-001
Evidence from reports:
- User explicitly rejected the current dashboard/template look and ordered its code removed everywhere.
- `DESIGN_REGRESSION_ACCOUNTABILITY.md` identifies current `src/App.tsx` as the wrong frontend source deployed live.
- Approved visual source candidate exists under `/Users/ufuk/tam-aktarma-turkapiprojesi-2026-05-26/sources/turkapiprojesi/src/yapayzekalab`.
- Agent 2 warned that `/Users/ufuk/Desktop/yapayzekalab/src/App.tsx` must not be copied because it contains `/api/files` and `/api/route-agent` scientific/demo flows.
- Agent 3 corrected guard rules: `Türkiye'nin Yapay Zekâ API Geçidi` and `Ayda ne kadar ödersin?` are approved fingerprints; scientific/demo and current rejected dashboard fingerprints must be blocked.
Files likely affected:
- `src/App.tsx`
- `src/main.tsx`
- `src/yapayzekalab/*`
- `src/rejected-template-guard.test.ts`
- `scripts/scan-rejected-template.mjs`
- `package.json`
- existing source-contract tests
Risk level: High
Design/template impact: Intended restore of approved old visual shell; rejected template removed.
Security impact: Admin password flow must remain removed; admin access stays bound to Google/user token and `cix.crazy666@gmail.com`.
Backend/API/billing impact: Payment, API key, docs and admin endpoint calls must continue using current backend routes.
Proposed action:
1. Import the approved `src/yapayzekalab` visual shell from the transferred source.
2. Replace current `src/App.tsx` with a thin route-to-tab wrapper instead of the rejected template implementation.
3. Patch the imported shell to use the existing user token aliases and remove `/api/admin/login`, admin password and `yz_admin_token` code.
4. Add static source/build guard tests that fail if scientific/demo or rejected dashboard fingerprints return.
5. Update existing contract tests to inspect the restored source locations.
6. Run lint, tests, build, template scan and public scan before any deploy.
Agent 1 vote: APPROVE
Agent 1 reason: Restoring the old visible shell directly addresses the user-facing regression; guard tests are required so it cannot regress silently.
Agent 2 vote: APPROVE
Agent 2 reason: Approved only with preserved auth/admin/payment/API contracts and no direct copy of the scientific desktop App.
Agent 3 vote: APPROVE
Agent 3 reason: Approved only with forbidden fingerprint scanning and no separate admin password/code path.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Perform targeted frontend restore and add guard tests.
Status: IN_PROGRESS

---

Decision ID: DEC-FIX-UX-FAKE-LIVE-001
Decision title: Remove fake live API/playground claims without changing the restored theme
Decision type: Code/edit approval
Related bug IDs: R-BUG-004, R-BUG-006, DESIGN-REGRESSION-001
Evidence from reports: QA and repair reports mark valid funded `/v1` billing as unverified; source inspection found the restored home playground still says `Playground · canlı test`, `sağlayıcı çağrılıyor…`, and shows a random-looking `yzk_live_a8f3…` demo value. That can mislead users into thinking a real provider call/key exists.
Files likely affected: `src/api-docs-content.test.ts`, `src/yapayzekalab/tab-home.jsx`, `src/yapayzekalab/App.jsx`, `src/yapayzekalab/tab-account.jsx`
Risk level: Low
Design/template impact: None; text/data-only change. No CSS, class names, layout, spacing, colors, icons, cards, modals, or responsive rules may change.
Security impact: Reduces fake key exposure and avoids implying unverified live provider execution.
Backend/API/billing impact: None; frontend copy only.
Proposed action: Add a contract test banning fake live playground wording and random-looking demo key text, then replace those strings with explicit example/placeholder wording.
Agent 1 vote: APPROVE
Agent 1 reason: User-facing copy must not claim live API success while funded billing remains unverified.
Agent 2 vote: APPROVE
Agent 2 reason: The change is frontend text/data only and does not affect gateway, balance, payments, or API key backend behavior.
Agent 3 vote: APPROVE
Agent 3 reason: It preserves the restored visual shell and reduces security/launch-risk ambiguity.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Write failing source-contract test, verify RED, then patch text/data only.
Status: IN_PROGRESS

---

Decision ID: DEC-CMD-REGRESSION-UX-001
Decision title: Run full local regression after fake-live copy removal
Decision type: Command/test approval
Related bug IDs: R-BUG-004, R-BUG-005, R-BUG-006, DESIGN-REGRESSION-001
Evidence from reports: Restored frontend was changed in text/data only; prior launch gates require lint, tests, build, public scan, secret scan, and UAT before any completion or deploy claim.
Files likely affected: None by commands, except build/QA artifacts generated by build/UAT tools.
Risk level: Low
Design/template impact: None expected; commands verify source/build guards.
Security impact: Secret scan and public scan check leakage.
Backend/API/billing impact: Local UAT/API smoke checks public/backend behavior without paid provider calls.
Proposed action: Run `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, `node scripts/scan-secrets.mjs`, and `npm run qa:uat`.
Agent 1 vote: APPROVE
Agent 1 reason: Full regression is required before accepting the text/data repair.
Agent 2 vote: APPROVE
Agent 2 reason: Commands do not spend provider credits and verify backend-facing contracts.
Agent 3 vote: APPROVE
Agent 3 reason: Public/secret scans are required before any deploy or readiness claim.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Run approved regression commands and record exact results.
Status: APPROVED

---

Decision ID: DEC-RETEST-UX-FAKE-LIVE-001
Decision title: Accept fake-live playground copy retest
Decision type: Retest acceptance
Related bug IDs: R-BUG-004, R-BUG-006, UX-FAKE-LIVE-001
Evidence from reports: RED test first failed on `yzk_live_a8f3` and fake live copy. After text/data-only patch, `npm test -- src/api-docs-content.test.ts` passed 5/5; full `npm test` passed 27 files / 113 tests; lint/build/public scan/secret scan/local UAT passed; browser smoke found old hero present, rejected template absent, Admin hidden, fake-live claim absent.
Files likely affected: `src/api-docs-content.test.ts`, `src/yapayzekalab/tab-home.jsx`, `src/yapayzekalab/App.jsx`, `src/yapayzekalab/tab-account.jsx`, reports.
Risk level: Low
Design/template impact: None; no CSS/class/layout/theme/button/card/modal change.
Security impact: Positive; removes random-looking fake key display from demo copy.
Backend/API/billing impact: None; it avoids claiming successful billing until real funded-key test passes.
Proposed action: Mark the local fake-live copy cleanup accepted and keep release blocked pending live deploy, funded billing, OAuth/provider/payment E2E gates.
Agent 1 vote: APPROVE
Agent 1 reason: Browser and source contracts now show examples as placeholders, not verified live calls.
Agent 2 vote: APPROVE
Agent 2 reason: No backend behavior changed; billing success is still correctly not claimed.
Agent 3 vote: APPROVE
Agent 3 reason: Visual lock preserved and public scan/secret scan stayed clean.
Approval count: 3/3
Final decision: APPROVED
Allowed next action: Continue launch-blocker verification and prepare rollbackable Git backup before any deploy.
Status: COMPLETED
