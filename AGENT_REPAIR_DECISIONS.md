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
