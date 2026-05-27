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

---

# Live Payment Migration / IBAN E2E Update — 2026-05-27 10:12 TRT

## Canlı Provider/Method Durumu

| Alan | Sonuç | Kanıt |
|---|---|---|
| Live payment quote columns | PASS LIVE | `payments` ve `pending_iban_payments` içinde `amount_usd`, `payable_tl`, `credit_tl`, `kur_at_payment`, `rounding_tl` doğrulandı |
| DB backup | PASS LIVE | `/opt/turkapiprojesi/.deploy/db-backups/payment-quote-cols-20260527T070013Z.dump` |
| `/api/payments/methods` | PASS LIVE | User token ile 200; IBAN enabled, Shopier/Cryptomus env olmadığı için disabled |
| Shopier init | EXPECTED DISABLED | Env yok; 503. Gerçek/sandbox Shopier E2E hâlâ yapılmadı |
| Cryptomus init | EXPECTED DISABLED | Env yok; 503. Gerçek/sandbox Cryptomus E2E hâlâ yapılmadı |
| IBAN init | PASS LIVE | `$10`, kur `47.279606`, tahsilat `₺473`, kredi `₺472.7961`, yuvarlama `₺0.2039` |
| Normal user admin payment access | PASS LIVE | Pending IBAN admin endpoint normal user ile 403 |
| Admin pending list | PASS LIVE | Admin token ile pending kayıt listede göründü |
| Admin approve | PASS LIVE | Tek transaction ile bakiye `472.7961` arttı, payment `basarili`, pending `onaylandi` |
| Duplicate approve | PASS LIVE | 409; ikinci kredi yok |
| Admin reject without reason | PASS LIVE | 400; sebep zorunlu |
| Admin reject with reason | PASS LIVE | 200; payment `iptal`, pending `reddedildi` |
| Audit logs | PASS LIVE | `iban_approve` ve `iban_reject` audit kayıtları görüldü |
| Cleanup | PASS LIVE | Geçici test user/payment/pending/transaction/audit kayıtları temizlendi |

## Frontend Payment Display Update

- Hesap ekranındaki top-up kutusu backend quote ile hizalandı: Shopier/IBAN için `Math.ceil(amountUsd * kur)` tam TL tahsilat gösteriliyor.
- Frontend-only `%5 komisyon` simülasyonu kaldırıldı; backend böyle bir ücret uygulamadığı için kullanıcıya farklı tutar gösterilmeyecek.
- Cryptomus için ödeme etiketi USD/USDT invoice; TL tutarı bilgi olarak gösteriliyor.
- Ödeme geçmişi artık `Bakiye USD`, `Tahsilat TL`, `Yuvarlama`, durum ve tarih alanlarını gösteriyor.
- Tasarım/stil değişmedi; sadece mevcut alanların metin/veri mapping’i değişti.

## Retest

- `npm test -- src/api-docs-content.test.ts`: PASS, 7/7.
- `npm run lint`: PASS.
- `npm test`: PASS, 27 files / 116 tests.
- `npm run build`: PASS.
- `npm run scan:public`: PASS, 0 hit.
- `node scripts/scan-secrets.mjs`: PASS, 0 hit.
- `npm run qa:uat`: PASS, 10/10.

## Güncel Billing/Payment Verdict

IBAN akışı canlıda güvenli ve idempotent çalıştı. Ancak Shopier/Cryptomus provider valid/invalid/duplicate webhook E2E hâlâ rotated sandbox/test credential olmadan kabul edilemez. Successful funded `/v1` usage deduction da CloseRouter upstream inference `502` nedeniyle bloklu kaldığı için genel launch verdict değişmedi.
