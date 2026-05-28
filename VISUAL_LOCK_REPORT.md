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

---

## 2026-05-27 Auth Refresh for Protected Payment Requests

Files checked for visual/template risk:

- `src/yapayzekalab/auth-client.js`: request/auth helper only.
- `src/yapayzekalab/App.jsx`: auth/profile request wiring only.
- `src/yapayzekalab/tab-account.jsx`: import and request helper replacement only.
- `src/auth-client-refresh.test.ts`: test only.

Verification:

- `npm test -- src/auth-client-refresh.test.ts`: RED failed before helper existed, then PASS 2/2.
- `npm test -- src/auth-client-refresh.test.ts src/payment-safety-contract.test.ts src/admin-single-owner-contract.test.ts src/admin-fetch-guard.test.ts`: PASS 4 files / 15 tests.
- `npm run lint`: PASS.
- `npm test`: PASS 30 files / 134 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 232 scanned / 0 hits.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: PASS 10/10.

Visual diff notes:

- No CSS files, theme tokens, colors, gradients, fonts, font sizes, spacing, layout structure, card/button/modal styles, responsive breakpoints, icons, illustrations or page order changed.
- The change only centralizes existing token aliases and protected fetch retry behavior.
- Default local `npm run qa:uat` failed because `127.0.0.1:4567` was not listening; this is recorded as environment setup, not a visual regression.

---

## 2026-05-27 Live Manual Payment Configuration

Files checked for visual/template risk:

- No frontend source files changed in this step.
- Remote `.env.production` display fields and `system_config` manual payment values changed only.

Verification:

- `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps`: PASS.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: PASS, 10/10.
- Safe live backend E2E for IBAN and manual USDT TRC20 init: PASS with temporary record cleanup.
- Standard Chrome showed the existing account card/payment instruction UI, with manual USDT TRC20 wallet information and WhatsApp notification button visible.

Visual diff notes:

- No CSS, theme token, color, font, spacing, layout, card, button, modal, icon, animation, route or template code changed.
- Existing payment instruction component was populated by live config only.
- BEP20 was not displayed as an enabled payment network because the supplied wallet address is TRON-format.

---

## 2026-05-28 Shopier OSB Non-Success Fallback Repair

Files checked for visual/template risk:

- `src/server/routes/payments.ts`
- `src/payment-safety-contract.test.ts`

Verification:

- `npm run lint`: PASS.
- `npm test`: PASS, 30 files / 135 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 3 scanned / 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 233 scanned / 0 hits.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: PASS, 10/10 for current live surface.

Visual diff notes:

- No frontend source file changed.
- No CSS, theme token, color, font, spacing, layout, card, button, modal, icon, animation, route or template code changed.
- The repair is backend-only Shopier callback routing plus a source contract test.

## 2026-05-28 14:34 TRT Claude Popusk Migration Visual Lock

- Frontend changes were limited to text/data/model/example values in the existing YapayZekaLab components.
- No CSS variables, fonts, colors, spacing, border radius, shadows, animations, modal styles, button styles, card styles, responsive breakpoints, icons, or layout templates were intentionally changed.
- `vite.config.ts` and `src/rejected-template-guard.test.ts` were updated only to recognize the new official public v1 URL fingerprint while keeping the old-theme guard active.
- `npm run build` passed with the rejected-template guard enabled.
- `npm run scan:public` passed with 0 hits.

Visual decision: PRESERVED LOCALLY. Browser screenshot comparison was not rerun in this session; deploy/browser visual acceptance remains pending the fourth integrity guard.

## 2026-05-28 14:53 TRT Claude Popusk Price/Order Visual Lock

- Frontend change was limited to `MODEL_DISPLAY_ORDER` data and sorting existing model data before render.
- No CSS variables, font settings, colors, gradients, shadows, spacing, border radius, layout structure, component hierarchy, button/card/modal styles, icons, animations, or responsive breakpoints changed.
- `src/yapayzekalab/shared.jsx` still renders through the existing Models tab/card components; only the model order and public USD values are data-driven.
- `npm run build` passed.
- `npm run scan:public` passed with 0 hits.
- `node scripts/scan-secrets.mjs` passed with 0 hits.

Visual decision: PRESERVED LOCALLY. Browser screenshot comparison and deploy-surface approval remain pending the fourth integrity guard.

## 2026-05-28 15:12 TRT Full E2E Visual Lock

- Full E2E fix touched only backend error handling plus reports.
- No frontend CSS, theme, color, typography, spacing, layout, card, button, modal, icon, animation or responsive code changed.
- Local UAT smoke after fix passed 10/10.
- Live UAT smoke passed 10/10 on the currently deployed bundle, but live bundle is still old catalog state with 33 models.

Visual decision: PRESERVED LOCALLY. Deploy-surface parity remains pending.
