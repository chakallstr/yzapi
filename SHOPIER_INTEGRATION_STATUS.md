# Shopier Integration Status

Last checked: 2026-05-28 00:55 TRT

## 4-Agent Gate

Agent 1 - QA/UAT: APPROVE  
Reason: Dynamic top-up is implemented in the app, but live automatic Shopier credit cannot be marked ready until provider callback/webhook is proven.

Agent 2 - Backend/API/Billing: APPROVE  
Reason: Current backend safely keeps Shopier disabled without credentials and already sends rounded TRY collection fields when enabled.

Agent 3 - Visual/Security: APPROVE  
Reason: No frontend style/template change is needed; previously shared PAT/JWT values must not be used as legacy form credentials.

Agent 4 - Integrity/Release Guard: APPROVE WITH BLOCKER  
Reason: Do not overwrite the existing global OSB notification URL until a YapayZekaLab-safe callback/webhook path is confirmed.

Final decision: Shopier backend relay is implemented locally and test-passed. Keep the payment method disabled in production until live legacy checkout credentials are installed and OSB/panel E2E is completed.

## What Is Already Ready

- User can enter or select a USD top-up amount.
- Backend converts USD balance amount to rounded whole TRY for card/IBAN collection.
- Shopier checkout form generation sends TRY collection data:
  - `currency=0`
  - `total_order_value=<rounded TRY>`
  - `product_name=Bakiye Yukleme - <TRY> TL`
- No fixed package/product is required in YapayZekaLab code. The payment row is created for the user-entered amount before redirecting to Shopier.
- Existing tests verify that Shopier receives TRY, not the USD balance amount.
- `POST /api/payments/shopier/osb` exists as a safe OSB relay endpoint:
  - If the callback belongs to a YapayZekaLab payment and signature/TRY/amount checks pass, it credits balance idempotently.
  - If the callback is not ours or has an unknown payment ID, it can forward the original form body to `SHOPIER_OSB_FALLBACK_URL`.
  - This lets a single Shopier OSB URL preserve an existing service while YapayZekaLab processes its own payment rows.

## Panel / Docs Findings

- Shopier's current public help describes the new Shopier API as a REST API for account/order/product operations and points developers to the developer portal.
- Shopier's personal access token help says PAT is for programmatic access to the seller account and is displayed only once; it is not the same thing as the legacy checkout form `API_key` / `API_secret`.
- Shopier's OSB page identifies OSB as legacy and recommends modern webhooks. The live panel currently has an existing OSB URL configured for another service, so replacing it blindly can break that service.

Sources:
- https://help.shopier.com/help/shopier-api-nedir
- https://help.shopier.com/help/kisisel-erisim-anahtari-nedir
- https://help.shopier.com/help/otomatik-siparis-bildirimi-osb-nedir

## Safe Implementation Options

### Option A - Legacy Checkout Form

Use the current code path.

Requirements:
- Correct legacy Shopier `API_key` and `API_secret` for checkout form, not PAT/JWT.
- Configure `SHOPIER_OSB_FALLBACK_URL` to the existing service before changing the Shopier panel OSB URL.
- Configure the Shopier panel OSB URL to `https://yapayzekalab.org/api/payments/shopier/osb`.
- Configure server env only; never commit credentials.
- Run init-only test first, then callback valid/invalid/fail/duplicate E2E in sandbox or smallest safe real test.

Risk:
- If fallback URL is missing or wrong, changing the global OSB URL can still break the existing service.

### Option B - Modern App / Webhook

Implement a new Shopier app/webhook integration.

Requirements:
- Official webhook payload/signature contract from Shopier developer portal.
- Backend route for modern webhook verification, idempotency, amount/currency matching and safe credit.
- App/webhook setup in Shopier panel with least required permissions.
- Full valid/invalid/duplicate webhook tests before enabling in production.

Risk:
- Requires new code path and provider-side app configuration; cannot be assumed compatible with the current legacy form callback handler.

## Current Release Gate

Manual IBAN and manual USDT TRC20 are live-pass. Shopier remains `BLOCKED_BY_PROVIDER_SETUP` until the relay is deployed, legacy checkout credentials are installed, OSB fallback is configured, and live provider E2E is completed.

## Verification

- RED: `npm test -- src/payment-safety-contract.test.ts` failed before `SHOPIER_OSB_FALLBACK_URL` and `/shopier/osb` existed.
- GREEN: `npm test -- src/payment-safety-contract.test.ts` passed 10/10.
- Targeted: `npm test -- src/server/services/shopier-service.test.ts src/payment-safety-contract.test.ts src/server/services/payment-pricing.test.ts` passed 3 files / 22 tests.
- Regression: `npm run lint`, `npm test` 30 files / 135 tests, `npm run build`, `npm run scan:public`, and `node scripts/scan-secrets.mjs` passed.

## Live Deploy Status - 2026-05-27 23:57 TRT

- Deploy ID: `manual-20260527T205709Z-62a1fe4`.
- Live service: `turkapiprojesi.service` active after restart.
- Live server code: `dist/server.js` contains `POST /api/payments/shopier/osb`.
- Live server env: `SHOPIER_OSB_FALLBACK_URL` key is present; value is not printed in reports.
- Live smoke: `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` passed for health, status, models, authless gateway 401, and JSON 404 checks.
- Live UAT: `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` passed 10/10, report `qa-artifacts/uat-smoke-2026-05-27T20-57-26-842Z/uat-smoke-report.md`.
- Shopier panel: OSB URL field was prepared as `https://yapayzekalab.org/api/payments/shopier/osb`, but the final `KAYDET` click was not submitted yet because it is a global payment notification setting.

Current state: YapayZekaLab can safely receive Shopier OSB callbacks after the panel URL is saved. Automatic card payment still cannot be called launch-ready until the provider-side save, activation/test step, and valid/invalid/duplicate callback E2E are completed.

## Provider Panel Save - 2026-05-28 00:18 TRT

- Shopier OSB panel URL was saved as `https://yapayzekalab.org/api/payments/shopier/osb`.
- Panel confirmation: successful save, then redirected to the OSB test tab.
- OSB test tab requires an existing Shopier order number. No historical/random order was used because that can retrigger delivery logic for another service through the fallback path.
- Safe live negative callback test: incomplete form callback returned `400 application/json` with `{ "ok": false }`.
- DB side-effect check after the negative callback: recent Shopier payments `0`, payment transactions `0`.
- Current live env still has `SHOPIER_API_KEY` and `SHOPIER_API_SECRET` unset, so YapayZekaLab correctly keeps the Shopier method disabled and `/api/payments/shopier/init` returns `503` without creating a payment row.

Conclusion: The Shopier notification destination is now saved and the receiving endpoint is safe. Automatic card payment is still not launch-approved until true checkout credentials are installed and a real provider test order/callback proves valid, invalid, failed and duplicate behavior.
