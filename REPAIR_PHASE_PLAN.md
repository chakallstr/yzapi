# YapayZekaLab Repair Phase Plan

Tasarım kilidi aktiftir: renk, layout, spacing, typography, component class, modal/card/button görünümü ve responsive yapı değişmeyecek.

## Phase 2A — Critical Safety Blockers

- Bugs included: `R-BUG-002`
- Files likely affected: `package.json`, deploy/run scripts, environment/runbook docs; source code only after confirmed root cause.
- Commands required: Read-only inspection first; later approved `npm run build`, `npm start`, `/health` smoke, deploy/process manager checks.
- Risk level: High
- Rollback plan: Kod değişimi varsa git diff revert; process/deploy değişimi öncesi backup.
- Retest plan: Local/prod-like start, `/health`, `/status`, DB restart behavior, 30-60 min endurance if needed.
- Design impact: None
- Approval status: Approved for planning; implementation requires separate `DEC-FIX`.

## Phase 2B — API / Billing / Balance Core

- Bugs included: `R-BUG-001`, `R-BUG-006`
- Files likely affected: `src/server/index.ts`, new/updated `/v1` catalog route, API contract tests.
- Commands required: Targeted Vitest for catalog, then `npm test`, `npm run lint`, `npm run build` after approval.
- Risk level: Medium/High
- Rollback plan: Remove public catalog route and tests if regression appears.
- Retest plan: `GET /v1/models`, `/v1/providers`, `/v1/models/count` 200 JSON; unknown `/v1/*` 404 JSON; authsuz gateway POST endpoints remain 401.
- Design impact: None
- Approval status: Approved for first implementation candidate: public catalog only. Billing true-flow remains blocked by missing funded key/upstream env.

## Phase 2C — Payment Flow Safety

- Bugs included: `R-BUG-007`
- Files likely affected: Payment routes/services/tests only if sandbox retest finds code issue.
- Commands required: Unit/integration payment tests; no real provider calls without explicit approval and rotated credentials.
- Risk level: High
- Rollback plan: Revert payment route/service changes; no DB migration without separate approval.
- Retest plan: Shopier/Cryptomus valid/invalid/duplicate callback/webhook; browser callback no credit; IBAN approve idempotent.
- Design impact: None
- Approval status: Planning approved; implementation blocked by provider test credential.

## Phase 2D — Frontend Functional Repairs Without Design Change

- Bugs included: `R-BUG-004`, `R-BUG-005`, `R-BUG-010`
- Files likely affected: `src/App.tsx`, content contract tests.
- Commands required: Static/content tests, browser screenshot if app can run.
- Risk level: Medium
- Rollback plan: Revert text/content-only changes; no class/style/layout edits.
- Retest plan: `/docs` and API tab examples use correct YapayZekaLab base URL/key prefix; video docs/status text says beta/sınırlı; visual lock check confirms no class/style changes.
- Design impact: Text/data only; no layout/style change allowed.
- Approval status: Planning approved; separate `DEC-FIX` required.

## Phase 2E — Admin Functional Repairs

- Bugs included: `R-BUG-008`
- Files likely affected: Admin tests/scripts; admin source only if retest finds defect.
- Commands required: Admin UAT smoke with safe admin session; API audit checks.
- Risk level: Medium/High
- Rollback plan: Revert admin-specific code changes; no live mutation outside test records.
- Retest plan: Admin dashboard/config/users/balance/model overrides/announcements/providers/audit/reconciliation/plans/API keys/pending IBAN click-through.
- Design impact: None
- Approval status: Planning approved; live credential blocked.

## Phase 2F — Frontend/Backend Consistency

- Bugs included: `R-BUG-001`, `R-BUG-004`, `R-BUG-005`, `R-BUG-006`, `R-BUG-009`
- Files likely affected: API catalog route, `src/App.tsx` content strings, docs/report files.
- Commands required: API catalog tests, UAT smoke, live smoke after deploy approval.
- Risk level: Medium/High
- Rollback plan: Revert API/content changes; no deploy without backup.
- Retest plan: UI model availability/pricing/docs match backend endpoints; video limited state matches backend 501/beta; live smoke after deploy.
- Design impact: No visual/layout impact.
- Approval status: Planning approved; deployment deferred.

## Phase 2G — Regression and Final Verification

- Bugs included: All `R-BUG-*`
- Files likely affected: Reports, test logs, no new product changes unless approved.
- Commands required: `npm run lint`, `npm test`, `npm run build`, `npm run scan:public`, secret scan if present, `npm run qa:uat`, live smoke after deploy approval.
- Risk level: Medium
- Rollback plan: Git status/diff check, revert failing changes, stop before deploy if local fails.
- Retest plan: Targeted tests first, full test suite, build, public scan, visual lock, then live QA only after backup/deploy approval.
- Design impact: Visual preservation report required.
- Approval status: Planning approved; each command requires `DEC-CMD`.

## Current Implementation Order

1. Create repair intake/triage/phase decision files.
2. Add failing contract test for `R-BUG-001`.
3. Implement minimal public `/v1` catalog endpoints.
4. Retest targeted API catalog and auth/404 regression.
5. Address docs/API and video text-only mismatch if `R-BUG-001` passes.
6. Stop at credential/provider/deploy blockers and report exact remaining requirements.
