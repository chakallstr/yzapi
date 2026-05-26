# YapayZekaLab Mimari Haritası

Operasyon tarihi: 2026-05-26

## Repo ve Stack

- Repo: `/Users/ufuk/yzapi`
- Branch: `phase/release-vps-beta`
- Frontend: React SPA + Vite, ana dosya `src/App.tsx`
- Backend: Express + TypeScript, entry `src/server/index.ts`
- DB: PostgreSQL + Drizzle, schema `src/server/db/schema.ts`
- Test: Vitest, mevcut Playwright dependency var ama Playwright config/test dosyası ilk keşifte görülmedi.
- Paket yöneticisi: npm (`package-lock.json` mevcut)
- Deploy: VPS/systemd/nginx scriptleri ve `docker-compose.yml` içinde lokal Postgres.

## Frontend Sayfaları / Sekmeler

- Homepage: ürün anlatımı, sistem durum alanları, model mini katalog, maliyet/aktivasyon vurgusu.
- Modeller: model arama/filtreleme, text/görsel/video ayrımı, fiyat/context bilgileri.
- SSS: bakiye bazlı kullanım modeli açıklamaları.
- API: login, bakiye, API key, kod örnekleri, ilk istek akışı.
- Admin: admin login, config, kur, modeller, kullanıcılar, bakiye, duyurular, sistem/audit, gelir, API keys, planlar, pending IBAN.

## Backend Route Haritası

### Public/System

- `GET /health`
- `GET /status`
- `GET /api/models`
- `GET /api/announcements/active`
- Bilinmeyen `/api/*`: JSON 404
- Bilinmeyen `/v1/*`: JSON 404

### Auth/User

- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/user/me`
- `GET /api/user/api-keys`
- `POST /api/user/api-keys`
- `POST /api/user/api-keys/:id/revoke`
- `GET /api/user/usage-records`

### API Gateway

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`
- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/videos/submit` şu an 501
- `GET /v1/videos/tasks/:taskId` şu an 501

### Admin

- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET/POST /api/admin/config`
- `POST /api/admin/refresh-kur`
- `GET /api/admin/kur-history`
- `GET/POST /api/admin/model-overrides`
- `DELETE /api/admin/model-overrides/:modelId`
- `GET /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/bakiye`
- `GET /api/admin/bakiye-hareketleri`
- `GET/POST/PATCH/DELETE /api/admin/announcements`
- `GET /api/admin/provider-durumu`
- `PATCH /api/admin/provider-durumu/:provider`
- `GET /api/admin/audit-logs`
- `GET /api/admin/dashboard`
- `GET /api/admin/reconciliation`
- `GET /api/admin/reconciliation/export`
- `GET /api/admin/plans`
- `PATCH /api/admin/plans/:id`
- `GET /api/admin/api-keys`
- `POST /api/admin/api-keys/revoke/:id`
- `POST /api/admin/api-keys/:userId/create`

### Payments

- `GET /api/payments/methods`
- `POST /api/payments/shopier/init`
- `POST /api/payments/shopier/callback`
- `POST /api/payments/iban/init`
- `POST /api/payments/crypto/init`
- `POST /api/payments/crypto/webhook`
- `GET /api/payments/crypto/callback`
- `GET /api/payments/me`
- `GET /api/payments/admin/pending-iban`
- `POST /api/payments/admin/pending-iban/:id/approve`
- `POST /api/payments/admin/pending-iban/:id/reject`
- `GET /api/payments/admin/all`

## Veritabanı Tabloları

- `system_config`: kur, çarpanlar, min/max bakiye, auto kur ayarları.
- `users`: kullanıcı, bakiye, harcama, istek, plan, durum.
- `api_keys`: masked key, hash, prefix, aktiflik.
- `plans`: limitler ve izinli modeller.
- `model_overrides`: model aktifliği ve fiyat override.
- `announcements`: duyurular.
- `provider_durumlari`: provider health/status.
- `transactions`: bakiye hareketleri ve idempotency key.
- `usage_records`: model kullanımı, maliyet, kalan bakiye, request id, upstream usage.
- `audit_logs`: hassas aksiyon kayıtları.
- `kur_history`: kur geçmişi.
- `sessions`: refresh/access session kayıtları.
- `payments`: Shopier/IBAN/Cryptomus ödeme kayıtları.
- `pending_iban_payments`: manuel banka havalesi onay kuyruğu.

## Auth Flow

- Admin auth: Ayrı admin şifresi yoktur. Admin endpointleri normal user JWT ister; backend DB'den kullanıcı emailini okuyup sadece `cix.crazy666@gmail.com` için izin verir.
- User auth: Google OAuth callback kullanıcıyı bulur/oluşturur, access/refresh token üretir.
- User endpointleri `Authorization: Bearer <user JWT>` ister.
- API gateway endpointleri `Authorization: Bearer yzk_live_*` ister.
- Admin endpointleri `Authorization: Bearer <user JWT>` ister; email allowlist backend tarafında zorunludur.

## API Key Flow

- Kullanıcı `POST /api/user/api-keys` ile key üretir.
- Tam key yalnız oluşturma response'unda dönmelidir.
- DB tarafında `keyHash`, `maskedKey`, `prefix`, `aktif` alanları vardır.
- Revoke endpointi keyi pasif yapar.
- `/v1` middleware önce `Bearer yzk_live_` prefixini, sonra hash doğrulamasını kontrol eder.

## API Usage / Billing Flow

- `/v1` route önce model desteği, model aktifliği, rate limit ve pozitif bakiye kontrolü yapar.
- CloseRouter provider adapter üzerinden upstream çağrısı yapılır.
- Başarılı non-stream text/image çağrılarında `chargeUsage` çalışır.
- Response headerları: `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id`.
- `usage_records` ve `transactions` ile kanıt ve bakiye hareketi yazılır.
- Provider hatasında cost `0` usage kaydı bırakılacak şekilde kod yolu var.
- Video endpointleri stub ve 501 döner.

## Payment Flow

- `GET /api/payments/methods`: Shopier/Cryptomus env varsa enabled; IBAN her zaman enabled.
- Shopier init: ödeme satırı oluşturur, signed checkout form döner.
- Shopier callback: signature doğrular; success ise `creditUserBalance` çağırır.
- IBAN init: payment + pending iban oluşturur; admin approve sonrası balance credit.
- Cryptomus init: invoice oluşturur; webhook imzası ve status `paid/paid_over` ise credit.
- Crypto browser callback yalnız redirect yapar; balance credit webhook tarafında olmalıdır.
- `creditUserBalance` idempotency key ile çift credit riskini kontrol etmelidir.

## Admin Flow

- Admin login parola bazlıdır; email bazlı admin kısıtı ilk statik okumada açık görünmedi.
- Admin panelde config, kur, model override, users, balance adjustment, announcements, provider status, audit logs, reconciliation, plans ve API key yönetimi bulunur.
- Admin endpointleri `adminAuth` middleware ile korunur.

## Webhook Flow

- Shopier callback `express.urlencoded` ile alınıp HMAC/signature doğrulanır.
- Cryptomus webhook JSON body ile alınıp servis imza doğrulaması yapar.
- Invalid signature credit vermemelidir.
- Duplicate webhook idempotency key ile çift credit vermemelidir.

## Job / Cron Flow

- Kur refresh job: her saat başı (`0 * * * *`), `autoKurRefresh` aktifse kur yeniler.
- Low balance scan: her saat 15. dakika (`15 * * * *`).
- Daily report: her gün 09:00 (`0 9 * * *`).
- Email servisleri welcome, low balance, payment receipt, daily report ve kur warning destekliyor.

## Bilinen Eksik / Belirsiz Alanlar

- Slack/Discord webhook entegrasyonu ilk keşifte görünmedi.
- Sandbox/test API key özel quota akışı ilk keşifte görünmedi.
- Ayrı monthly usage report endpointi ilk keşifte görünmedi.
- API key edit/PATCH endpointi ilk keşifte görünmedi; create/list/revoke mevcut.
- `/docs` route açıkça görünmedi.
- Admin kısıtı email bazlı değil, parola/JWT rol bazlı görünüyor.
- Video endpointleri 501; frontend bunu production-ready gibi göstermemeli.
- Başarılı canlı `/v1` testi için gerçek upstream key ve funded user gerekir.
