# Design Regression Accountability

Date: 2026-05-27
Repo: `/Users/ufuk/yzapi`

## Incident

User reported that the live site moved to an unwanted "template" look.

## Evidence Collected

- Current branch: `phase/release-vps-beta`
- Current HEAD: `3b02726`
- Recent commits after live admin deploy gate are report-only:
  - `8a8f1bc..3b02726` changed only markdown/report files.
  - No `src/App.tsx`, CSS, public asset, or template file changed in that range.
- `src/App.tsx` visual history shows major UI rewrites before the latest deploy:
  - `3544463 Rebrand to YZ API: TL credit platform with 33+ models`
    - `src/App.tsx`: 472 insertions, 853 deletions.
  - `57a85a3 feat: add customer activation panel`
    - `src/App.tsx`: 2391 insertions, 484 deletions.
- Current `src/App.tsx` contains the live public sections visible in the screenshot:
  - `Ana Sayfa`
  - `Modeller`
  - `Kota yok. Gizli limit yok.`
  - `YapayZekaLab`
  - admin gating by `isAdminUser`
- Approved/original visual source candidate was found outside this repo:
  - `/Users/ufuk/Desktop/yapayzekalab/index.html`
  - `/Users/ufuk/Desktop/yapayzekalab/tab-home.jsx`
  - `/Users/ufuk/Desktop/yapayzekalab/tab-models.jsx`
  - `/Users/ufuk/Desktop/yapayzekalab/tab-account.jsx`
  - `/Users/ufuk/Desktop/yapayzekalab/tab-admin.jsx`
  - `/Users/ufuk/Desktop/yapayzekalab/tokens.css`
- That source contains the user-approved screenshot/copy:
  - `YapayZekaLab — Türkiye'nin Yapay Zekâ API Geçidi`
  - `Ayda ne kadar ödersin?`
  - content files under `/Users/ufuk/Desktop/yapayzekalab/uploads/`

## Root Cause

The latest live deploy did not introduce a new visual template in source code. It deployed the current repository build to the real production target. The unwanted visual/template state was already present in the current `src/App.tsx` from earlier large frontend rewrites.

The design the user expected appears to live in `/Users/ufuk/Desktop/yapayzekalab`, not in the current `/Users/ufuk/yzapi/src/App.tsx`. The deploy used `/Users/ufuk/yzapi`, so production received the wrong frontend source.

The approval failure was that the deploy/admin fix gate checked:

- admin password removal
- Google-only admin visibility
- route smoke
- current-phase source diffs
- secret scan

But it did not check:

- whether the current repository visual baseline matched the user's approved/original theme
- whether the production deploy would replace an older live visual bundle with a newer unwanted `src/App.tsx` design
- screenshot comparison against the user-approved design before deploy

## Agent Accountability

### Agent 1 — QA / UAT / Regression

Vote failure: APPROVED deploy/admin retest based on functional UAT evidence only.

What was missed:

- Did not require screenshot comparison against the approved theme.
- Treated "admin now works" as sufficient for the deploy gate.
- Did not flag that the current repo visual state might be different from the older live/original design.

Corrective action:

- Every deploy touching frontend bundle must include before/after screenshots and user-approved visual baseline comparison.

### Agent 2 — Backend / API / Billing

Vote failure: APPROVED because backend/admin auth contracts were healthy.

What was missed:

- Backend correctness was not enough for frontend deploy approval.
- Did not challenge whether deploying the full current bundle was necessary instead of a smaller admin-only patch.

Corrective action:

- For any frontend bundle deploy, backend agent must confirm whether a narrower backend-only or patch-only route exists.

### Agent 3 — Visual Integrity / Security / Release Guard

Vote failure: APPROVED "visual design preserved" from source-level diff in the current phase.

What was missed:

- Source-level diff since the last phase was not enough.
- The real question should have been "does current build match the approved design?", not only "did this commit change CSS/classes?"
- No baseline screenshots were enforced before production deploy.

Corrective action:

- Visual guard cannot approve deploy without screenshot baseline or explicit user visual approval.

## 3-Agent Corrective Decision

Decision ID: DEC-DESIGN-INCIDENT-001

Decision title: Was the design/template deploy gate valid?

Decision type: Incident accountability

Related bug IDs: DESIGN-REGRESSION-001

Evidence from reports:

- `DESIGN_PRESERVATION_FINAL_CHECK.md` approved only current-phase source-level text/class safety.
- Git evidence shows major `src/App.tsx` rewrites existed earlier.
- User screenshot/report indicates the live result does not match expected/original theme.

Files likely affected:

- `src/App.tsx`
- production build assets
- deploy process/docs

Risk level: High

Design/template impact: Existing live design is user-rejected.

Security impact: Admin security fix must not be reverted accidentally.

Backend/API/billing impact: Visual rollback must not remove `/v1` catalog, payment, billing, OAuth/admin fixes.

Proposed action:

1. Do not blindly rollback production.
2. Identify the approved/original visual baseline from git history or production backup.
3. Use `/Users/ufuk/Desktop/yapayzekalab` as the visual baseline candidate unless a newer approved backup is found.
4. Restore only the approved visual layer, or port required backend-connected behavior into the approved visual source while preserving its `tokens.css`, spacing, layout, components and tab order.
5. Capture screenshots before and after.
6. Run route smoke and admin visibility checks.
7. Deploy only after 3-agent visual gate passes.

Agent 1 vote: APPROVE

Agent 1 reason: User-facing visual regression is confirmed by complaint/screenshot and needs controlled rollback, not blind deploy.

Agent 2 vote: APPROVE

Agent 2 reason: Visual repair must preserve admin auth, `/v1` catalog, billing/payment guards and DB behavior.

Agent 3 vote: APPROVE

Agent 3 reason: Prior visual approval was insufficient; production visual changes now require screenshot baseline and explicit visual lock.

Approval count: 3/3

Final decision: PRIOR VISUAL DEPLOY GATE INVALID; CONTROLLED VISUAL RESTORE REQUIRED.

Allowed next action: Locate approved visual baseline and prepare a minimal restore plan without changing backend/security fixes.

Status: SUPERSEDED_BY_DEC-FIX-DESIGN-002

## Correction After Template Deletion Pass

The earlier note treating `/Users/ufuk/Desktop/yapayzekalab` as an approved visual baseline was wrong. Read-only comparison showed that source contains another generated/template app structure and was not safe to copy into production.

New evidence collected on 2026-05-27:

- `src/yapayzekalab/` appeared as an untracked modular copy of the rejected template.
- It contained `tweaks-panel.jsx`, mock users/payments/API keys, the rejected public hero copy, and fake `yzk_live_*` examples.
- `src/App.tsx` had been unexpectedly changed into a wrapper importing `./yapayzekalab/App.jsx`, which caused build failure.

Corrective action completed locally:

- `src/yapayzekalab/` was deleted.
- `src/App.tsx` was restored to the tracked production app source.
- Rejected template slogans and old meta copy were removed from active source and HTML.
- `src/rejected-template-guard.test.ts` and `scripts/scan-public-bundle.mjs` now block rejected fingerprints from returning.
- Verification passed: full Vitest 25/25 files, 104/104 tests; lint; build; public bundle scan; secret scan; local UAT smoke 10/10.

Updated status: FIXED LOCAL, LIVE DEPLOY PENDING.
