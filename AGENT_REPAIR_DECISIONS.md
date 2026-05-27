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
