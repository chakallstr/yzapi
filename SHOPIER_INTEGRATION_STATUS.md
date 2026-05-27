# Shopier Integration Status

Last checked: 2026-05-28 00:10 TRT

## 4-Agent Gate

Agent 1 - QA/UAT: APPROVE  
Reason: Dynamic top-up is implemented in the app, but live automatic Shopier credit cannot be marked ready until provider callback/webhook is proven.

Agent 2 - Backend/API/Billing: APPROVE  
Reason: Current backend safely keeps Shopier disabled without credentials and already sends rounded TRY collection fields when enabled.

Agent 3 - Visual/Security: APPROVE  
Reason: No frontend style/template change is needed; previously shared PAT/JWT values must not be used as legacy form credentials.

Agent 4 - Integrity/Release Guard: APPROVE WITH BLOCKER  
Reason: Do not overwrite the existing global OSB notification URL until a YapayZekaLab-safe callback/webhook path is confirmed.

Final decision: Shopier is planned but not release-approved. Keep disabled until a safe credential/callback route is available.

## What Is Already Ready

- User can enter or select a USD top-up amount.
- Backend converts USD balance amount to rounded whole TRY for card/IBAN collection.
- Shopier checkout form generation sends TRY collection data:
  - `currency=0`
  - `total_order_value=<rounded TRY>`
  - `product_name=Bakiye Yukleme - <TRY> TL`
- No fixed package/product is required in YapayZekaLab code. The payment row is created for the user-entered amount before redirecting to Shopier.
- Existing tests verify that Shopier receives TRY, not the USD balance amount.

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
- Confirm whether the account supports a separate YapayZekaLab website/callback index, or add a safe fan-out callback that does not break the existing service.
- Configure server env only; never commit credentials.
- Run init-only test first, then callback valid/invalid/fail/duplicate E2E in sandbox or smallest safe real test.

Risk:
- If OSB/callback is global for the account, changing it can break the existing service.

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

Manual IBAN and manual USDT TRC20 are live-pass. Shopier remains `BLOCKED_BY_PROVIDER_SETUP` until one of the safe implementation options above is completed and retested.

