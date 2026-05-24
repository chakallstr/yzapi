# Payment API Integration Spec — Phase D

Target reader: Node.js/TypeScript engineer implementing webhook handlers, signature verification, and idempotent transaction recording.

Sources:
- Shopier developer homepage: https://dev.shopier.com/
- `shopier` npm package (v1.0.4) source: https://registry.npmjs.org/shopier/latest
- `@nopeion/shopier` npm package (v1.0.0) source: https://github.com/nopeion/shopier
- Cryptomus merchant API docs: https://doc.cryptomus.com/merchant-api/
- Cryptomus request format: https://doc.cryptomus.com/merchant-api/request-format
- Cryptomus payment statuses: https://doc.cryptomus.com/merchant-api/payments/payment-statuses

---

## 1. Shopier (Turkish card processor)

### 1.1 Endpoint URLs

Shopier does **not** expose a server-to-server REST JSON API for initiating payments. Instead, the integration is a browser-redirect / form-POST flow:

| Purpose | URL |
|---|---|
| Payment form submission (production + sandbox) | `https://www.shopier.com/ShowProduct/api_pay4.php` |
| Callback (your server, you configure this) | e.g. `https://yourdomain.com/api/public/shopier/callback` |

**There is no separate sandbox URL.** Shopier uses the same endpoint for both test and live. Test mode is indicated by `istest: 1` in the callback payload. To use test mode, configure your Shopier account in "test" mode through the merchant panel.

> TBD — confirm with Shopier support: whether a dedicated sandbox credential set exists, or whether test vs. live is purely a merchant-account setting.

### 1.2 Auth Method

Two credentials from the Shopier merchant panel:

| Env var | Description |
|---|---|
| `SHOPIER_API_KEY` | Identifies your merchant account (sent in the form body as `API_key`) |
| `SHOPIER_API_SECRET` | Used to compute an HMAC-SHA256 signature; never sent in plaintext |

There is no OAuth, no Bearer token, no server-side request signing for the initial form POST. Authentication is implicit via the signed form body.

### 1.3 Checkout Init Flow

The flow is a **form POST redirect**, not a JSON API call. Your server generates a signed HTML form with hidden fields, then delivers it to the browser. The browser auto-submits to Shopier's endpoint. Shopier displays the payment page.

**What you send** — hidden form fields POSTed to `https://www.shopier.com/ShowProduct/api_pay4.php`:

```
Content-Type: application/x-www-form-urlencoded
```

| Field | Type | Required | Description |
|---|---|---|---|
| `API_key` | string | yes | Your Shopier API key |
| `website_index` | integer | yes | Which registered site to use (1, 2, 3…) |
| `platform_order_id` | string | yes | Your unique order identifier — the idempotency key |
| `product_name` | string | yes | Product/service name shown to buyer |
| `product_type` | integer | yes | `0` = real physical, `1` = downloadable/virtual |
| `buyer_name` | string | yes | Buyer first name |
| `buyer_surname` | string | yes | Buyer last name |
| `buyer_email` | string | yes | Buyer email |
| `buyer_account_age` | integer | yes | Days since buyer registered on your platform (0 = unknown) |
| `buyer_id_nr` | string | yes | Your internal user ID |
| `buyer_phone` | string | yes | Buyer phone (Turkish format, e.g. `05551234567`) |
| `billing_address` | string | yes | Street address |
| `billing_city` | string | yes | City |
| `billing_country` | string | yes | Country |
| `billing_postcode` | string | yes | Postal code |
| `shipping_address` | string | — | Falls back to billing if omitted |
| `shipping_city` | string | — | Falls back to billing if omitted |
| `shipping_country` | string | — | Falls back to billing if omitted |
| `shipping_postcode` | string | — | Falls back to billing if omitted |
| `total_order_value` | number | yes | Amount as a float, e.g. `150.00` |
| `currency` | integer | yes | `0` = TRY, `1` = USD, `2` = EUR |
| `platform` | integer | yes | Max installments allowed (`0` = no installment) |
| `is_in_frame` | integer | yes | Platform type: `0` = not in iframe, `1` = in iframe |
| `current_language` | string | yes | `tr` or `en` |
| `modul_version` | string | yes | SDK version string (e.g. `"1.0.0"`) |
| `random_nr` | integer | yes | Random integer generated per transaction (used in signature) |
| `signature` | string | yes | HMAC-SHA256 signature (see §1.4) |

**What you get back** — there is no JSON response. Shopier redirects the browser back to your `url_success` / `url_fail` (if configured) and fires a server-to-server POST callback to the URL you register in your merchant panel.

#### Sample form data object (TypeScript)

```typescript
// Generated server-side, then rendered as an auto-submit HTML form
const formData = {
  API_key: process.env.SHOPIER_API_KEY,
  website_index: 1,
  platform_order_id: "payment-order-abc123",
  product_name: "Bakiye Yükleme — 100 TL",
  product_type: 1,                  // virtual/digital
  buyer_name: "Ahmet",
  buyer_surname: "Yılmaz",
  buyer_email: "ahmet@example.com",
  buyer_account_age: 30,
  buyer_id_nr: "user-uuid-here",
  buyer_phone: "05551234567",
  billing_address: "Atatürk Cad. No:1",
  billing_city: "İstanbul",
  billing_country: "Türkiye",
  billing_postcode: "34000",
  shipping_address: "Atatürk Cad. No:1",
  shipping_city: "İstanbul",
  shipping_country: "Türkiye",
  shipping_postcode: "34000",
  total_order_value: 120.00,        // KDV dahil (see §1.6)
  currency: 0,                      // TRY
  platform: 0,                      // no installment
  is_in_frame: 0,
  current_language: "tr",
  modul_version: "1.0.0",
  random_nr: 847291,                // crypto.randomInt(100000, 999999)
  signature: "<computed — see §1.4>",
};
```

### 1.4 Signature Verification

#### Outgoing payment signature (when building the form)

```
signedData = `${random_nr}${platform_order_id}${total_order_value}${currency}`
signature  = HMAC-SHA256(API_SECRET, signedData) → base64
```

```typescript
import { createHmac } from "crypto";

function generatePaymentSignature(
  secret: string,
  randomNr: number,
  orderId: string,
  amount: number,
  currency: number  // 0 | 1 | 2
): string {
  const data = `${randomNr}${orderId}${amount}${currency}`;
  return createHmac("sha256", secret).update(data).digest("base64");
}
```

#### Incoming callback signature (when verifying Shopier's POST)

Shopier sends `random_nr`, `platform_order_id`, and `signature` in the callback body.

```
signedData     = `${random_nr}${platform_order_id}`
expectedSig    = HMAC-SHA256(API_SECRET, signedData) → base64
valid          = timingSafeEqual(expectedSig, callback.signature)
```

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyCallbackSignature(
  secret: string,
  randomNr: string,
  platformOrderId: string,
  receivedSignature: string
): boolean {
  const data = `${randomNr}${platformOrderId}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(receivedSignature, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
```

**Note:** The `@api/shopier` webhook variant (used in Shopier's store product-management API, a separate system) uses a different scheme: `HMAC-SHA256(key, base64PayloadString + username) → hex`. Do not confuse this with the payment form callback above.

### 1.5 Callback / Webhook

Shopier POSTs to the URL you register in your merchant panel settings.

**Request from Shopier:**
```
POST https://yourdomain.com/api/public/shopier/callback
Content-Type: application/x-www-form-urlencoded
```

**Body fields** (URL-encoded, decoded to JSON for illustration):

```json
{
  "platform_order_id": "payment-order-abc123",
  "payment_id": "313758163",
  "random_nr": "847291",
  "status": "success",
  "installment": "0",
  "signature": "base64-hmac-sha256-here",
  "API_key": "your-api-key"
}
```

| Field | Description |
|---|---|
| `platform_order_id` | Your order ID (the idempotency key) |
| `payment_id` | Shopier's own transaction identifier |
| `random_nr` | The random number from the original form submission |
| `status` | `"success"` or `"fail"` |
| `installment` | Number of installments used |
| `signature` | HMAC-SHA256 over `random_nr + platform_order_id` (base64) |
| `API_key` | Your API key, echoed back |

**Note on `istest`:** The decoded product webhook (different API) includes `istest: 0|1`. Whether `istest` is included in the payment form callback should be verified against your Shopier merchant panel test transactions.

> TBD — confirm with Shopier: (a) whether `istest` appears in callback body for the `api_pay4.php` flow; (b) exact full set of URL-encoded fields in the POST body (Shopier's developer docs did not publish a public spec page — the above is reconstructed from multiple community SDK implementations).

### 1.6 Idempotency

Use `platform_order_id` as the primary key for deduplication. Before crediting a user:

```sql
-- Postgres example
INSERT INTO transactions (platform_order_id, payment_id, status, ...)
VALUES ($1, $2, $3, ...)
ON CONFLICT (platform_order_id) DO NOTHING;
```

Shopier may POST the callback more than once. The `ON CONFLICT DO NOTHING` pattern (or equivalent `WHERE NOT EXISTS`) must guard every credit operation.

Do **not** use `payment_id` as the only key — it arrives from an untrusted POST body and is not verified by the signature. `platform_order_id` is the value you chose and signed.

### 1.7 Currency and KDV (VAT)

Shopier does **not** handle KDV calculation. You pass the **final gross amount including KDV** in `total_order_value`. The currency integer code is `0` = TRY, `1` = USD, `2` = EUR.

For yzapi's use case (credit top-ups subject to 20% KDV):
```typescript
const netAmountTL = 100;
const kdvRate = 0.20;
const grossAmountTL = +(netAmountTL * (1 + kdvRate)).toFixed(2); // 120.00
// Pass grossAmountTL as total_order_value, currency 0
```

> TBD — confirm with Shopier: whether a separate `kdv_dahil` or tax-line field is accepted; also whether Shopier generates a KDV receipt (e-fatura/e-arşiv) automatically or whether the merchant must.

### 1.8 Refund Flow

Shopier **does not expose a public refund API endpoint** for the `api_pay4.php` payment form flow. Refunds must be initiated manually via the Shopier merchant panel, or by contacting Shopier support.

> TBD — confirm with Shopier support: whether a programmatic refund endpoint exists in 2025/2026 and what credentials/parameters it requires.

### 1.9 Merchant Onboarding

1. Register at https://www.shopier.com/ (free account).
2. Complete identity verification in the merchant panel.
3. Navigate to Settings → API to retrieve your `API_key` and `API_secret`.
4. Register your callback URL in the panel (Settings → Payment Notifications or equivalent).
5. Register your site domain under "Websites" to get a `website_index` value (1, 2, …).
6. Test with small amounts (istest mode in panel) before going live.

There is no separate sandbox credential URL — the same endpoint handles test and live based on your panel mode.

> TBD — confirm: approximate time from registration to receiving live credentials; whether a business bank account in Turkey is required immediately or can be added after testing.

### 1.10 TypeScript Client Libraries

There is no Shopier-official npm package. Community options:

| Package | Version | Notes |
|---|---|---|
| `shopier` | 1.0.4 | Turkish-language README; abstracts form rendering, `ShopierResponse.fromPostData()`, `hasValidSignature()` |
| `@nopeion/shopier` | 1.0.0 | TypeScript-first, zero dependencies, uses Node.js built-ins, ESM+CJS, exposes all field types |
| `shopier-api` | 1.1.4 | Separate author; similar scope |

**Recommendation for yzapi:** Use `@nopeion/shopier` for type safety and zero dependencies, or implement raw HTTP directly using the field spec in §1.3 — the integration is simple enough that a raw implementation is 80 lines of TypeScript.

---

## 2. Cryptomus (USDT TRC20 / crypto payments)

### 2.1 Endpoint URLs

All endpoints are under one base URL. No separate sandbox — Cryptomus provides a test webhook tool in the merchant panel.

| Endpoint | Method | Purpose |
|---|---|---|
| `https://api.cryptomus.com/v1/payment` | POST | Create invoice |
| `https://api.cryptomus.com/v1/payment/info` | POST | Get invoice status |
| `https://api.cryptomus.com/v1/payment/refund` | POST | Issue refund |
| `https://api.cryptomus.com/v1/payment/resend` | POST | Re-trigger webhook for an invoice |
| `https://api.cryptomus.com/v1/payment/list` | POST | List invoices |

### 2.2 Auth Method

Every request carries two HTTP headers:

| Header | Value |
|---|---|
| `merchant` | Your merchant UUID (from Cryptomus merchant panel → Settings) |
| `sign` | MD5 hash computed from the request body |
| `Content-Type` | `application/json` |

**Sign computation:**

```
sign = MD5( base64(JSON.stringify(requestBody)) + API_PAYMENT_KEY )
```

```typescript
import { createHash } from "crypto";

function computeSign(body: Record<string, unknown>, apiKey: string): string {
  const json = JSON.stringify(body);
  const b64  = Buffer.from(json).toString("base64");
  return createHash("md5").update(b64 + apiKey).digest("hex");
}
```

For GET requests or requests with an empty body:
```typescript
const sign = createHash("md5").update(Buffer.from("").toString("base64") + apiKey).digest("hex");
```

**Important:** Use a **Payment API key** (not a Payout API key). These are different keys generated in the merchant panel.

### 2.3 Create Invoice Flow

**Request:**

```
POST https://api.cryptomus.com/v1/payment
Content-Type: application/json
merchant: <merchant-uuid>
sign: <computed-sign>
```

**Required body fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | string | yes | Amount with decimal separator `.` (e.g. `"25.00"`) |
| `currency` | string | yes | `"USD"` or `"USDT"` — the denomination of `amount` |
| `order_id` | string | yes | Your unique order ID (alphanum + `-` + `_`, 1–128 chars). Duplicate `order_id` returns the existing invoice. |
| `network` | string | — | Lock to specific network, e.g. `"tron"` for TRC20. Omit to let user choose. |
| `to_currency` | string | — | Force crypto payment currency (e.g. `"USDT"`). Use with `currency: "USD"` to accept USD-denominated USDT. |
| `url_callback` | string | — | HTTPS URL Cryptomus POSTs to on status change |
| `url_success` | string | — | Redirect after successful payment |
| `url_return` | string | — | "Back to shop" URL |
| `lifetime` | integer | — | Invoice lifespan in seconds (300–43200, default 3600) |
| `is_payment_multiple` | boolean | — | Allow partial payments (default `true`) |
| `additional_data` | string | — | Arbitrary string passed back in webhook |

**For yzapi's use case (USDT TRC20, USD-denominated amounts):**

```json
{
  "amount": "12.50",
  "currency": "USD",
  "order_id": "payment-order-abc123",
  "network": "tron",
  "to_currency": "USDT",
  "url_callback": "https://yourdomain.com/api/public/cryptomus/webhook",
  "url_success": "https://yourdomain.com/dashboard?payment=success",
  "lifetime": 3600
}
```

**Response:**

```json
{
  "state": 0,
  "result": {
    "uuid": "26109ba0-b05b-4ee0-93d1-fd62c822ce95",
    "order_id": "payment-order-abc123",
    "amount": "12.50",
    "payment_amount": null,
    "payer_amount": null,
    "payer_currency": null,
    "currency": "USD",
    "network": "tron",
    "address": "TXyz...abc",
    "from": null,
    "txid": null,
    "payment_status": "check",
    "url": "https://pay.cryptomus.com/pay/26109ba0-b05b-4ee0-93d1-fd62c822ce95",
    "expired_at": 1689098133,
    "status": "check",
    "is_final": false,
    "additional_data": null,
    "created_at": "2023-07-11T20:23:52+03:00",
    "updated_at": "2023-07-11T21:24:17+03:00"
  }
}
```

Key response fields:
- `result.uuid` — Primary key; store this in `transactions` table immediately.
- `result.url` — Hosted payment page. Redirect the user here or open in a new tab.
- `result.address` — TRC20 wallet address (present only when `network` is specified at creation time).
- `result.status` — Initial status is `"check"`.
- `state: 0` means success; `state: 1` means error with a `message` field.

**Note on currency conversion:** You send a USD-denominated amount; Cryptomus converts to USDT using their exchange rates (defaulting to their own rates, or optionally Binance/KuCoin/Exmo via the `course_source` field). For yzapi, there is no need to pre-convert TRY→USD yourself for the Cryptomus invoice — pass the USD equivalent directly. If you need to show the user a TRY price, apply your own `sellKur` before initiating, then pass the USD amount to Cryptomus.

### 2.4 Webhook Callback

Cryptomus POSTs JSON to `url_callback` when invoice status changes.

**Request from Cryptomus:**
```
POST https://yourdomain.com/api/public/cryptomus/webhook
Content-Type: application/json
```

**IP whitelist:** Cryptomus sends webhooks from `91.227.144.54`. Whitelist this IP in addition to signature verification.

**Body example (paid status):**

```json
{
  "type": "payment",
  "uuid": "62f88b36-a9d5-4fa6-aa26-e040c3dbf26d",
  "order_id": "payment-order-abc123",
  "amount": "12.50000000",
  "payment_amount": "12.50000000",
  "payment_amount_usd": "12.50",
  "merchant_amount": "12.25000000",
  "commission": "0.25000000",
  "is_final": true,
  "status": "paid",
  "from": "THgEWubVc8tPKXLJ4VZ5zbiiAK7AgqSeGH",
  "wallet_address_uuid": null,
  "network": "tron",
  "currency": "USDT",
  "payer_currency": "USDT",
  "payer_amount": "12.50000000",
  "payer_amount_exchange_rate": null,
  "transfer_id": null,
  "additional_data": null,
  "convert": null,
  "txid": "6f0d9c8374db57cac0d806251473de754f361c83a03cd805f74aa9da3193486b",
  "sign": "a76c0d77f3e8e1a419b138af04ab600a"
}
```

**Webhook fields:**

| Field | Description |
|---|---|
| `uuid` | Cryptomus invoice UUID — primary key for deduplication |
| `order_id` | Your order ID |
| `status` | Current payment status (see §2.5) |
| `is_final` | `true` means no more status changes will fire |
| `amount` | Invoiced amount (in invoice currency) |
| `payment_amount` | Amount actually received |
| `merchant_amount` | Amount credited to your Cryptomus balance (after commission) |
| `commission` | Cryptomus fee deducted |
| `from` | Sender's wallet address |
| `network` | Blockchain network (`"tron"` for TRC20) |
| `txid` | On-chain transaction hash |
| `sign` | Signature field — must be extracted and verified (see §2.4.1) |

#### 2.4.1 Webhook Signature Verification

```typescript
import { createHash } from "crypto";

function verifyWebhookSignature(
  rawBody: Record<string, unknown>,
  apiPaymentKey: string
): boolean {
  // 1. Extract the sign from the body
  const receivedSign = rawBody.sign as string;

  // 2. Remove the sign field
  const { sign: _removed, ...dataWithoutSign } = rawBody;

  // 3. Recompute: MD5( base64(JSON.stringify(data)) + API_PAYMENT_KEY )
  // CRITICAL: slashes in values must be escaped (replace / with \/)
  const json = JSON.stringify(dataWithoutSign).replace(/\//g, "\\/");
  const b64  = Buffer.from(json).toString("base64");
  const hash = createHash("md5").update(b64 + apiPaymentKey).digest("hex");

  return hash === receivedSign;
}
```

**Critical Node.js vs PHP difference:** PHP's `json_encode` escapes forward slashes by default (`/` → `\/`). Node.js `JSON.stringify` does not. If a field like `txid` contains a slash, the hash will not match unless you add `.replace(/\//g, "\\/")` after `JSON.stringify`. Apply this replacement unconditionally.

**Handler skeleton:**

```typescript
app.post("/api/public/cryptomus/webhook", express.json(), async (req, res) => {
  if (!verifyWebhookSignature(req.body, process.env.CRYPTOMUS_PAYMENT_API_KEY!)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { uuid, order_id, status, is_final, merchant_amount } = req.body;

  // Dedupe — webhook fires multiple times
  const alreadyProcessed = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.cryptomus_uuid, uuid), eq(transactions.status, "credited")))
    .limit(1);

  if (alreadyProcessed.length > 0) return res.json({ ok: true });

  if (status === "paid" || status === "paid_over") {
    await db.transaction(async (tx) => {
      await tx.insert(transactions).values({ cryptomus_uuid: uuid, order_id, status: "credited", ... })
        .onConflictDoNothing();
      await tx.update(users).set({ balance: sql`balance + ${merchant_amount}` }).where(...);
    });
  }

  return res.json({ ok: true });
});
```

### 2.5 Payment Status State Machine

| Status | Meaning | Count as paid? |
|---|---|---|
| `check` | Waiting for transaction to appear on blockchain | No |
| `confirm_check` | Transaction seen, waiting for confirmations | No |
| `process` | Payment in processing | No |
| `paid` | Client paid the exact required amount | **Yes** |
| `paid_over` | Client paid more than required | **Yes** |
| `wrong_amount` | Client paid less than required | No — do not credit |
| `wrong_amount_waiting` | Underpaid, awaiting additional payment | No — wait |
| `fail` | Payment error | No |
| `cancel` | Cancelled / not paid within lifetime | No |
| `system_fail` | Cryptomus system error | No |
| `refund_process` | Refund in progress | No |
| `refund_fail` | Refund failed | No |
| `refund_paid` | Refund completed | No |
| `locked` | Funds locked by AML program | No |

**Credit the user only on `paid` or `paid_over`.** Do not credit on `wrong_amount` — the user paid less. When `is_final: true` and status is neither `paid` nor `paid_over`, treat the payment as failed.

### 2.6 Idempotency

Use `uuid` as the primary key in your `transactions` table. Cryptomus fires webhooks on every status transition, including intermediate ones (`confirm_check`, etc.).

```sql
CREATE UNIQUE INDEX transactions_cryptomus_uuid_idx ON transactions (cryptomus_uuid);
```

Pattern:
```typescript
// Only process crediting once, even if webhook fires 5 times
await db.insert(transactions)
  .values({ cryptomus_uuid: uuid, order_id, status: "credited", amount_usd: merchant_amount, ... })
  .onConflictDoNothing();
// Then check rows_affected; if 0, skip the balance update
```

Additionally, store `order_id` with a unique index for cross-reference, since `order_id` is what you control.

### 2.7 Currency Conversion

Cryptomus handles the TRC20 → USDT → USD conversion. For yzapi:

1. You decide the USD amount the user should pay (e.g. convert from TRY using your `sellKur`).
2. Send `currency: "USD"`, `amount: "<usd-amount>"`, `network: "tron"`, `to_currency: "USDT"` to Cryptomus.
3. Cryptomus converts USD → USDT at their internal rate and generates the TRC20 address with that USDT amount.
4. The webhook returns `merchant_amount` — the USDT amount credited to your Cryptomus balance after their commission (currently ~2%).

You do not need to call any exchange rate API before creating an invoice. Do **not** send TRY directly to Cryptomus (`currency: "TRY"` is not supported).

### 2.8 Merchant Onboarding

1. Register at https://cryptomus.com/ with your email.
2. Complete KYC. For Turkish business accounts, Cryptomus requires identity verification documents. **KYC approval typically takes 1–3 business days** for business accounts.
3. In the Cryptomus dashboard, create a Merchant.
4. Under Merchant → Settings, generate a **Payment API key** (separate from a Payout API key).
5. Your **Merchant UUID** is shown in the same settings page.
6. There is no separate sandbox environment. Use the "Testing webhook" tool in the Merchant panel (Merchant → Payments → Test Webhook) to simulate callbacks.

> TBD — confirm with Cryptomus: (a) whether personal (non-business) accounts are sufficient for lower volumes; (b) exact KYC document requirements for Turkish residents; (c) whether there is a minimum withdrawal/settlement threshold.

### 2.9 TypeScript Client Libraries

No Cryptomus-official npm package exists. Community options:

| Package | Version | Notes |
|---|---|---|
| `cryptomus-sdk` | 3.0.0 | Community, TypeScript types, maintained 2024–2025 |
| `takefy-cryptomus` | 1.0.3 | TypeScript SDK |
| `@atharahmed/cryptomus` | 0.3.0 | Node wrapper |
| `cryptomus-toolkit` | 1.0.3 | Toolkit with TypeScript support |

**Recommendation for yzapi:** Implement raw HTTP. The entire integration is two endpoints (create + webhook), and the auth/sign logic is 10 lines. Adding a community package with unclear maintenance history is not worth it for this scope.

```typescript
// Minimal Cryptomus client
import { createHash } from "crypto";

const BASE = "https://api.cryptomus.com/v1";

function sign(body: Record<string, unknown>, apiKey: string): string {
  const json = JSON.stringify(body);
  return createHash("md5").update(Buffer.from(json).toString("base64") + apiKey).digest("hex");
}

async function cryptomusPost<T>(
  path: string,
  body: Record<string, unknown>,
  merchantId: string,
  apiKey: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "merchant": merchantId,
      "sign": sign(body, apiKey),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { state: number; result?: T; message?: string };
  if (data.state !== 0) throw new Error(`Cryptomus error: ${data.message}`);
  return data.result as T;
}
```

### 2.10 Sample: Create Invoice + Webhook Round-trip

**Create invoice request:**

```typescript
const invoice = await cryptomusPost<CryptomusInvoice>(
  "/payment",
  {
    amount: "12.50",
    currency: "USD",
    order_id: "payment-order-abc123",
    network: "tron",
    to_currency: "USDT",
    url_callback: "https://yourdomain.com/api/public/cryptomus/webhook",
    url_success: "https://yourdomain.com/dashboard",
    lifetime: 3600,
  },
  process.env.CRYPTOMUS_MERCHANT_ID!,
  process.env.CRYPTOMUS_PAYMENT_API_KEY!
);
// invoice.uuid  — store this immediately in payment_orders table
// invoice.url   — redirect user here
```

**Webhook body (paid — see §2.4 for full field list):**

```json
{
  "type": "payment",
  "uuid": "62f88b36-a9d5-4fa6-aa26-e040c3dbf26d",
  "order_id": "payment-order-abc123",
  "status": "paid",
  "is_final": true,
  "amount": "12.50000000",
  "merchant_amount": "12.25000000",
  "network": "tron",
  "currency": "USDT",
  "txid": "6f0d9c8374db57...",
  "sign": "a76c0d77f3e8e1a419b138af04ab600a"
}
```

---

## 3. Open Questions Summary

| # | API | Question | Impact |
|---|---|---|---|
| 1 | Shopier | Does a dedicated sandbox credential set exist, or is test/live purely a panel toggle? | Test environment setup |
| 2 | Shopier | Does the callback body include `istest: 0/1` for the `api_pay4.php` flow? | Must not credit on test callbacks |
| 3 | Shopier | Is there a programmatic refund API endpoint (not panel-only)? | Refund automation |
| 4 | Shopier | Does Shopier auto-generate KDV receipts (e-fatura), or is that the merchant's obligation? | Legal/accounting |
| 5 | Shopier | Exact approved list of URL-encoded POST fields sent by Shopier in the callback | Robust parsing |
| 6 | Shopier | Approximate time from registration to live API key approval | Go-live planning |
| 7 | Cryptomus | Personal vs business account sufficiency for lower volumes | Onboarding path |
| 8 | Cryptomus | Exact KYC document requirements for Turkish residents | Onboarding planning |
| 9 | Cryptomus | Minimum withdrawal/settlement threshold | Cash flow |
