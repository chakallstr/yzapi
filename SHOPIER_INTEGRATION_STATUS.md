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
