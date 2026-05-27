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

## Live Payment UI Deploy — 2026-05-27 10:18 TRT

- Deploy ID: `manual-20260527T071659Z-ddee303`.
- Live smoke PASS; live UAT PASS 10/10.
- Live bundle required labels present: `Bakiye USD`, `Tahsilat TL`, `Yuvarlama`, `yukarı tam liraya`.
- Live bundle removed stale payment mismatch strings: `%5 komisyon`, `Komisyon %`.
- Rejected template/admin password/fake-live fingerprints remained absent.

## Direct Provider Recheck — 2026-05-27 10:20 TRT

- CloseRouter `/credits`: `200`, `total_credits=1.99998845`, `total_usage=0.00001155`.
- CloseRouter `/models/count`: `200`, `count=34`.
- Tiny text inference with `max_tokens <= 4` timed out for Anthropic, OpenAI, DeepSeek, Google, Moonshot and Qwen tested models.

Updated payment/billing verdict: IBAN and payment UI are live-pass. Overall billing launch remains blocked by successful text inference/billing and Shopier/Cryptomus provider E2E.

---

# Live OmniRoute + Payment Method Recheck — 2026-05-27 19:28 TRT

## Canlı Env Durumu

| Alan | Sonuç | Kanıt |
|---|---|---|
| OmniRoute gateway billing | PASS LIVE | Temporary funded key ile `/v1/chat/completions` `200`, cost/remaining/request-id headerları mevcut |
| Usage deduction | PASS LIVE | Balance `50.0000 -> 49.9671`, `usage_records.status=success`, `cost_tl=0.0329`, `total_requests=1` |
| Cleanup | PASS LIVE | Temporary user marker `qa-omni-recheck-1779899269150`, leftovers `0` |
| Payment methods | PASS SAFE-DISABLED | User JWT ile 200; `iban.enabled=true`, `shopier.enabled=false`, `cryptomus.enabled=false` |
| Shopier env | BLOCKED | Live `.env.production` içinde `SHOPIER_API_KEY` ve `SHOPIER_API_SECRET` unset |
| Shopier init when disabled | PASS SAFE-DISABLED | `/api/payments/shopier/init` returned `503`; no `payments` row created |
| Cryptomus env | BLOCKED | Live `.env.production` içinde `CRYPTOMUS_API_KEY` ve `CRYPTOMUS_MERCHANT_ID` unset |
| Cryptomus init when disabled | PASS SAFE-DISABLED | `/api/payments/crypto/init` returned `503`; no `payments` row created |
| IBAN init | PASS LIVE | `$10` produced `payableTL=473`, `creditTL=472.7961`, `roundingTL=0.2039` |
| Provider contract unit tests | PASS LOCAL | Shopier/Cryptomus/payment guard/common/pricing tests: 6 files, 32 tests passed |
| Secret scan | PASS LOCAL | `node scripts/scan-secrets.mjs`: 227 scanned, 0 hits |

## Shopier / Cryptomus E2E Durumu

Gerçek provider E2E hâlâ tamamlanmış sayılmaz, çünkü canlı env’de Shopier ve Cryptomus credential satırları boş. Sistem bu durumda güvenli davranıyor: yöntemleri disabled gösteriyor, init endpointleri 503 dönüyor ve ödeme kaydı oluşturmuyor.

Önemli güvenlik kararı: önceki mesajlarda paylaşılan credential değerleri sızmış kabul edildiği için canlı `.env.production` içine yazılmadı. Provider E2E için panelden rotate edilmiş yeni credential gerekir; değerler server env’e güvenli kanaldan girildikten sonra valid/invalid/duplicate callback/webhook testi tekrar çalıştırılmalı.

## Güncel Billing/Payment Verdict

API usage deduction artık temporary OmniRoute GPT path ile canlıda PASS. IBAN ödeme akışı PASS. Shopier/Cryptomus live provider E2E ise `BLOCKED_BY_MISSING_ROTATED_PROVIDER_ENV`; bu iki yöntem launch için zorunluysa final release hâlâ onaylanamaz.

---

# Live Manual Payment Config Retest — 2026-05-27 23:25 TRT

## Güncellenen Canlı Ödeme Bilgileri

| Alan | Sonuç | Kanıt |
|---|---|---|
| IBAN display config | PASS LIVE | Canlı env güncellendi; safe backend E2E bank/alıcı/IBAN alanlarını doğruladı |
| WhatsApp payment notification | PASS LIVE | `system_config.payment_whatsapp_number` güncellendi; IBAN ve manual crypto init mesajları doğru referansı içerdi |
| Manual USDT wallet | PASS LIVE | Manual crypto `USDT/TRC20` aktif; Chrome’da cüzdan talimatı ve WhatsApp butonu göründü |
| BEP20 guard | PASS SAFE | Verilen adres TRON-format olduğu için BEP20 aktif gösterilmedi; memo uyarısı eklendi |
| Automatic credit | PASS SAFE | IBAN/manual crypto otomatik bakiye eklemiyor; admin review/onay modeli korunuyor |
| Temporary test cleanup | PASS LIVE | Backend E2E sırasında oluşturulan geçici payment/pending rows temizlendi |
| Live smoke | PASS LIVE | `SMOKE_BASE_URL=https://yapayzekalab.org npm run smoke:vps` |
| Live UAT | PASS LIVE | `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat` 10/10 |

## Güncel Shopier / Cryptomus Durumu

- Shopier provider hâlâ canlıda kapalıdır; rotated production/sandbox credential kurulmadan valid/invalid/fail/duplicate callback E2E yapılamaz.
- Cryptomus provider credential hâlâ canlıda kapalıdır; manuel USDT TRC20 talimatı aktif edildi, fakat Cryptomus webhook E2E hâlâ eksiktir.
- Bu canlı config düzeltmesi gerçek para almadı, provider çağırmadı ve bakiye artırmadı.

## Güncel Billing/Payment Verdict

Manual IBAN ve manual USDT TRC20 ödeme talimatları canlıda PASS. Temporary OmniRoute API usage deduction daha önce canlıda PASS. Final payment launch gate yine de Shopier ve Cryptomus provider E2E tamamlanana kadar `BLOCKED_BY_MISSING_ROTATED_PROVIDER_ENV` kalır.

---

# Local Provider Callback Hardening — 2026-05-27 20:52 TRT

## Eklenen Güvenlik Korumaları

| Alan | Sonuç | Kanıt |
|---|---|---|
| Shopier callback amount guard | PASS LOCAL | Signed callback `total_order_value` payment quote ile eşleşmezse credit yok |
| Shopier callback currency guard | PASS LOCAL | Signed callback currency `0`/TRY değilse credit yok |
| Shopier signature compatibility | PASS LOCAL | Yeni full-field signature ve eski fallback signature testleri geçiyor |
| Cryptomus amount guard | PASS LOCAL | Webhook `amount` stored USD invoice ile eşleşmezse credit yok |
| Cryptomus currency guard | PASS LOCAL | Webhook `currency=USD` ve `to_currency=USDT` değilse credit yok |
| Regression | PASS LOCAL | `npm test` 28 files / 126 tests, `npm run build` PASS |
| Secret/public scan | PASS LOCAL | Public scan 0 hit, secret scan 227 scanned / 0 hit |

## Kalan Provider E2E Blokeri

Shopier/Cryptomus için canlı/sandbox valid, invalid, failed ve duplicate callback/webhook E2E hâlâ kabul edilmiş sayılmaz. Bunun nedeni canlı provider env değerlerinin unset olması ve önceki paylaşılan tokenların sızmış kabul edilmesidir. Rotated yeni provider credential server env’e güvenli şekilde girildikten sonra gerçek provider callback/webhook kanıtı toplanmalı.
