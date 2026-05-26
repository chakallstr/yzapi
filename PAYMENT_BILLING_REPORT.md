# Payment / Billing Report

Operasyon tarihi: 2026-05-26

## Test Sonuçları

| Alan | Sonuç | Kanıt |
|---|---|---|
| Payment methods | PASS LOCAL | User JWT ile 200; current env’de IBAN/Shopier/Cryptomus eksikse disabled |
| Payment amount guard | PASS UNIT | `minBakiyeTL` / `maxBakiyeTL` altında/üstünde 400 helper doğrulandı |
| IBAN config guard | PASS LOCAL | IBAN env alanları eksikse methods `enabled:false`, init 503 |
| IBAN init | PASS PRE-GUARD / BLOCKED CURRENT ENV | 120 TL pending payment ve referans kod pre-guard doğrulandı; current env IBAN eksik olduğu için init kapalı |
| Admin pending IBAN list | PASS LOCAL | Oluşturulan pending kayıt listede bulundu |
| Admin IBAN approve | PASS LOCAL | Balance +120 TL, payment `basarili`, transaction oluştu |
| Duplicate IBAN approve | PASS LOCAL | 409; çift credit yok |
| Idempotency | PASS LOCAL | Aynı referans için transaction count 1 |
| Shopier init | BLOCKED/EXPECTED | Lokal env yok; gerçek para kullanılmadı |
| Shopier callback signature | PARTIAL | Unit test coverage mevcut; live/sandbox callback yapılmadı |
| Cryptomus init | BLOCKED/EXPECTED | Lokal env yok; gerçek provider kullanılmadı |
| Cryptomus webhook signature | PARTIAL | Unit test coverage mevcut; live/sandbox webhook yapılmadı |
| Usage deduction | BLOCKED | Başarılı gerçek `/v1` çağrısı için live funded key/upstream kanıtı yok |
| Admin direct balance patch | PASS LOCAL | Generic user patch route’u `bakiyeTL` için 400; ledger endpointi kullanılmalı |
| Reconciliation | PARTIAL | Endpoint var; admin credential ile temel API test edildi, tam finansal mutabakat raporu manuel incelenmedi |

## Kritik Güvenlik Kuralları

- Browser crypto callback yalnız redirect yapıyor; credit webhook ile olmalı.
- Invalid webhook/callback unit test kapsamı var.
- IBAN admin approve idempotent test edildi; ayrıca boş IBAN env artık kullanıcıya aktif yöntem gibi gösterilmiyor.
- Payment init miktar doğrulaması sistem `minBakiyeTL` / `maxBakiyeTL` limitleriyle korundu.
- Failed payment/duplicate provider callback canlı provider olmadan test edilmedi.

## Sonuç

PARTIAL PASS. Ledger dışı bakiye patch’i kapatıldı, ödeme miktar/IBAN guard eklendi. Shopier/Cryptomus gerçek/sandbox provider doğrulaması ve başarılı API usage deduction tamamlanmadan launch onayı verilmez.

---

# Live Billing Retest Update — 2026-05-27 02:50 TRT

## Usage Deduction / API Billing

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Live funded test key setup | PASS TEST-ONLY | İzole `qa-live-billing-*` kullanıcı/key oluşturuldu; raw key yazılmadı |
| Live funded gateway call | BLOCKED_BY_UPSTREAM | Gateway text calls upstream `502` aldığı için success billing doğrulanamadı |
| Failed upstream charge safety | PASS | Funded test balance unchanged; error usage records `cost_tl=0` |
| Low-balance key | PASS | Zero-balance key small text call `402` |
| Invalid key | PASS | Invalid/fake key `401` |
| Test data cleanup | PASS | Follow-up read-only DB check found no remaining `qa-live-billing-*` test rows |
| Direct CloseRouter credits | PASS | `/credits` 200, yaklaşık `$1.99998845` credit |
| Direct CloseRouter catalog | PASS | `/models/count` 200, 34 model |
| Direct CloseRouter inference | FAIL UPSTREAM | OpenAI/Anthropic/Deepseek/Google chat and OpenAI responses `502` |

## Current Billing Risk

Billing code-path safety for failure and low-balance paths is acceptable, but launch billing acceptance is still blocked because a successful provider response is required to prove:

- `X-YZ-Cost-TL`
- `X-YZ-Remaining-TL`
- `X-YZ-Request-Id`
- positive `transactions` ledger write
- success `usage_records`
- user balance decrement

## Payment Provider Status

Shopier/Cryptomus sandbox E2E is still not accepted. Unit/signature/idempotency contracts exist, but provider-dashboard valid, invalid, duplicate callback/webhook evidence is still required with rotated sandbox credentials.

## Standard Chrome Shopier Panel Check — 2026-05-27

- Standard Chrome was used; no new debug port was opened.
- Shopier login page opened and Chrome had saved credentials available.
- Login reached the seller panel/orders area.
- The panel showed real production account/order data, not a safe sandbox/test environment.
- No order close, refund, collection, payout, product, callback, or real payment operation was clicked.
- Result: `PANEL_ACCESS_CONFIRMED_PRODUCTION_DATA_VISIBLE`, but `SANDBOX_E2E_STILL_BLOCKED`.

Security decision: Do not use this real Shopier panel for destructive E2E payment testing. Payment launch acceptance still requires rotated sandbox/test credentials or a provider-approved test flow.

## Standard Chrome Cryptomus Panel Check — 2026-05-27

- Standard Chrome was used; no new debug port was opened.
- `app.cryptomus.com` opened an authenticated account overview.
- The panel showed real wallet/balance/history areas, not a safe sandbox/test environment.
- No send, transfer, exchange, merchant, API-key, webhook, or real crypto operation was clicked.
- Result: `PANEL_ACCESS_CONFIRMED_PRODUCTION_WALLET_VISIBLE`, but `SANDBOX_E2E_STILL_BLOCKED`.

Security decision: Do not use this real Cryptomus wallet/account for destructive E2E payment testing. Crypto launch acceptance still requires a sandbox/test merchant flow or provider-approved test invoice/webhook evidence.
