# YapayZekaLab Visual Lock Report

## Scope

This repair phase touched backend routes, tests, repair reports, and text-only API/docs strings in `src/App.tsx`.

## Files Checked For Visual Risk

- `src/server/index.ts`: backend route mount only.
- `src/server/routes/v1-catalog.ts`: backend public catalog route only.
- `src/server/routes/v1-catalog.test.ts`: backend route tests only.
- `src/App.tsx`: text/code example strings only. No class, layout, CSS, color, spacing, component order, or responsive rule changed.
- `src/api-docs-content.test.ts`: static text contract test only.
- `FIX_LOG.md`, `RETEST_LOG.md`, `REPAIR_*.md`, `AGENT_REPAIR_*.md`: reports only.

## Frontend/Style Files

Frontend visual source impact:

- `src/App.tsx`: touched only for visible text/code strings.
- CSS/Tailwind/theme files: not touched.
- Public image/icon/static assets: not touched.
- Layout, classes, spacing, typography, cards, buttons, modals: not touched.

## Screenshots

- Baseline before text-only change: `qa-artifacts/uat-smoke-2026-05-26T20-23-49-230Z/`.
- After text-only change: `qa-artifacts/uat-smoke-2026-05-26T20-27-58-773Z/`.
- Local after-change `qa:uat`: PASS 10/10.

## Visual Diff Notes

Only text/code-example content changed. Source-level visual styling diff does not exist.

## Confirmation

Template, colors, layout, typography, spacing, responsive structure, animations, button styles, card styles, and modal styles were preserved.

## Blocked Visual-Change Issues

None in this phase.

---

## 2026-05-27 Rejected Template Removal

Files checked for visual/template risk:

- `src/yapayzekalab/*`: restored old YapayZekaLab visual shell. This is now the active approved frontend implementation.
- `src/App.tsx`: thin route wrapper only; it does not carry template UI.
- `src/main.tsx`: leftover `./index.css` template import removed.
- `src/index.css`: deleted because it contained Tailwind/Inter/Space Grotesk/JetBrains Mono template globals not used by the restored old shell.
- `vite.config.ts`, `package.json`, `package-lock.json`: Tailwind plugin/dependencies removed because the restored old shell does not use Tailwind.
- `index.html`: old rejected slogan/meta copy replaced with neutral product metadata.
- `scripts/scan-public-bundle.mjs`: public bundle guard extended to block rejected template fingerprints.
- `src/rejected-template-guard.test.ts`: source-level guard added.

Verification:

- `npm test -- src/rejected-template-guard.test.ts`: PASS, 7/7.
- `npm test -- src/api-docs-content.test.ts`: PASS, 5/5.
- `npm test`: PASS, 27 files / 114 tests.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 0 hits.
- `npm run qa:uat`: PASS, 10/10.
- Playwright smoke at `http://localhost:4567/`: old hero present, rejected dashboard/template absent, anonymous Admin hidden, fake-live claim absent, Tailwind/Inter template CSS absent.

Visual diff notes:

- The rejected dashboard/scientific template fingerprints are blocked from source and public bundle.
- The restored old visual shell keeps its existing colors, layout, typography, card/modal/button styles and responsive behavior.
- The latest change was text/data-only: fake live/demo claims were replaced with placeholder wording.
- The follow-up CSS cleanup removed the rejected global template stylesheet and unused Tailwind dependency wiring; the old shell's own `tokens.css` remains.
- Live deploy performed to the real active service `/opt/turkapiprojesi` as deploy ID `manual-20260527T064341Z-6021b8e`.
- Live visual/browser smoke after deploy: old YapayZekaLab hero visible, anonymous Admin hidden, rejected template absent, fake-live claim absent, Tailwind/Inter template CSS absent.
- Live public bundle scan after deploy found no forbidden template/admin-password/fake-live fingerprints.

---

## 2026-05-27 Payment UI Quote Alignment

Files checked for visual/template risk:

- `src/yapayzekalab/tab-account.jsx`: payment amount calculation/copy/data mapping only.
- `src/api-docs-content.test.ts`: source contract tests only.
- CSS/theme/token/layout files: not touched.

Verification:

- `npm test -- src/api-docs-content.test.ts`: PASS, 7/7.
- `npm run lint`: PASS.
- `npm test`: PASS, 27 files / 116 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 0 hits.
- `npm run qa:uat`: PASS, 10/10.
- Screenshot evidence: `qa-artifacts/uat-smoke-2026-05-27T07-10-10-016Z/desktop-home.png`.

Visual diff notes:

- No class names, inline style objects, CSS variables, spacing, colors, card/button/modal structure, or responsive breakpoints were changed.
- Only existing payment text and displayed values changed to match backend rounded TL quote behavior.
- Live deploy `manual-20260527T071659Z-ddee303` preserved the restored old theme. Live UAT `qa-artifacts/uat-smoke-2026-05-27T07-17-37-093Z/desktop-home.png` shows the old YapayZekaLab hero and no rejected template.

---

## 2026-05-27 Deploy Metadata / Security Hygiene

Files checked for visual/template risk:

- `scripts/vps-deploy.sh`: deploy target defaults only.
- `docs/vps-deploy.md`: operations docs only.
- `docs/release-vps-beta-checklist.md`: operations docs only.
- `src/deploy-target-contract.test.ts`: test only.

Verification:

- No frontend component, CSS, token, layout, card, button, modal, icon, typography or responsive files were changed.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- Live smoke after restart: PASS.

Visual diff notes:

- No visual diff possible from this phase; it only corrected deploy target metadata and secret hygiene.

---

## 2026-05-27 OAuth Return and Provider Guard Hardening

Files checked for visual/template risk:

- `src/App.tsx`: route mapping only; no UI rendering or styles.
- `src/yapayzekalab/App.jsx`: auth-token URL handling only; no CSS/class/style/layout/button/card/modal changes.
- `src/server/routes/payments.ts` and payment service/tests: backend-only.

Verification:

- `npm test -- src/admin-single-owner-contract.test.ts`: PASS, 3/3.
- `npm run lint`: PASS.
- `npm test`: PASS, 28 files / 126 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 227 scanned / 0 hits.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: PASS, 10/10.
- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`: PASS for safe public/backend checks.

Visual diff notes:

- No CSS files, design tokens, colors, typography, spacing, layout, responsive breakpoints, card/button/modal styles or visual hierarchy changed.
- The frontend patch only maps `/dashboard` to the existing account area and removes OAuth token query parameters after storing them.
- Provider callback hardening is backend-only and has no visual impact.

---

## 2026-05-27 Manual Payment Instructions

Files checked for visual/template risk:

- `src/yapayzekalab/tab-account.jsx`: conditional payment instruction data rendering only.
- `src/yapayzekalab/tab-admin.jsx`: admin payment settings section using existing admin card/input/button/subnav patterns.
- `src/yapayzekalab/tokens.css`, global CSS, theme tokens, homepage/model/SSS/API layout files: not touched.

Verification:

- `npm test -- src/payment-safety-contract.test.ts`: PASS, 8/8 after RED failure.
- `npm test -- src/server/services/google-oauth-service.test.ts src/payment-safety-contract.test.ts`: PASS, 10/10.
- `npm run lint`: PASS.
- `npm test`: PASS, 29 files / 130 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 230 scanned / 0 hits.
- `npm run qa:uat`: PASS, 10/10, report `qa-artifacts/uat-smoke-2026-05-27T19-24-23-128Z/uat-smoke-report.md`.

Visual diff notes:

- No colors, gradients, font families, global token values, spacing scale, button/card/modal styling, responsive breakpoints, landing page order, model card layout or API tab layout changed.
- The new customer-facing payment details appear only after an IBAN/manual crypto init response; the panel uses the existing surface/border/ink variables and existing typography scale.
- The new admin `Ödeme` section is functional config UI; it reuses existing `SubNav`, `Card`, `inputStyle`, `var(--ink)` button and existing spacing.
- A true before/after screenshot for the conditional payment panel is not available because the old behavior was a browser alert; current route smoke screenshots are stored in the QA artifact folder above.
