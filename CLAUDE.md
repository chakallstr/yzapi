# YapayZekaLab (yzapi) — CLAUDE.md

Son güncelleme: 2026-05-24 22:37 · Kaynak: Codex doğrulama turu

## Proje

Express + TypeScript API. Kullanıcı bakiye yükler, API key alır, model bazlı kullanım kadar bakiyeden düşer.

- Repo: `/Users/ufuk/yzapi`
- Deploy hedefi: VPS first, Nginx reverse proxy + systemd servis
- App dizini: `/opt/yapayzekalab`

## Aktif Kararlar

| Konu | Karar |
|---|---|
| Fiyatlama modeli | Paket yok. Bakiye/kredi bazlı düz satış. |
| Text carpanı | `provider_fiyat × 3.00` |
| Faturalama token | `real_tokens / 0.90` → 900K gerçek = 1M faturalama |
| Efektif carpan | ~3.3333x |
| Minimum yükleme | 250 TL |
| KDV | Dahil fiyatlama |
| Kur | Canlı USD/TRY + %3 buffer |
| Routing | Kendi backend `ProviderAdapter` katmanı; MVP upstream `CloseRouter`, 9Router sadece Faz-2 POC/fallback adayı |
| Saklama | 30 gün prompt/cevap hedefi |
| Slogan | "Kota yok, gizli limit yok. Bakiye yükle, kullandığın kadar öde." |

## API Endpointleri

- `/health`
- `/api/admin`
- `/api/auth`
- `/api/user`
- `/api/payments`
- `/v1/chat/completions` (proxy)
- `/v1/responses` (proxy)
- `/v1/messages` (proxy)
- `/v1` image generation/edit
- `/v1` video → **501 şu an**

## Servisler

`auth`, `billing`, `pricing`, `closerouter`, `cryptomus`, `shopier`, `payment-common`, `email`, `kur`, `audit`, `api-key`, `google-oauth`, `rate-limit`

## Kritik Bloklar (Codex çözmesi gereken)

1. **Canlı VPS deploy** — `scripts/vps-deploy.sh` lokal syntax/test kapısından geçmeli; gerçek VPS'e deploy bu turda yapılmadı.
2. **Pricing public scan** — müşteri/public yüzeyde formül, çarpan ve eski fiyat varsayımı görünmemeli; dahili pricing dosyaları ayrı tutulmalı.
3. **Image/video live usage** — görsel ve video birimleri gerçek upstream usage kanıtı alınmadan production-ready diye pazarlanmayacak.
4. **9Router POC** — sadece `ProviderAdapter` arkasında, kapalı/deneysel akış olarak düşünülür; ana satış/billing katmanı yapılmaz.

## Son Codex Aktivitesi (2026-05-24 ~22:20)

| Faz | Durum | Kanıt |
|---|---|---|
| Faz 0 baseline | Tamam | `git diff --check`, `npm run lint`, `npm test`, `npm run build` geçti |
| Faz 1 ledger/metering | Tamam | Usage kanıt alanları, atomic charge, request id idempotency; 57 test kapısı güncel |
| Faz 2 proxy/provider gate | Tamam | API key, error handler, CloseRouter upstream testleri; production static yüzeyi daraltıldı |
| Faz 3 IBAN/müşteri usage | Tamam | `creditUserBalance` testleri; `GET /api/user/usage-records` eklendi |
| Faz 4 admin/security | **TAMAM** | `routes/admin.ts` (24KB) + `reconciliation-service.ts` + `status-service.ts` eklendi |
| Faz 5 VPS deploy | Devam | Deploy scripti DB health, `/status`, model count ve JSON 404 smoke kontrolü yapacak şekilde sertleştirildi |
| Faz 6 müşteri aktivasyon | Devam | API sekmesine giriş → bakiye → API key → ilk istek → usage akışı eklendi |

### Güncel Kod Kararları

- `usage_records` artık `request_id`, `upstream_request_id`, `raw_usage_json`, `pricing_snapshot_json`, `remaining_tl`, `error_code` taşır.
- `chargeUsage` başarılı kullanımda bakiye düşümü, transaction ve usage kaydını tek DB transaction sınırında yapar.
- Hatalı provider çağrısı bakiye düşmez; cost `0` usage kanıtı bırakır.
- Streaming final usage gelmezse `stream_missing_usage` olarak kayıt edilir.
- Müşteri API key tam değeri sadece oluşturma response'unda döner; create/revoke audit log'a düşer.
- `scripts/vps-deploy.sh` artık `/health` içinde `checks.db="ok"`, `/status`, `/api/models=33` ve bilinmeyen `/v1/*` için JSON `404` arar.

## Son Codex Aktivitesi (2026-05-24 ~22:37)

| Dosya | Ne Yapıldı |
|---|---|
| `src/server/services/status-service.ts` | Deploy manifest okuyucu `.deploy/releases/*.json` kayıtlarını da okur; `backup_file` alanı desteklendi. |
| `scripts/vps-smoke.mjs` | Smoke kapısına `/status` 200, `checks.db="ok"` ve `modelCount=33` kontrolü eklendi. |
| `scripts/vps-deploy.sh` | Deploy manifesti `.deploy/releases/<deploy_id>.json` olarak yazılıyor; smoke sonucu manifest içine işleniyor. |
| `scripts/vps-ops-status.sh` | VPS üzerinde systemd, nginx, port, disk/memory ve son logları tek komutla raporlayan ops scripti eklendi. |
| `src/server/routes/admin.ts` | Admin reconciliation JSON ve CSV export endpointleri eklendi. |
| `src/App.tsx` | API sekmesine müşteri aktivasyon akışı ve Text API Beta uyarısı eklendi; giriş yapılmadan admin endpointlerine istek atılması engellendi. |
| `README.md` | `/status`, reconciliation export, deploy manifesti, smoke ve public scan komutları kalıcı özete eklendi. |

### 22:37 Doğrulama Kanıtı

- `bash -n scripts/vps-setup.sh scripts/vps-deploy.sh scripts/vps-ops-status.sh` geçti.
- `node --check scripts/vps-smoke.mjs && node --check scripts/scan-public-bundle.mjs` geçti.
- `npm run lint` geçti.
- `npm test` geçti: 12 test dosyası, 61 test.
- `npm run build` geçti.
- `npm run scan:public` geçti: 3 dosya tarandı, hit yok.
- Local production smoke geçti:
  - `/health: ok db: ok`
  - `/status: ok models: 33`
  - `/api/models: 33`
  - `/v1/chat/completions unauth: 401`
  - bilinmeyen `/api/*` ve `/v1/*`: JSON `404`
- Browser kontrolünde API sekmesi açıldı; aktivasyon akışı göründü; public body text içinde `çarpan|billing ratio|formül` izi yok.
- Canlı test API key olmadığı için başarılı chat ve düşük bakiye `402` smoke maddeleri `manual-live-required` kaldı.

## Son Codex Aktivitesi (2026-05-24 ~22:46)

| Alan | Durum |
|---|---|
| Branch | `phase/release-vps-beta` oluşturuldu |
| Agent team | Eski 6 agent id'si sorgulandı; 5 gerçek çıktı alındı, 1 agent beklemede kaldı |
| Backend commit | `a215d12 feat: add backend gateway core` |
| Deploy commit | `ea7dd1a chore: add VPS release tooling` |
| Frontend commit | `57a85a3 feat: add customer activation panel` |
| Yeni kayıt | `agent-team/RELEASE_VPS_BETA_AGENT_TEAM_2026-05-24.md` |
| Yeni checklist | `docs/release-vps-beta-checklist.md` |
| Remote branch | `origin/phase/release-vps-beta` |
| PR link | `https://github.com/chakallstr/yzapi/pull/new/phase/release-vps-beta` |

### 22:46 Ek Kararlar

- Release snapshot kör `git add .` yapılmadan gruplandı.
- Admin panelde Sistem & Audit içine `Mutabakat` sekmesi eklendi; reconciliation JSON ve CSV export artık UI'dan erişilebilir.
- Canlı deploy hâlâ blocker: VPS erişimi, `.env.production`, DNS ve test API key olmadan canlı başarı/402 smoke tamam sayılamaz.

## Son Codex Aktivitesi (2026-05-24 ~22:58)

| Alan | Durum |
|---|---|
| Yeni script | `scripts/vps-live-preflight.sh` |
| Yeni npm komutu | `npm run preflight:live` |
| Canlı DNS | `yapayzekalab.org -> 77.92.151.228` |
| Canlı HTTP | `/health=503`, `/status=503`, `/api/models=not-json` |
| VPS read-only | `vps` alias erişildi; `/opt/yapayzekalab` missing, `.env.production` missing, `yapayzekalab` service inactive, Nginx config ok |

### 22:58 Sonuç

- Faz 2 canlı VPS deploy hâlâ BLOCKER.
- Preflight kanıtı artık tek komutla alınır: `VPS_ALIAS=vps DOMAIN=yapayzekalab.org npm run preflight:live`.
- Tamam saymak için domain VPS IP'sine alınmalı, app `/opt/yapayzekalab` altına kurulmalı, `.env.production` `600` izinle oluşturulmalı, servis active olmalı, sonra gerçek `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` ile smoke geçmeli.

## Son Codex Aktivitesi (2026-05-24 ~23:04)

| Alan | Durum |
|---|---|
| Yeni plan | `docs/superpowers/plans/2026-05-24-yapayzekalab-next-phases.md` |
| Ruflo plan swarm | `swarm-1779653015913-xntzke`, healthy, `agentCount=0` |
| Worker spawn | `Hive-mind not initialized` |
| Native agent spawn | `agent thread limit reached` |
| VPS OS | `CentOS Stream 8` |
| Sıradaki gerçek faz | Phase 2A: `scripts/vps-setup.sh` CentOS/RHEL uyumu |

### 23:04 Karar

- Mevcut `vps` Ubuntu değil; Nginx `/etc/nginx/conf.d` kullanıyor. Bu yüzden canlı deploydan önce setup scripti `apt-get/sites-enabled` varsayımından çıkarılmalı.
- Faz 2 sırası: CentOS setup patch → app bootstrap → production env/smoke key → localhost deploy smoke → DNS/certbot/public smoke → rollback drill.

## Son Codex Aktivitesi (2026-05-24 ~22:32)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/App.tsx` | 22:36 | **YENİ/GÜNCELLEME (177.6KB)** — Tam admin+user SPA frontend. 22:36'da küçük düzeltme (+148 byte). Lucide icon'ları, `RoutingLog`, `RouterSettings`, `AdminConfig`, `ModelOverride`, `UserEntry`, `BakiyeHareketi`, `SystemAnnouncement`, `ProviderDurumu`, `AuditLog` tipleri. SSS verisi, ComputedModel interface (type/context/endpoints/computed fiyat). Faz 4 admin router'ın frontend karşılığı. |

## Son Codex Aktivitesi (2026-05-24 ~22:33)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/services/status-service.ts` | 22:33 | **GÜNCELLEME** — `readLatestDeployRecord()` artık `.deploy/releases/` alt dizinini de tarıyor (Faz 5 deploy scripti `releases/*.json` yazacak). JSON parse'da `backup_file` fallback eklendi (`backup_file ?? db_backup ?? backupFile`). |

### Deploy Kayıt Yapısı (22:33)
- Deploy kayıtları: `.deploy/*.txt` veya `.deploy/*.json` veya `.deploy/releases/*.json`
- En son kayıt: lexicographic sort (descending) → ilk eleman
- JSON alanları: `deploy_id/deployId`, `previous_rev/previousRev`, `backup_file/db_backup/backupFile`, `smoke`

### SPA Frontend Mimarisi (22:32)
- `src/App.tsx` Express SPA'nın tek React kök bileşeni (Vite build → `dist/`)
- Admin fonksiyon grubu: config, model override, kullanıcı, plan, API key, transaction, audit, kur, duyuru, provider durumu
- `ComputedModel.computed` → fiyat hesabı frontend'de de yapılıyor (gösterim amaçlı)

## Son Codex Aktivitesi (2026-05-24 ~22:31) — FAZ 4 TAMAM

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/services/reconciliation-service.ts` | 22:30 | **YENİ** — Muhasebe reconciliation: `users.bakiye_tl` (gerçek bakiye) vs `SUM(transactions.miktar_tl)` (ledger toplamı) karşılaştırır. Drift ≥ 0.0001 TL olan kullanıcıları listeler. Paralel SQL: global totals + per-user drift. Rapor `status: "ok" \| "drift"`. |
| `src/server/services/status-service.ts` | 22:30 | **YENİ** — Health/status mantığı `index.ts`'den servis'e taşındı. `getStatusSnapshot()` → db+closerouter+api check, deploy kaydı `.deploy/` dizinden okunur (JSON/txt), kur refresh zamanı, MASTER_MODELS.length (model sayısı). |
| `src/server/routes/admin.ts` | 22:31 | **YENİ (24KB)** — Tam admin router: config CRUD (kur/carpan/minBakiye/maxBakiye), model-overrides, kullanıcı listesi/detay/güncelleme, plan CRUD, API key listeleme/iptal, transaction geçmişi, audit log, kur yenileme, duyurular, provider durumları, reconciliation endpoint (`GET /admin/reconciliation`). Tüm serialize helper'lar timestamp'leri ISO'ya çevirir. |

### Test Kararları (22:31)
- `reconciliation-service.test.ts`: 2 test — balance=ledger → `status:"ok"`, drift 20TL → `status:"drift"` + userDrifts array
- `status-service.test.ts`: 2 test — DB ok + closerouter unknown → `"ok"`, DB fail → `"degraded"`
- `deriveStatus` sadece DB'ye bakar, closerouter/upstream'e değil

### Faz 4 Kararları (22:30-22:31)
- Reconciliation drift eşiği: `>= 0.0001 TL` (floating point güvenli)
- Status servis deploy kaydını `DEPLOY_STATE_DIR` (default `.deploy/`) altından okur; JSON ve düz-text formatını destekler
- Admin config güncellemesi `writeAudit("config_update", ...)` ile loglanır
- `routes/admin.ts` faz 4'ün çekirdeği — 24KB, 10+ endpoint grubu

## Son Codex Aktivitesi (2026-05-24 ~22:24)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/index.ts` | 22:24 | **GÜVENLİK** — `/v1` allowlist middleware eklendi. `apiKeyAuth`'dan ÖNCE path kontrolü yapılıyor: `chat/completions`, `responses`, `messages`, `images/generations`, `images/edits`, `videos/submit`, `videos/tasks/:id` dışındaki her `/v1/*` isteği 404 döner. Bilinmeyen endpoint'lere API key bile harcanmıyor. |

### /v1 Routing Kararı (22:24)
- Allowlist: 7 route pattern (regex), exhaustive list
- Bilinmeyen path → 404 JSON (requestId dahil), apiKeyAuth çağrılmaz
- Güvenlik amacı: `/v1/anything` tarzı probe'ları key tüketmeden bloklar

## Son Codex Aktivitesi (2026-05-24 ~22:09)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/routes/user.ts` | 22:09 | **GÜNCELLEME** — Kullanıcı API route'ları: `GET /me` (passwordHash strip), `GET /api-keys` (sadece aktif, masked), `GET /usage-records` (son 100, numeric cast), `POST /api-keys` (generateApiKey, hashApiKey, `yzk_live_` prefix), `POST /api-keys/:id/revoke` (userId guard) |

### Kullanıcı API Kararları (22:09)
- `passwordHash` hiçbir zaman response'a dönmez (strip edilir)
- API key oluşturma: sadece full key bir kez döner, sonra masked
- Usage-records limit: 100 kayıt, desc timestamp

## Son Codex Aktivitesi (2026-05-24 ~22:07)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/services/payment-common.test.ts` | 22:07 | **YENİ** — `calcKdv` 7 test: %20 KDV math, net+kdv=gross, sıfır, küçük tutar, 4 decimal round, büyük tutar. `creditUserBalance` 2 test: başarılı yükleme (idempotencyKey `pay_<ref>`, oncekiBakiye+miktarTL=sonrakiBakiye), zaten ödenmiş ödeme → `{alreadyCredited:true}` |

### Ödeme Kararları (22:07 testlerden)
- KDV oranı: `KDV_RATE=0.20` (env default) — net = gross/1.20
- `creditUserBalance` idempotency: `durum=basarili` ise tekrar DB transaction çağrılmaz
- idempotency key formatı: `pay_<referansKodu>`

## Son Codex Aktivitesi (2026-05-24 ~22:05)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/index.ts` | 22:05 | **GÜNCELLEME** — Express entry tam wired: `requestId` + `httpLogger` → `/health` (DB+kur+CloseRouter check, 2s timeout) → `/api/admin`, `/api/auth`, `/api/user`, `/api/payments`, `/v1` (apiKeyAuth guard) → 404 JSON catch → `errorHandler`. Production: static assets `dist/assets/` + SPA fallback. Dev: Vite middleware. `startKurRefresh()` + `startAllJobs()` on boot. |

### Route Wiring Kararı (22:05)
- `/v1` → `apiKeyAuth` middleware → `proxyRouter` (tüm model endpointleri burada)
- `/health` → DB ping + kur yaşı + CloseRouter ping (2s timeout) — 503 sadece DB fail'de
- SPA ve API birlikte: `/api`, `/v1` miss'leri 404 JSON döner, diğerleri SPA index.html'e düşer

## Son Codex Aktivitesi (2026-05-24 ~22:04 — tüm middleware + CloseRouter testleri)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/services/closerouter-service.test.ts` | 22:04 | **YENİ** — `nock` ile HTTP mock: (1) `/responses` → `input_tokens/output_tokens` → `{promptTokens,completionTokens}` dönüşümü, (2) `/messages` → `prompt_tokens/completion_tokens` dönüşümü, (3) upstream 503 → hata objesi `{status,body}` ile throw |
| `src/server/middleware/api-key-auth.test.ts` | 22:04 | **YENİ** — 3 test: `yzk_live_` prefix yoksa 401, DB geçersiz → 401, geçerli → `req.user/apiKey` attach + `next()` |
| `src/server/middleware/error-handler.test.ts` | 22:04 | **YENİ** — 3 test: `InsufficientBalance→402`, `ModelDisabled→403`, `RateLimit→429+Retry-After` |

### CloseRouter Token Format (testlerden doğrulandı)
- `/responses` yanıtında: `usage.input_tokens` + `usage.output_tokens`
- `/messages` yanıtında: `usage.prompt_tokens` + `usage.completion_tokens`
- Upstream hata: `{status: number, body: object}` formatında throw edilir

## Son Codex Aktivitesi (2026-05-24 ~22:04)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/middleware/api-key-auth.test.ts` | 22:04 | **YENİ** — 3 test: (1) `yzk_live_` prefix yoksa 401, (2) DB'de geçersiz/revoked key → 401, (3) geçerli key → `req.user` + `req.apiKey` attach, `next()` çağrılır |
| `src/server/middleware/error-handler.test.ts` | 22:04 | **YENİ** — 3 test: `InsufficientBalanceError` → 402 + requestId, `ModelDisabledError` → 403, `RateLimitError` → 429 + `Retry-After` header |

### API Key Format Kararı (22:04 testlerden)
- API key prefix: `yzk_live_` (örn: `yzk_live_abc123`) — `Bearer` olmadan geçersiz
- Error HTTP mapping: `InsufficientBalance→402`, `ModelDisabled→403`, `RateLimit→429+Retry-After`

## Son Codex Aktivitesi (2026-05-24 ~22:01)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/services/billing-service.test.ts` | 22:01 | **YENİ** — `chargeUsage` için 4 Vitest testi: (1) yetersiz bakiye → `InsufficientBalanceError` + error kayıt, (2) status=error → costTL=0, bakiye düşme yok, (3) başarılı işlem → 3 DB sorgu atomik transaction, (4) aynı requestId → `alreadyCharged:true` döner, DB hit yok (idempotency) |

### Test Kararları (22:01)
- `mockDbSqlBegin` kullanılıyor — gerçek DB değil mock transaction
- `computePrice` mock: input=750 TL/M, output=3000 TL/M → 1000+500 token = `2.25 TL` (test 3'te doğrulandı)
- `findExistingCharge` idempotency testi ayrı case olarak yazıldı

## Son Codex Aktivitesi (2026-05-24 ~21:54)

| Dosya | Saat | Ne Yapıldı |
|---|---|---|
| `src/server/db/schema.ts` | 21:52 | **GÜNCELLEME** — Drizzle ORM şeması tam tamamlandı: `systemConfig` (kur/carpan/billingRatio), `users`, `apiKeys`, `plans`, `modelOverrides`, `transactions`, `usageRecords`, `payments`, `pendingIbanPayments`, `sessions`, `auditLogs`, `kurHistory` |
| `src/server/services/billing-service.ts` | 21:53 | **GÜNCELLEME** — `chargeUsage` tam pipeline: idempotency (`requestId` → `findExistingCharge`), model tipine göre maliyet (`Metin`=token/M, `Görsel`=image count, `Video`=saniye×çözünürlük), atomic PostgreSQL transaction (bakiye düşürme + usage record), hata durumunda cost=0 kayıt |
| `src/server/routes/proxy.ts` | 21:54 | **BÜYÜK GÜNCELLEME** — `enforceRequestGuards` (model çözümleme + rate limit + bakiye ön kontrolü), `/v1/images/generations`, `/v1/images/edits` gerçek implementasyon (imageCount billing), `/v1/videos/submit` ve `/v1/videos/tasks/:taskId` stub (501), streaming billing out-of-band, `setBillingHeaders` (X-YZ-Cost-TL, X-YZ-Remaining-TL, X-YZ-Request-Id) |

### Kilit Mimari Kararlar (21:52-21:54)

- **Billing idempotency**: `usage_records.request_id` unique index → aynı `requestId` ikinci kez gönderilirse double-charge yok
- **Atomic deduction**: `UPDATE users SET bakiye_tl = bakiye_tl - cost WHERE bakiye_tl >= cost RETURNING ...` — tek sorgu, yarış yok
- **Error path no-charge**: status=error veya costTL=0 ise bakiye düşmez, usage record yine de yazılır
- **Stream billing**: `forwardChatStream` tamamlanınca out-of-band `chargeUsage` çağrılır (fire-and-forget, hata loga düşer)
- **Video endpoints**: Phase D olarak işaretlendi, 501 döndürüyor

## Son Codex Aktivitesi (2026-05-24 ~17:02)

- **Sistem kurulum turu** (17:00): `/v1/responses` ve `/v1/messages` eklendi. Proxy guard artik model endpoint desteğini, admin `model_overrides.enabled=false` durumunu, rate limit ve bakiye ön kontrolünü provider'a gitmeden denetliyor. VPS hedefi için `deploy/vps/`, `scripts/vps-setup.sh`, `scripts/vps-deploy.sh`, `docs/vps-deploy.md` eklendi. Production env dosyası `.env.production` olarak destekleniyor.
- **Proxy/Auth API spec** (17:07): `docs/proxy-and-auth-apis.md` YENİ (29KB) — CloseRouter API tam spec: canonical domain `closerouter.dev`, bearer auth prefix `closerouter_`, `/v1/models` auth-gerekli, `POST /v1/keys` key yönetimi. Google OAuth 2.0 web server flow da belgelendi. README güncellendi (1315b) — aktif mimari kararı, `ProviderAdapter` + CloseRouter upstream, VPS deploy ref eklendi.
- **Test + env refactor** (17:04): `src/server/lib/env.ts` production'da `.env.production` okuyacak şekilde güncellendi; `closerouter-service.test.ts` 2 test eklendi; `__tests__/setup.ts` CloseRouter test key ayarıyla güncellendi.
- **Env validation** (17:04): `src/server/lib/env.ts` YENİ — Zod schema ile tüm env var'lar tip güvenli. Required: `DATABASE_URL`, `ADMIN_PASSWORD`, `JWT_SECRET`. Optional (graceful degrade): `CLOSEROUTER_API_KEY`, `SHOPIER_*`, `CRYPTOMUS_*`, `RESEND_API_KEY`. `KDV_RATE` default `0.20`, JWT access 15dk / refresh 30 gün.
- **Error handling refactor** (17:02): `src/server/lib/errors.ts` YENİ — typed error hiyerarşisi: `AppError`, `InsufficientBalanceError`, `RateLimitError`, `ModelNotFoundError`, `ModelDisabledError`, `BadRequestError`. `proxy.ts` (10910 bytes, +2KB) ve `closerouter-service.ts` (7105 bytes) bu typed error'ları import ediyor. `InsufficientBalance → 402`, `RateLimit → 429` gibi HTTP kodu eşlemesi düzgün yapıldı.

- **Router kararı kesinleşti** (16:51): `agent-team/ROUTER_DECISION_2026-05-24.md` oluşturuldu. MVP = `YapayZekaLab Backend → CloseRouter`. 9Router ana satış katmanı DEĞİL — sadece Faz-2 POC/fallback (feature flag arkasında). Billing/auth/ledger her zaman bizim backend'de kalır.
- **Provider Adapter refactor** (16:51): `src/server/services/provider-adapter.ts` YENİ — `ProviderAdapter` interface + `CloseRouterAdapter` + `activeProviderAdapter` singleton. `proxy.ts` (8859b) adaptör üzerinden çalışıyor.
- **CODEX_IDE_HANDOFF.md** (16:52): Yeni Codex session'ı için hazırlık prompt'u oluşturuldu — mevcut karar ve 10 agent rolü özetlendi.
- **dist/ rebuild** (16:53): `.env.example` ve `.htaccess` güncellendi, yeni build tamamlandı.

- **503 kurtarma turu**: 6 normal agent hattı istenerek başlatılmaya çalışıldı; agent aracı `agent thread limit reached` verdi. Hatlar koordinatör tarafından sırayla yürütüldü.
- **Deploy mismatch fix**: `npm run build` artık `dist/server/db/migrate.js`, `dist/server/db/seed.js`, migration SQL klasörü ve `dist/.htaccess` üretiyor. Kanıt: build sonrası tüm dosyalar mevcut.
- **`model-catalog.test.ts` YENİ** (18:16): `src/server/services/model-catalog.test.ts` — CloseRouter snapshot'ı vs `MASTER_MODELS` 3 test: (1) ID seti eşit, (2) token/saniye fiyat eşleşmesi, (3) tam metadata eşleşmesi. `master-models.ts` interface'ine eklenmesi gereken alanlar: `providerSlug`, `contextTokens`, `maxOutputTokens`, `aliases`, `inputModalities`, `outputModalities`, `pricingUnit`, `endpointDetails`, `supportedParameters`.
- **CloseRouter derin tarama + sync tamamlandı** (17:28): Tek seferlik tarama API key oluşturuldu, kullanıldı, revoke edildi. 33 model tam endpoint taraması yapıldı. Fiyat düzeltmeleri (`claude-sonnet-4.6` 0.25→0.255, `kimi-k2.5` output 0.37→0.38) sonrası `local-diff` yeniden üretildi → **`localDiffCount=0`** (master-models.ts CloseRouter kataloğu ile tam senkron). TL fiyatlar: ByteDance 480p=TL2.375/sn, 720p=TL5.339/sn, 1080p=TL12.013/sn. Risk: CloseRouter görsel modelleri `usd_per_million_tokens` döndürüyor — "$/image" varsayımı tehlikeli, canlı request ile ayrıca doğrulanmalı.
- **`src/master-models.ts` YENİ** (17:25): Kanonik model kayıt defteri — 33 model, tip: Metin/Görsel/Video. Provider dağılımı: Google×10, OpenAI×6, ByteDance×4, Anthropic×4, Kling×3, diğerleri×6. `providerInputUsd`, `providerOutputUsd`, `providerPerSecond` (480p/720p/1080p) alanları var.
- **ByteDance video fiyat güncellemesi** (17:27, WORKLOG): `seedance-2.0/edit/extend/i2v` 4 model — 480p=$0.016815/sn, 720p=$0.0378/sn, 1080p=$0.08505/sn. `pricing/fiyat-master.md` güncellendi.
- **VPS doğrulama tamamlandı** (17:12): `npm test` 7 dosya 43 test — `/v1/responses` + `/v1/messages` forwarder testleri eklendi. `bash -n vps-setup.sh` ve `bash -n vps-deploy.sh` syntax temiz. Local smoke: `/health` 200 `db:"ok"`, `/api/models` 33 model, `/v1/chat/completions` auth yokken 401. Canlı VPS deploy bu turda kapsam dışı.
- **Güncel gate**: `npm run lint` geçti; `npm test` geçti (7 dosya, 43 test); `npm run build` geçti; local production probe `db:"ok"` ve 33 model döndürdü.

## Router Kararı (2026-05-24)

- Ana satış/bakiye sistemi 9Router üstüne kurulmayacak; müşteri hesabı, TL bakiye, ödeme/KDV, API key, usage log ve admin fiyat kontrolü YapayZekaLab backendinde kalacak.
- MVP akışı: `Müşteri → YapayZekaLab API Backend → CloseRouter`.
- Faz-2 opsiyon: `Müşteri → YapayZekaLab API Backend → ProviderAdapter → 9Router → CloseRouter/diğer providerlar`.
- Kod karşılığı: `/v1` proxy artık aktif sağlayıcıyı `src/server/services/provider-adapter.ts` üzerinden çağırıyor. İlk aktif adapter `CloseRouterAdapter`.
- 10 agent kayıtlandı: `yz-01`..`yz-10`; gerçek yürütme için Ruflo provider anahtarı yok, native agent açma ise `agent thread limit reached` verdi. Bu yüzden yürütme koordinatör tarafından 10 hat şeklinde devam ediyor.
- **Erişim bloğu**: `.env.deploy` yok. SSH `port 22 connection refused`. Chrome/cPanel denemesi `Oturum geçersiz` durumunda kaldı; canlı restart/deploy için geçerli cPanel girişi veya API token gerekiyor.
- **Git bloğu**: Çalışma ağacında 48 dirty entry var; bu turda commit yapılmadı çünkü sadece deploy fix'ini commit etmek repo snapshot'ını eksik bırakır. Önce full workspace commit mi, temiz recovery branch mi seçilmeli.
- **Claude Code doğrulama turu**: `/Users/ufuk/Desktop/claudecode.md` okundu; `npm run lint`, `npm test`, `npm run build`, local production probe ve live endpoint probe çalıştırıldı. Kanıt dosyası: `agent-team/CLAUDECODE_VERIFICATION_2026-05-24.md`.
- **Canlı durum uyarısı**: Yerelde `/health` 200 ve `/api/models` 33 model döndü; `https://yapayzekalab.org`, `/health`, `/api/models` şu an 503 dönüyor. cPanel Passenger/stderr kontrolü ve restart/redeploy gerekiyor.
- **Güvenlik düzeltmesi**: `POST-DEPLOY.md` içindeki düz metin admin parolası kaldırıldı; yerel `.env` izni `600` yapıldı.
- **Supabase Security Advisor fix**: `packages_public` → `security_invoker=true`. Errors 0 oldu. Canlı DB/RLS düzeltmesi, kod değişmedi.
- **Testler yazıldı**: `billing-service.test.ts`, `pricing-service.test.ts`, `auth-service.test.ts`, `shopier-service.test.ts`, `cryptomus-service.test.ts`, `payment-common.test.ts`
- **Agent team raporları**: `agent-team/` altında 14 rapor oluştu (ürün, fiyat, deploy, frontend, backend, supplier, risk)
- **ARASTIRMALAR.md**: Tüm kararların özet arşivi oluşturuldu.

## Dosya Haritası (Önemli)

```
src/server/index.ts          — Express entry
src/server/routes/           — admin-auth, admin, auth, payments, proxy, user, models, files, logs, settings, legacy
src/server/services/         — tüm business logic
src/server/jobs/             — daily-report, low-balance-scan, kur-refresh
src/App.tsx                  — Frontend SPA
deploy/vps/                  — systemd + Nginx VPS template
scripts/vps-setup.sh         — Ubuntu VPS ilk kurulum scripti
scripts/vps-deploy.sh        — VPS deploy/test/restart scripti
agent-team/                  — Araştırma ve handoff dosyaları
pricing/fiyat-master.md      — Fiyat kararları
docs/                        — API ve payment dokümantasyonu
```

## Notlar

- `backend-v3-production-setup` terminal penceresi cPanel deploy çalışmaları için.
- Model seçimi: Opus 4.7 / Sonnet 4.6 / Haiku 4.5 arasında seçim ekranı gözlemlendi.
- Image pricing rakip `llm.gen.tr` karşısında tekrar kontrol edilmeli.
