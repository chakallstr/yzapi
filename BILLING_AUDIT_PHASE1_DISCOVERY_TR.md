# YapayZekaLab Billing Audit — Phase 1 Keşif Raporu

Tarih: 2026-05-28
Kapsam: Sadece keşif. Kod değişikliği yok. Amaç, billing ve API usage yüzeyindeki exact dosya, fonksiyon, tablo ve route haritasını çıkarmak.

## 1. Stack ve ana giriş noktaları

- Backend stack:
  - `Express` — [src/server/index.ts](/Users/ufuk/yzapi/src/server/index.ts)
  - `TypeScript`
  - `PostgreSQL + Drizzle ORM` — [src/server/db/schema.ts](/Users/ufuk/yzapi/src/server/db/schema.ts)
  - `Vite` frontend build, backend ayrı `esbuild` bundle — [package.json](/Users/ufuk/yzapi/package.json)
- Çalıştırma:
  - Dev: `tsx watch src/server/index.ts`
  - Prod: `node dist/server.js`
- Canlı deploy scriptleri:
  - [scripts/deploy.sh](/Users/ufuk/yzapi/scripts/deploy.sh)
  - [scripts/vps-deploy.sh](/Users/ufuk/yzapi/scripts/vps-deploy.sh)
  - [scripts/vps-live-preflight.sh](/Users/ufuk/yzapi/scripts/vps-live-preflight.sh)

## 2. Auth sistemi

### Route montajı

- [src/server/index.ts](/Users/ufuk/yzapi/src/server/index.ts)
  - `/api/admin` public auth router + protected admin router
  - `/api/auth` Google OAuth + refresh/logout + WhatsApp OTP
  - `/api/user` user JWT + WhatsApp verified guard
  - `/v1` catalog public, sonra `apiKeyAuth` + `requireWhatsappVerified` + proxy

### Middleware / auth dosyaları

- User auth:
  - [src/server/middleware/user-auth.ts](/Users/ufuk/yzapi/src/server/middleware/user-auth.ts)
- Admin auth:
  - [src/server/middleware/admin-auth.ts](/Users/ufuk/yzapi/src/server/middleware/admin-auth.ts)
- API key auth:
  - [src/server/middleware/api-key-auth.ts](/Users/ufuk/yzapi/src/server/middleware/api-key-auth.ts)
  - Ana fonksiyon: `apiKeyAuth`
  - Çağırdığı servis: `validateApiKey`
- WhatsApp gate:
  - [src/server/middleware/whatsapp-verified.ts](/Users/ufuk/yzapi/src/server/middleware/whatsapp-verified.ts)
  - Ana fonksiyon: `requireWhatsappVerified`

### Auth route dosyası

- [src/server/routes/auth.ts](/Users/ufuk/yzapi/src/server/routes/auth.ts)
  - `GET /google`
  - `GET /google/callback`
  - `POST /whatsapp-otp/start`
  - `POST /whatsapp-otp/resend`
  - `POST /whatsapp-otp/verify`
  - `POST /refresh`
  - `POST /logout`

## 3. API key üretimi ve doğrulama mantığı

### Ana servis

- [src/server/services/api-key-service.ts](/Users/ufuk/yzapi/src/server/services/api-key-service.ts)
  - `generateApiKey()`
  - `hashApiKey(fullKey)`
  - `encryptApiKey(fullKey)`
  - `decryptApiKey(payload)`
  - `validateApiKey(headerValue)`

### Gözlenen teknik davranış

- Key formatı: `yzk_live_<24 hex>`
- Prefix index kullanılıyor: `yzk_live_` + ilk 3 hex
- DB’de plaintext yerine:
  - `keyHash` var
  - ayrıca `fullKeyCipher` de tutuluyor
- Hash: `bcrypt`
- Cipher: `AES-256-GCM`

### API key route dosyaları

- Kullanıcı:
  - [src/server/routes/user.ts](/Users/ufuk/yzapi/src/server/routes/user.ts)
  - `GET /api/user/api-keys`
  - `POST /api/user/api-keys`
  - `POST /api/user/api-keys/:id/revoke`
- Admin:
  - [src/server/routes/admin.ts](/Users/ufuk/yzapi/src/server/routes/admin.ts)
  - `GET /api/admin/api-keys`
  - `POST /api/admin/api-keys/revoke/:id`
  - `POST /api/admin/api-keys/:userId/create`

## 4. Bakiye / kredi / usage ile ilgili DB tabloları

### Ana tablolar

- [src/server/db/schema.ts](/Users/ufuk/yzapi/src/server/db/schema.ts)
  - `users`
    - kritik alanlar: `bakiyeTL`, `toplamHarcamaTL`, `toplamIstek`, `durum`, `plan`, `apiKeyCount`, `gunlukLimitTL`, `lastLowBalanceAlert`
  - `api_keys`
    - kritik alanlar: `maskedKey`, `keyHash`, `fullKeyCipher`, `prefix`, `sonKullanim`, `aktif`
  - `transactions`
    - kritik alanlar: `tip`, `miktarTL`, `oncekiBakiye`, `sonrakiBakiye`, `metod`, `idempotencyKey`
  - `usage_records`
    - kritik alanlar: `apiKeyId`, `modelId`, `inputUsage`, `outputUsage`, `unitsUsage`, `costUsd`, `costTL`, `remainingTL`, `requestId`, `upstreamRequestId`, `rawUsageJson`, `pricingSnapshotJson`, `errorCode`, `status`
  - `payments`
    - kritik alanlar: `metod`, `miktarTL`, `kdvTL`, `netTL`, `amountUsd`, `payableTL`, `creditTL`, `kurAtPayment`, `roundingTL`, `durum`, `idempotencyKey`, `providerPayload`, `transactionId`
  - `pending_iban_payments`
  - `system_config`
    - kritik alanlar: `kur`, `liveKur`, `kurBuffer`, `textCarpan`, `imageCarpan`, `videoCarpan`, `textBillingRatio`, `maxBakiyeTL`, `minBakiyeTL`, `paymentWhatsappNumber`, `cryptoWallet*`
  - `plans`
    - kritik alanlar: `gunlukLimitTL`, `aylikLimitTL`, `izinliModeller`
  - `model_overrides`
  - `audit_logs`
  - `sessions`
  - `kur_history`
  - `provider_durumlari`
  - `whatsapp_otp_requests`
  - `whatsapp_verified_numbers`

## 5. Fiyatlandırma ve 900K -> 1M kuralı ile ilgili dosyalar

### Ana pricing yüzeyi

- [src/server/services/pricing-service.ts](/Users/ufuk/yzapi/src/server/services/pricing-service.ts)
  - `buildPricingConfig()`
  - `applyOverride()`
  - `computePrice` export edilir
- [pricing.ts](/Users/ufuk/yzapi/pricing.ts)
  - `computePrice(...)` burada çözülüyor
- [src/server/services/pricing-service.test.ts](/Users/ufuk/yzapi/src/server/services/pricing-service.test.ts)
  - `textBillingRatio: 0.9` testleri var
- [src/server/db/schema.ts](/Users/ufuk/yzapi/src/server/db/schema.ts)
  - `system_config.text_billing_ratio` default `0.9`

### Bu ne anlama geliyor

- Keşif seviyesinde güçlü işaret:
  - `textBillingRatio = 0.9`
  - rapor ve metinlerde `900k = 1M` ifadesi geçiyor
- Ama bu aşamada henüz “gerçek satın alma paketi 900K satılıyor ve her yerde 1M usable credit yazılıyor” sonucu kesinleşmedi.
- Bunun tam doğrusu Phase 2’de:
  - `pricing.ts`
  - payment init/callback
  - admin manual credit
  - UI package labels
  - geçmiş kullanıcı kayıtları
  üstünden satır satır doğrulanmalı.

## 6. Provider / upstream entegrasyonu

### Gateway ve provider akışı

- [src/server/routes/proxy.ts](/Users/ufuk/yzapi/src/server/routes/proxy.ts)
  - `requireProxy`
  - `forwardUpstreamError`
  - `resolveEnabledModel`
  - `enforceRequestGuards`
  - `setBillingHeaders`
  - `handleTextJsonEndpoint`
- [src/server/services/provider-adapter.ts](/Users/ufuk/yzapi/src/server/services/provider-adapter.ts)
- [src/server/services/closerouter-adapter.ts](/Users/ufuk/yzapi/src/server/services/closerouter-adapter.ts)
- [src/server/services/omniroute-adapter.ts](/Users/ufuk/yzapi/src/server/services/omniroute-adapter.ts)
- [src/master-models.ts](/Users/ufuk/yzapi/src/master-models.ts)
  - model catalog
  - endpoint support
  - `contextTokens`
  - aliases

### Public `/v1` katalog

- [src/server/routes/v1-catalog.ts](/Users/ufuk/yzapi/src/server/routes/v1-catalog.ts)
  - `/v1/models`
  - `/v1/models/count`
  - `/v1/providers`

## 7. Request lifecycle

### Text JSON endpoint akışı

- [src/server/routes/proxy.ts](/Users/ufuk/yzapi/src/server/routes/proxy.ts)
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
  - `POST /v1/messages`

Akış:
1. `apiKeyAuth`
2. `requireWhatsappVerified`
3. `requireProxy`
4. `enforceRequestGuards`
5. provider forward
6. `chargeUsage(...)`
7. `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id`

### Streaming lifecycle

- Aynı dosya: [src/server/routes/proxy.ts](/Users/ufuk/yzapi/src/server/routes/proxy.ts)
- Streaming chat için:
  - `activeProviderAdapter.forwardChatStream(...)`
  - stream sonunda `chargeUsage(...)`
- Şu an keşif bulgusu:
  - stream öncesi net bir rezervasyon mekanizması görünmüyor
  - sadece başlangıçta `balance > 0` guard’ı net
  - final billing stream sonrasında reconcile ediliyor

## 8. Bakiye düşümü ve atomic transaction yüzeyi

### Ana usage charge fonksiyonu

- [src/server/services/billing-service.ts](/Users/ufuk/yzapi/src/server/services/billing-service.ts)
  - `chargeUsage(...)`

### Gözlenen davranış

- `requestId` bazlı usage idempotency var
- `status === "error"` veya `costTL === 0` ise usage record yazılıp bakiye düşülmeyebiliyor
- gerçek bakiye düşümü SQL transaction içinde yapılıyor
- update biçimi:
  - `UPDATE users ... SET bakiye_tl = bakiye_tl - cost`
  - başarısızsa `InsufficientBalanceError`
- aynı transaction içinde:
  - `transactions` insert
  - `usage_records` insert

## 9. Payment / webhook / mutabakat akışı

### Ana route dosyası

- [src/server/routes/payments.ts](/Users/ufuk/yzapi/src/server/routes/payments.ts)

### User payment routes

- `GET /api/payments/methods`
- `POST /api/payments/shopier/init`
- `POST /api/payments/iban/init`
- `POST /api/payments/crypto/init`
- `GET /api/payments/me`

### Public webhook / callback routes

- `POST /api/payments/shopier/callback`
- `POST /api/payments/shopier/osb`
- `POST /api/payments/crypto/webhook`
- `GET /api/payments/crypto/callback`

### Admin payment routes

- `GET /api/payments/admin/pending-iban`
- `POST /api/payments/admin/pending-iban/:id/approve`
- `POST /api/payments/admin/pending-iban/:id/reject`
- `GET /api/payments/admin/all`

### Payment servisleri

- [src/server/services/payment-common.ts](/Users/ufuk/yzapi/src/server/services/payment-common.ts)
  - `calcKdv`
  - `creditUserBalance`
- [src/server/services/payment-pricing.ts](/Users/ufuk/yzapi/src/server/services/payment-pricing.ts)
  - `buildUsdTopupQuote`
  - yuvarlama ve USD/TL quote mantığı
- [src/server/services/payment-guards.ts](/Users/ufuk/yzapi/src/server/services/payment-guards.ts)
  - `validatePaymentAmount`
  - `isIbanConfigured`
- [src/server/services/shopier-service.ts](/Users/ufuk/yzapi/src/server/services/shopier-service.ts)
  - `buildCheckoutForm`
  - `verifyCallback`
- [src/server/services/cryptomus-service.ts](/Users/ufuk/yzapi/src/server/services/cryptomus-service.ts)
  - `createInvoice`
  - `verifyWebhook`

### Payment idempotency noktaları

- `payments.idempotencyKey` unique
- `transactions.idempotencyKey` unique
- `creditUserBalance(...)` önce `payments.durum === "basarili"` kontrol ediyor
- Cryptomus webhook `uuid` / `order_id`
- IBAN approve payment row + pending iban referansına bağlanıyor

## 10. Admin panel kontrol yüzeyi

- [src/server/routes/admin.ts](/Users/ufuk/yzapi/src/server/routes/admin.ts)
  - config
  - users
  - balance movement
  - plans
  - api keys
  - kur history
  - model overrides
  - dashboard/reconciliation
- [src/server/routes/admin-auth.ts](/Users/ufuk/yzapi/src/server/routes/admin-auth.ts)

Admin billing açısından kritik endpointler:
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/bakiye`
- `GET /api/admin/bakiye-hareketleri`
- `GET /api/admin/reconciliation`
- `GET /api/admin/reconciliation/export`
- `GET /api/admin/api-keys`
- `POST /api/admin/api-keys/revoke/:id`
- `POST /api/admin/api-keys/:userId/create`
- `GET /api/admin/plans`
- `PATCH /api/admin/plans/:id`

## 11. Log ve monitoring yüzeyi

- [src/server/lib/logger.ts](/Users/ufuk/yzapi/src/server/lib/logger.ts)
- [src/server/lib/logger-redaction.test.ts](/Users/ufuk/yzapi/src/server/lib/logger-redaction.test.ts)
- [src/server/routes/logs.ts](/Users/ufuk/yzapi/src/server/routes/logs.ts)
- [src/server/services/audit-service.ts](/Users/ufuk/yzapi/src/server/services/audit-service.ts)

Billing / usage log açısından kritik yazan yerler:
- `chargeUsage(...)`
- payment webhook handlers
- `creditUserBalance(...)`
- rate limit / insufficient balance / upstream error kayıtları

## 12. Background jobs / cron / worker yüzeyi

- [src/server/index.ts](/Users/ufuk/yzapi/src/server/index.ts)
  - `startKurRefresh()`
  - `startAllJobs()`
- İlgili job dosyaları:
  - [src/server/jobs](/Users/ufuk/yzapi/src/server/jobs)
  - burada kur refresh, monitoring veya scheduled işler doğrulanmalı

## 13. Phase 1 sonunda kritik odak alanları

Henüz fix kararı değil. Sadece yüksek riskli inceleme hedefleri:

- `textBillingRatio = 0.9` gerçekten 900K satış / 1M iç kullanım kuralı mı
- stream öncesi rezervasyon yok gibi duruyor
- `enforceRequestGuards` keşif seviyesinde sadece `balance > 0` kontrol ediyor; “tahmini maliyet yeterli mi” guard’ı henüz görünmedi
- 95K hard backend context limiti bu turda görünmedi
- rate limit:
  - per-key in-memory token bucket var
  - per-user / per-IP / distributed store görünmedi
- user route `GET /api/user/api-keys` aktif key için `decryptApiKey(fullKeyCipher)` ile full key döndürüyor; güvenlik ve dağıtım riski ayrıca denetlenmeli

## 14. Phase 2 için doğrudan incelenecek dosyalar

- [pricing.ts](/Users/ufuk/yzapi/pricing.ts)
- [src/server/services/billing-service.ts](/Users/ufuk/yzapi/src/server/services/billing-service.ts)
- [src/server/routes/proxy.ts](/Users/ufuk/yzapi/src/server/routes/proxy.ts)
- [src/server/services/provider-adapter.ts](/Users/ufuk/yzapi/src/server/services/provider-adapter.ts)
- [src/server/routes/payments.ts](/Users/ufuk/yzapi/src/server/routes/payments.ts)
- [src/server/services/payment-pricing.ts](/Users/ufuk/yzapi/src/server/services/payment-common.ts)
- [src/server/services/api-key-service.ts](/Users/ufuk/yzapi/src/server/services/api-key-service.ts)
- [src/server/services/rate-limit-service.ts](/Users/ufuk/yzapi/src/server/services/rate-limit-service.ts)
