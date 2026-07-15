# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje Özeti

**YZ API** — TL bakiye bazlı, OpenAI-uyumlu AI API gateway. Müşteri TL yükler, `yzk_live_*` API key alır, model kullanımı kadar bakiyeden düşülür. Akış: `Müşteri → https://yapayzekalab.org/v1 → model-bazlı provider profili (per-model routing) → upstream sağlayıcı`. `/v1/chat/completions` (OpenAI), `/v1/messages` (Anthropic-native, Claude Code), `/v1/responses`, `/v1/models` uçları + React panel.

- **Stack:** Express + TypeScript backend, React/JSX SPA frontend (Vite), PostgreSQL (Drizzle ORM), Vitest
- **Canlı (VPS):** `ssh yzapi-vps` → `/opt/turkapiprojesi`, systemd `turkapiprojesi` (local port **4568**), nginx reverse proxy → https://yapayzekalab.org
  - ⚠️ Deploy hedefi `/opt/turkapiprojesi`'dir — **`/opt/yapayzekalab` DEĞİL** (o eski/ayrı bir checkout; deploy/run scriptlerinde geçmez). `ssh vps` BAŞKA bir host'tur (seslab); bu repo için `ssh yzapi-vps` kullan.
  - ⚠️ env.ts default PORT 4567'dir; **canlı servis 4568'de** dinler (deploy scriptleri `SMOKE_BASE_URL=http://127.0.0.1:4568`).

## Komutlar

```bash
# Geliştirme
npm run dev          # tsx watch src/server/index.ts (backend + Vite dev middleware/HMR aynı entry'den)
npm run lint         # tsc --noEmit (sadece TypeScript tip kontrolü, emit yok)
npm test             # vitest run (DB gerektirmez; src/**/*.test.ts + __tests__/**/*.test.ts, mock-DB setup)
npm run test:watch   # vitest (interaktif watch)
npm run test:cov     # vitest run --coverage

# Tek test dosyası çalıştırma
npx vitest run src/server/services/billing-service.test.ts                              # tek UNIT testi (vitest.config.ts)
npx vitest run --config vitest.itest.config.ts src/server/__tests__/money-flow.itest.ts # tek ITEST (canlı Postgres şart)

# Integration (gerçek Postgres) — sıra ÖNEMLİ
npm run db:up        # docker compose up -d postgres
npm run db:migrate   # tsx src/server/db/migrate.ts
npm run itest        # vitest run --config vitest.itest.config.ts (src/**/*.itest.ts; fileParallelism:false; timeout 30s)

# E2E
npm run e2e:up       # bash scripts/e2e-up.sh (kurulum)
npm run e2e          # playwright test --project=chromium

# Build & sızıntı
npm run build        # rm -rf dist && vite build (frontend) + esbuild (backend → dist/server.js); postbuild .htaccess kopyalar
npm start            # node dist/server.js (build çıktısını çalıştırır)
npm run scan:public  # node scripts/scan-public-bundle.mjs — BUILT bundle'ı (dist/) tarar; build SONRASI çalışır, commit/deploy öncesi ŞART

# DB yönetimi
npm run db:migrate   # tsx src/server/db/migrate.ts (dotenv: NODE_ENV=production → .env.production, veya ENV_FILE_PATH)
npm run db:seed      # tsx src/server/db/seed.ts (idempotent; deploy ÇALIŞTIRMAZ — ayrı çalıştır)
npm run db:generate  # drizzle-kit generate
npm run db:studio    # drizzle-kit studio
npm run db:seed      # ...
npm run db:rotate-cipher    # tsx src/server/db/rotate-api-key-cipher.ts
npm run db:reset:users      # node scripts/reset-user-data.mjs --confirm (YIKICI)

# Ops / smoke
npm run smoke:vps       # node scripts/vps-smoke.mjs (SMOKE_BASE_URL ile sürülür; deploy gate içinde de koşar)
npm run preflight:live  # bash scripts/vps-live-preflight.sh
npm run ops:vps-status  # bash scripts/vps-ops-status.sh
npm run qa:uat          # node scripts/yapayzekalab-uat-smoke.mjs
```

### Deploy (canlı = ödeme sistemi — dikkat)
- **Gerçek deploy = `bash scripts/sync-deploy.sh`** — geliştirme makinesinden tek-komut, mekanizma **rsync** (git-pull DEĞİL):
  1. Lokal `/Users/ufuk/yzapi` → `yzapi-vps:/opt/turkapiprojesi` rsync (`.git/node_modules/.env*/dist` hariç; `--delete` YOK)
  2. SSH üzerinden server-side gate: `npm ci → lint → test → build → db:migrate (NODE_ENV=production .env.production) → systemctl restart turkapiprojesi → curl /health (http://127.0.0.1:4568)`
  3. `.deploy/` altına predeploy backup + manifest (lokal short commit dahil) yazar. Dry run: `bash scripts/sync-deploy.sh --dry-run`.
- **Yalnız COMMIT'li koddan deploy edilir.** Clean-tree guard: `git status --porcelain` boş değilse (untracked dahil) **abort eder** ("working tree kirli. Once commit le."). Önce commit'le.
- `/opt/turkapiprojesi` git reposu **DEĞİL** — deploy dosya senkronudur. Deploy `db:migrate` çalıştırır ama **`db:seed` çalıştırmaz** — seed/backfill ayrı koşar.
- **ÜÇ ayrı deploy path'i var, yalnız ilki güncel:**
  | Script | Komut | Hedef |
  |--------|-------|-------|
  | `sync-deploy.sh` | (doğrudan) | **GÜNCEL** — rsync → VPS `/opt/turkapiprojesi`, service `turkapiprojesi`, port 4568, clean-tree guard |
  | `vps-deploy.sh` | `npm run deploy:vps` | LEGACY — server-side; `/opt/turkapiprojesi`'nin git checkout olduğunu varsayar (`git rev-parse`/`git checkout` rollback), `.env.production` chmod 600 ister, rsync YAPMAZ. `sync-deploy.sh` ile çelişir (orada o dizin git değil). Kullanma. |
  | `deploy.sh` | `npm run deploy` / `deploy:fast` | FARKLI HEDEF — cPanel; zip'i Fileman API ile `/home/<CPANEL_USER>/yapayzekalab`'a yükler, Passenger restart, https://yapayzekalab.org/health. VPS ile karıştırma. |
- **Env-yükleme tuzağı (2026-06-11'de canlıda kanıtlandı):** `db/client.js` import eden scriptlerde `ENV_FILE_PATH=.env.production` **YETMEZ** — script içindeki `loadEnv(...)` ES-import **hoisting** yüzünden `lib/env.ts`'ten SONRA çalışır, env.ts ise ENV_FILE_PATH'i OKUMAZ (yalnız `NODE_ENV==='production' ? .env.production : .env`) → `.env` yüklenir, Zod `DATABASE_URL/JWT_SECRET Required` ile patlar. **Sunucuda doğru kullanım: `NODE_ENV=production npx tsx scripts/<seed>.ts`.** (`migrate.ts` istisna: kendi dotenv'i ENV_FILE_PATH'i okur.)

## Mimari

- yzapi `src/` dizin-ağacı (app.ts factory vs index.ts entry, proxy/routes/services/db/migrations topolojisi, frontend entry repo kökünde, yapayzekalab/=React SPA) → [[project_yzapi_architecture_tree]]
- yzapi `createApp()` (app.ts) cron/Vite/listener başlatmadan kurulur (supertest için); tam middleware sırası (trust proxy=1 → json+rawBody → requestId → requestLang → httpLogger → Gözcü tap → /health → /status → mounts → 404 → errorHandler) → [[project_yzapi_app_factory_middleware_order]]
- **yzapi auth katmanlama (mount sırası — kritik):** panel + `/v1` 3-katman router mount sırası, `apiKeyAuth` (Bearer + `x-api-key` `yzk_live_`), `adminAuth` (owner = kod-sabiti `ADMIN_EMAIL='cix.crazy666@gmail.com'`, DB rolüne bağlı değil), `userAuth` (yzk_live_ reddeder), `requireWhatsappVerified`, `errorHandler` + partner RBAC 11 sekme → [[project_yzapi_auth_layering_mount_order]]

### Provider & Katalog sistemi (en kritik — çok dosya okumayı gerektirir)
- **PER-MODEL routing** (2026-06-03; ayrıntı: `project_yzapi_per_model_routing`): her istek **modeline göre** farklı upstream'e gider. `resolveProviderForModel(masterModel.id)` (`provider-config-service.ts`) modeli `supportedModelIds`'inde içeren **enabled** profili bulur (**partition-by-supportedModelIds**: kümeler ÇAKIŞMAZ/disjoint) → o profilin `ProviderContext`'iyle (baseUrl/apiKey/modelMap) forward edilir; hiçbir profile pinlenmemiş model → `active_provider_id` fallback'i. **metro + rika SİLİNDİ.**
- **`provider_profiles`** (`id, baseUrl, apiKeyCipher, enabled, supportedModelIds, modelMap`) seed: `scripts/seed-provider-profiles.ts` (sunucuda ayrı koşar, deploy çalıştırmaz). `active_provider_id` artık yalnız FALLBACK (+ web-search + Gözcü `models_reachability` probe + connection-test). `AI_PROVIDER_*` env yalnız bootstrap.
- **Canlı provider topolojisi (2026-06-25 — SON):**
  | Profil | Handles | Upstream | Durum |
  |--------|---------|----------|-------|
  | `sub-claude` | **Claude PRIMARY** (opus-4-8/4-7/4-6, sonnet-4-6, haiku-4-5) | Mac mini `cliproxy:8317` autossh tünel → Ufuk+Kerim Codex koltukları | ✅ aktif |
  | `closerouter` | GPT-5/4.1/o-serisi, Gemini, Claude-dışı | `api.claude-popusk.shop` (popusk) | ✅ aktif |
  | `wellflow` | Claude yedek (boş `supportedModelIds`) | `api.wellflow.dev` | ❌ 402 (kredi bitti, uyku) |
  `rika` → **DISABLED**. `system_api_config.active_provider_id=closerouter` (fallback/probe).
  ⚠️ **Claude satırı 07-03 itibarıyla ESKİMİŞ** — koltuklar KAPALI, TÜM Claude artık CF claude-api'ye cloak'lanıyor [[project_cf_cloak_claude_routing]].

- Claude yönlendirme: ⚠️ koltuk/`sub-claude`→cliproxy topolojisi 07-03 itibarıyla ESKİMİŞ — koltuklar KAPALI, TÜM Claude artık CF claude-api'ye cloak'lanıyor [[project_cf_cloak_claude_routing]] (eski koltuk-proxy detayı [[project_codex_subscription_proxy]]). KURAL: `/v1/messages` body'sine `user` alanı gönderme (Anthropic 400 "Extra inputs"; proxy.ts messages endpoint'inde strip'lenir) — [[project_yzapi_messages_user_field_400]].
- yzapi codex GPT paket routing: `SEAT_PRIMARY_FOR_PACKAGE_GPT` (koltuk-birincil, `seatPrimaryPackageChain` sadece sub-codex chain'de non-null; cf_remaining düşmez→over-serve `shouldCapOverServe` yakalar [[project_yzapi_cf_seat_overserve_cap]]) ↔ TERSİ `CF_FIRST_FOR_PACKAGE_GPT` (CF-önce drain, CANLI+AKTİF 06-25); proxy.ts 3 call-site CF_FIRST>SEAT_PRIMARY; drain bitince CF_FIRST=false+restart şart. Detay [[project_yzapi_cf_drain_and_codex_daily_gate]]
- Codex 1-1 spark alternasyonu (`CODEX_SPARK_ALTERNATION_ENABLED`, `billedViaPackage`) + 4'lü uygunluk kapısı (`sparkEligibleRequestBody`: reasoning.context/tool-allowlist/multimodal/192KB) + `/v1/responses` stream degrade-bypass RETHROW ağı; spark = AYRI kota kovası (kapatmak kapasiteyi çöpe atar), Ufuk: 1-1 kal, benchmark yok. ⚠️ Kod canlıda targeted-rsync ile (`~/yzapi-fairness-work` afa1dcb) ama lokal `~/yzapi`'de YOK. Detay [[project_yzapi_codex_1to1_spark_alternation]] + [[project_yzapi_stream_zero_output_diag_2026_07_02]] + [[project_yzapi_private_codespark_model]]
- Codex paketleri DAILY-gate model (`requests_today < daily_limit_snapshot`, gün-dönümü reset; koltuk servisi CF aynasından bağımsız; topUp tavanı `daily_limit_snapshot × sure_gun`); `CF_PROACTIVE_TOPUP_ENABLED=false` (proaktif CF top-up KAPALI). ⚠️ DERS: tavanı-AÇAN fix + onu SINIRLAYAN guard'ı ASLA ayrı deploy etme (arada proaktif job boşluğu ~675 TL over-order verdi). Detay → [[project_yzapi_cf_drain_and_codex_daily_gate]]
- Canlı provider topoloji tablosu yukarıda; MEKANİKLER: setActiveProvider(id) yalnız `enabled` bakar (reachability-gate YOK) + aktifi değiştirmek pinli modeli reroute ETMEZ (upstream boşaltmak için disable/supportedModelIds taşı) + failover yalnız active çevirir, pinliyi kurtarmaz; CF reseller ~5MB gövde limiti HER CF çağrısını (paket-override+koltuk→CF fallback+PAYG) vurur; 18 CF modeli PAYG token-başı da çağrılabilir (fiyat added_models.input/output_usd); system_api_config default_context=1M / max_tokens=128k (çıktı) / stream_timeout=300s. Detay → [[project_yzapi_setactiveprovider_mechanics]]
- yzapi katalog = enabled profillerin `supportedModelIds` BİRLEŞİMİ (`resolveSupportedModelIds`; yoksa 404); `modelMap` canonical→wire; MASTER_MODELS 42-kilit + `aliases`; provider `forward*` fn'leri `ctx: ProviderContext` alır (upstream'i ctx belirler) — detay [[project_yzapi_catalog_union_provider_adapter]]

### Provider Failover & Circuit Breaker
- yzapi request-seviyesi cross-provider failover (`forwardWithFailover`, 7sn bütçe, pre-commit+eligible) + in-memory per-profil circuit breaker (3-hata→open→60s→half-open); `fallback_provider_id` (mig 0024) set'liyse açık, env-flag yok, 5 call-site — Gözcü active_provider heal'inden AYRI; detay [[project_yzapi_provider_failover_circuit_breaker]]

### Billing Akışı
- Billing akışı (`proxy.ts`→`billing-service.ts`): her text ucu `enforceRequestGuards()`+`buildRequestGuard()` (min() context/max-output). Extended-thinking `budget_tokens` auto-enjekte (eksikse 422) + `anthropic-beta` header client'tan yakalanıp YALNIZ `/messages`'ta iletilir (`forwardTextEndpoint` opsiyonel `upstreamHeaders`). Detay + sampling-strip + token-saver: [[project_yzapi_billing_guards_flow]]
- yzapi para-tahsil yolu: reserve→settle akışı, K1 değişmezi (upstream hatasında 0 tahsil + tam iade), resolveBilledPromptTokens char/4-şişirmesiz, settle'da balance-guard YOK, chargeUsage rezervasyonsuz fallback — detay [[project_yzapi_billing_reserve_settle_flow]]

### /v1 uç envanteri & görsel
- yzapi `/v1` uçları (chat/completions, balance, responses→`handleResponsesEndpoint`, messages→`handleTextJsonEndpoint`, images, web-search), Codex Responses API çeviri kabuğu, web_search billing izolasyonu (chargeWebSearch, ws_ key) VE görsel/video endpoint plumbing (withImageSlot/chargeImage, added_models type/image_price_usd mig 0021, video 501) → [[project_yzapi_v1_endpoint_inventory]]
- yzapi görsel üretimi CANLI (CF gpt-image-2, /v1/images + Görsel sekmesi); paketten düşer bakiyeden değil, PAYG yok→paketsiz 402; video hâlâ 501; CF slug -api (studio→404), CF size'ı yok sayar→ffmpeg cover+crop resize, zaman-bütçeli retry 504-güvenli, paket TEK-GÜNLÜK (çok-günlük 30× fazla ödetir). Detay + tüm tuzaklar [[project_yzapi_cf_image_gen_works]]

### Paketler & entitlement
- yzapi paket/redeem/hesap-teslim tüketim yolu (token-billing'e paralel, `packages_enabled` gate'li): 4 tablo + migration envanteri, redeem-only/Deneme/per_user_once + iade-onay kapısı, `satista` "yakında" modu, paket-bazlı upstream override (`packageOverrideChain`, fallback yok), `max_context_tokens` guard → [[project_yzapi_packages_redeem_datamodel]]
- entitlement-service.ts kapı semantiği (PAYG/pause bypass, seçim sırası düşükten-büyüğe, CF gate MUAF + CF-havuz clause LOCKSTEP, seed scriptleri, canlı CF katalog, BUILDER_MARKUP=2.5 builder fiyatlaması, routes/packages.ts + tab-packages.jsx) → [[project_yzapi_entitlement_service_gate_reference]]

### Frontend & Job'lar & Gözcü
- yzapi React panel SPA (entry index.html→main.tsx→App.tsx→yapayzekalab/App.jsx; tab-*.jsx envanteri; History-API tab routing via tab-routes.js — React-Router YOK; i18n fragment; shared.jsx export blokları; tab-admin ADMIN_SECTIONS + partner-görünür 11; tokens.css dark-mode özgüllük/hardcoded-renk tuzakları) → [[project_yzapi_frontend_architecture]] (alt-özellikler: [[project_yzapi_price_comparison]] [[project_yzapi_documents_redesign]] [[project_yzapi_dark_mode]] [[project_yzapi_i18n]] [[project_yzapi_panel_back_button_fix]])
- Arka-plan cron job'ları (9 adet: kur-refresh/low-balance/daily-report/telegram-delivery-recovery/orphan-reaper/mali-izleme/gozcu-job/gozcu-digest/package-maintenance) `src/server/jobs/index.ts`'te; sıra önemli, test'te skip (telegram-recovery hariç); source değişikliği build+restart ister → detay [[project_yzapi_background_jobs_inventory]]
- Gözcü (Sentinel) sistem nöbetçisi (`src/server/services/gozcu/`) — READ-ONLY, yalnız `gozcu_findings`/`gozcu_signals` yazar, parayı asla taşımaz; 5 domain (money/uptime/provider/security/code) + engine/metrics-collector/heartbeat/LLM-diagnosis/code-contracts/auto-heal(default off)/notify iç mimarisi [[project_yzapi_gozcu_architecture]]; operasyonel non-obvious olgular [[project_yzapi_gozcu]]

## Kritik Kararlar & DOKUNULMAZ

**DOKUNULMAZ (regresyon / para riski — onaysız değiştirme):**
- `billing-service.ts` reserve/settle/charge transaction mantığı (atomik; K1 hata→0 tahsil; idempotency key'leri)
- `resolveBilledPromptTokens` + `normalizeProviderUsage` — token **SAYISI** mantığı, billing **FORMÜLÜ DEĞİL**
- Tek-admin allowlist (`admin-auth.ts` ADMIN_EMAIL kod-sabiti + `admin.ts`) — contract testleri kilitler
- `MASTER_MODELS` 42-kilit — yeni model `added_models`'a; `reject-template-guard` fingerprint listesi
- secret/codename non-leak: provider adı/base_url/upstream maliyet/çarpan asla frontend'e/public API'ye sızmaz
- `API_KEY_ENCRYPTION_SECRET` (prod'da zorunlu + JWT_SECRET'tan ayrı olmalı — JWT_SECRET sızması her API key'i çözmesin)

| Konu | Karar |
|------|-------|
| Fiyatlama (USD→TL) | `pricing.ts`: tip-bazlı carpan (default **3.0**) → `toTL(usd,cfg) = usd * (liveKur * (1 + kurBuffer))`. ⚠️ **SELL kur** kullanılır (`liveKur*(1+kurBuffer)`, default kurBuffer 0.03) — depolanan `kur` kolonu DEĞİL. Müşteri fiyatları `master-models.ts` + `added_models`. CLAUDE.md tarihsel "~3.33×" ifadesi normalizasyon dahil efektif değer. |
| Cost (token→para) | `computeCost()`: `TOKEN_PRICE_UNIT=1e6`; text = `(prompt/1e6)*inputPrice + (completion/1e6)*outputPrice`; round4 TL / round8 USD. |
| Token normalizasyon | **`/0.90` divizörü YOKTUR** — aktif kodda böyle bir sabit yok (repodaki tek `0.90` seed.ts'te bir model fiyatı). `normalizeProviderUsage()` cache-aware toplama yapar; CLAUDE.md'nin eski "real_tokens / 0.90" satırı stale/aspirasyonel idi. |
| Billing idempotency | `usage_records.request_id` UNIQUE (kolon nullable, index tekil); `transactions.idempotencyKey` UNIQUE. Key'ler: `usage_reserve_` / `usage_release_` / `usage_final_` / `usage_<reqId>`. |
| Admin erişimi | Allowlisted email **kod-sabiti** (`ADMIN_EMAIL='cix.crazy666@gmail.com'`), ayrı şifre yok |
| Min yükleme | **$5 USD-bazlı** — backend `payments.ts MIN_TOPUP_USD=5` (Shopier/IBAN/crypto tek kapı `buildQuoteFromRequest`) + frontend `tab-account.jsx MIN_USD=5`; Telegram TL tabanı `system_config.min_bakiye_tl=225`. `payment-safety-contract.test.ts` backend+frontend sabitlerini KİLİTLER — değişiklik üçünü (+`home.js` $ metinleri) birlikte günceller |
| Provider leak | codename'ler (closerouter/wellflow/omniroute/metro/popusk) frontend'e ASLA geçmez — `npm run scan:public` (BUILT dist) + `*-noleak`/`*-contract` testleri (`provider-name-noleak-contract`, `catalog-noleak`, `provider-config-noleak`) + vite.config.ts `reject-template-guard` (SOURCE-time gate, scan:public bundle-time gate) |
| Migration | **CANLI highest teyidi ŞART** — CANLI'dan `ls migrations/` ile en yüksek numarayı al (lokal `~/yzapi` GERİDE); yeni migration numarasını **canlı sıraya göre** ver. ⚠️ **`meta/_journal.json` `when` MUTLAKA mevcut max'tan BÜYÜK olmalı** — küçükse drizzle migration'ı SESSİZCE ATLAR ("applied successfully" basar ama kolonlar OLUŞMAZ → deployed kod var-olmayan kolona yazıp kırılır). **DEPLOY SONRASI kolonu `information_schema.columns`/`pg_indexes` ile DOĞRULA.** Atlandıysa: idempotent `ALTER ... IF NOT EXISTS` elle + journal `when`'i max+1'e çek + tekrar `db:migrate`. Yeni tablo: `IF NOT EXISTS` + `schema.ts` Drizzle + `meta/_journal.json` sıralı. |
| itest | gerçek Postgres (mock yok); `fileParallelism: false`; `itest-setup.ts` (mock-DB DEĞİL, real `./db/client`) |

## Önemli Notlar
- Tüm env erişimi `src/server/lib/env.ts` (Zod) üzerinden; doğrudan `process.env` kullanma
- `scan:public` BUILT bundle'ı (dist/) tarar → `npm run build` SONRASI, deploy/commit ÖNCESI koş
- Money-critical tablolar: `users` (bakiyeTL numeric(14,4)), `transactions` (ledger, idempotencyKey UNIQUE), `usage_records` (costTL/costUsd, requestId UNIQUE; `billed_via`+`entitlement_id`), `payments`, `pendingIbanPayments`, `signupBonusGrants`, `systemConfig` (single-row id=1: kur/liveKur/kurBuffer + text/image/videoCarpan + `packages_enabled`), `packages`/`userPackageEntitlements`/`redeemCodes`/`redeemCodeUses`/`accountDeliveryOrders` (entitlement & kod akışı — `billed_via='package'` cost=0)

### Diğer referanslar (pointer)
- yzapi: ham `sql`/`dbSql` template'ine JS `Date` bind runtime throw eder → `${date.toISOString()}::timestamptz` (Drizzle typed gte/lte/eq muaf); detay [[yzapi_raw_sql_date_param]]
- yzapi DB = tek postgres-js pool → `db` (drizzle ORM) + `dbSql` (raw); env = Zod-validated tek erişim noktası (`process.env` kullanma), dotenv sırası + prod-only secret superRefine + PORT 4567/HOST 127.0.0.1 loopback. Detay: [[project_yzapi_db_client_env_contract]]
- yzapi 5 test katmanı (unit/contract/integration/e2e/smoke) komutları + itest `.pgdata` bayat-volume tuzağı + dokümantasyon contract string-kilidi (`documents-content-contract` / `os-install-variants-contract`) → [[project_yzapi_test_layers]]
- Claude Code `/model` picker'da Claude modelleri: gateway-discovery opt-in (`CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`) + built-in tablo dedup tuzağı → çözüm dot-form katalog id'leri; detay [[project_yzapi_claude_code_model_discovery]].

## Canlı durum kayıtları
- yzapi 06-19→06-27 tarihli canlı-durum deploy günlüğü (dark mode, devreden paketler, admin paket yönetimi, CF shared-pool/gate-desync/deadlock-renew, extended-thinking fix, CF top-up batch 50, user-field 400) → her deploy kendi [[project_yzapi_*]] notunda; tekrar eden deploy-izolasyon meta-dersi (targeted rsync manifest güncellemez, LOCAL_SRC=~/yzapi YASAK, kontaminasyon tuzağı, lokal-main canlının gerisinde) [[project_yzapi_deploy_isolation_trap]] + [[project_yzapi_live_faithful_replica]]

## Working model
Ops/devir/çalışma modeli (yzapi DIŞINDA): `/Users/ufuk/yeniapi/.kiro/` — `steering/agent-team-workflow.md` (BAĞLAYICI: lider + uygulama ajanı + **3 QA, ≥2 PASS**), `CALISMA-GUNLUGU.md` (append-only, en yeni ALTTA). **Devir tek-doğruluk:** `docs/AI_HANDOFF.md` + `docs/OPERATIONS.md` (canlı status ile doğrula — eski raporlar tarihsel).
