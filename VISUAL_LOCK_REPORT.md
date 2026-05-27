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
- Live deploy was not performed in this pass.
