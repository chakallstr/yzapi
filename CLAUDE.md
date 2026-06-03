# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje Özeti

**YZ API** — TL bakiye bazlı, OpenAI-uyumlu AI API gateway. Müşteri TL yükler, `yzk_live_*` API key alır, model kullanımı kadar bakiyeden düşülür. Akış: `Müşteri → https://yapayzekalab.org/v1 → aktif provider profili → upstream sağlayıcı`. `/v1/chat/completions` (OpenAI), `/v1/messages` (Anthropic-native, Claude Code), `/v1/responses`, `/v1/models` uçları + React panel.

- **Stack:** Express + TypeScript backend, React/JSX SPA frontend (Vite), PostgreSQL (Drizzle ORM), Vitest
- **Canlı (VPS):** `ssh yzapi-vps` → `/opt/turkapiprojesi`, systemd `turkapiprojesi` (local port **4568**), nginx reverse proxy → https://yapayzekalab.org
  - ⚠️ Deploy hedefi `/opt/turkapiprojesi`'dir — **`/opt/yapayzekalab` DEĞİL** (o eski/ayrı bir checkout; deploy/run scriptlerinde geçmez). `ssh vps` BAŞKA bir host'tur (seslab); bu repo için `ssh yzapi-vps` kullan.
  - ⚠️ env.ts default PORT 4567'dir; **canlı servis 4568'de** dinler (deploy scriptleri `SMOKE_BASE_URL=http://127.0.0.1:4568`).

---

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
- **Env-yükleme tuzağı (düzeltilmiş):** standalone scriptlerin hepsi dotenv import etmez, ama `scripts/seed-provider-profiles.ts` **eder** (`loadEnv({ path: process.env.ENV_FILE_PATH || ".env" })`). Doğru kullanım: `ENV_FILE_PATH=.env.production npx tsx scripts/seed-provider-profiles.ts` (ENV_FILE_PATH yoksa `.env` yükler; path'i seçen `--env-file` değil **ENV_FILE_PATH**'tir). `migrate.ts`/`seed.ts`/`env.ts` kendi dotenv yüklemelerini yapar.

---

## Mimari

```
src/
├── App.tsx                   — route → initial tab; YapayZekaLabApp + TelegramTopupApp import'lar
├── index.html (REPO KÖKÜ) + src/main.tsx — Vite frontend entry; yapayzekalab/ İÇİNDE main.tsx/index.html YOK
├── master-models.ts          — MASTER_MODELS 42-KİLİT + canonicalizeModelId + ADDED_MODEL_DASH_TO_DOT köprüsü
├── pricing.ts                — fiyat formülü (carpan + USD→TL sell-kur)
├── server/
│   ├── app.ts                — createApp() factory (cron/Vite/listen YOK; supertest aynı route tree'yi sürer)
│   ├── index.ts              — entry: createApp → startKurRefresh + startAllJobs + Vite/static + app.listen
│   ├── routes/proxy.ts       — /v1/* → upstream; guard + reserve/settle billing + model çözümleme
│   ├── routes/{admin,user,payments,auth,models,settings,v1-catalog,telegram}.ts
│   ├── middleware/           — request-id, api-key-auth, admin-auth, user-auth, whatsapp-verified, error-handler
│   ├── services/             — closerouter-service (upstream adapter), provider-config-service, provider-adapter,
│   │                           billing-service, pricing-service, request-guard-service, api-settings-service,
│   │                           mali-izleme-*, payment stack, gozcu/* (sentinel) …
│   ├── jobs/                 — cron (index.ts → startAllJobs)
│   ├── db/{schema.ts,client.ts,migrations/}  — Drizzle tek-kaynak + sequential SQL (0000…0018, 19 dosya)
│   └── lib/{env.ts,errors.ts}  — Zod env (tek erişim noktası) + typed error hiyerarşisi
└── yapayzekalab/             — React/JSX SPA (tek-dosya: tab-*.jsx, api-docs.js, shared.jsx, auth-client.js)
```

### App factory & middleware sırası (`app.ts`)
`createApp()` Express app'i **cron/Vite/listener BAŞLATMADAN** kurar (supertest aynı route ağacını sürebilsin). Sıra:
`trust proxy=1` (tek nginx hop, XFF spoof'u engeller) → `express.json({limit:10mb, verify:rawBody})` (webhook imzası için) → `requestId` → `httpLogger` → **Gözcü tap** (`res.on('finish')`→`recordHttp(status)`; HER /api,/v1,/status response'unu in-memory metrics collector'a sayar, asla bloklamaz) → `/health` (auth/rate-limit yok; db SELECT 1 + kur yaşı + AI provider /models erişilebilirliği) → `/status` (public snapshot) → API/v1 mount'lar → `/api`,`/v1` için JSON 404 catch-all → `errorHandler` (en son). `index.ts`'teki `startServer()` ise `startKurRefresh()` + `startAllJobs()` + Vite dev middleware (dev) / static dist + SPA catch-all (prod) ekler, sonra `app.listen(env.PORT, env.HOST)`.

### Auth katmanlama (mount sırası — kritik)
- **Panel:** `/api/admin` (önce auth'suz `adminAuthRouter` login) → `/api/admin` (`adminAuth` + `requireWhatsappVerified` + `adminRouter`); `/api/auth`; `/api/user` (`userAuth` + `requireWhatsappVerified`); `/api` (models, settings); `/api/payments`; `/api/telegram`.
- **`/v1` (3 katman):** önce auth'suz `v1CatalogRouter` (katalog) → whitelist 404 guard (yalnız `/balance`, `/chat/completions`, `/responses`, `/messages`, `/web-search`, `/images/*`, `/videos/*` geçer) → `/v1` (`apiKeyAuth` + `requireWhatsappVerified` + `proxyRouter`). Billing/proxy uçları **apiKeyAuth + whatsapp-verified** arkasında.
- **`apiKeyAuth`** (`api-key-auth.ts`): `Authorization: Bearer yzk_live_` ister; eksik/geçersizde `recordAuthFailure(hashIp(ip))` (Gözcü auth_failure_spike) + 401; `validateApiKey` sonrası `req.apiKey`/`req.user` set eder.
- **`adminAuth`** (`admin-auth.ts`): JWT role==='user' + `durum==='aktif'` + `normalizeEmail(email)===ADMIN_EMAIL`. ⚠️ Admin **kod-sabiti email** ile gate'lenir: `ADMIN_EMAIL='cix.crazy666@gmail.com'` (sadece env değil). Express `Request` augmentation (admin?/user?/apiKey?) burada. Başarısızlıkta `recordAuthFailure`.
- **`userAuth`** (`user-auth.ts`): Bearer ister, **`yzk_live_` key'leri açıkça reddeder** (API key panel route'larında çalışamaz); JWT role==='user' + aktif. `recordAuthFailure` ÇAĞIRMAZ.
- **`requireWhatsappVerified`** (`whatsapp-verified.ts`): OTP kapalıysa no-op; userId'yi `req.user?.id || req.apiKey?.userId`'den çözer (panel + API key kapsar); admin email ve `/me` GET/PATCH için bypass; yoksa 403 `{code:'whatsapp_verification_required'}`. Hem panel hem /v1 auth'undan sonra katmanlı.
- **`errorHandler`** (`error-handler.ts`): JSON-parse 400, `RateLimitError`→429 (`recordRateLimited()` + Retry-After), `AppError`→statusCode, beklenmeyen→500 (`recordUnhandled()`). Tüm response'larda requestId. (api-key-auth, admin-auth, error-handler → Gözcü collector besler.)

### Provider & Katalog sistemi (en kritik — çok dosya okumayı gerektirir)
- **Aktif provider DB-driven:** `system_api_config.active_provider_id` → `provider_profiles` satırı (`id, baseUrl, apiKeyCipher, enabled, supportedModelIds, modelMap`). `AI_PROVIDER_BASE_URL`/`AI_PROVIDER_API_KEY` env yalnız fallback (env.ts `aiProviderApiKey()` = `AI_PROVIDER_API_KEY || CLOSEROUTER_API_KEY`; `CLOSEROUTER_*` legacy isim; default base URL provider hostname içerir → server-side only).
- **Panel tek-tık switch:** `setActiveProvider(id)` yalnız `enabled` kontrol eder — **reachability/health gate YOK**, restart yok (`invalidateProviderConfigCache`). Ölü provider'a geçiş trafiği kırar.
- **`supportedModelIds`** = müşteriye görünür katalog (`/api/models` filtresi). **`modelMap`** = canonical-id → upstream-wire-id. `strictCanonicalModelIds` (default **true**) → proxy upstream'e `masterModel.id` (canonical) gönderir; modelMap wire-id'ye çevirir.
- **MASTER_MODELS 42-kilit** (`src/master-models.ts`): yeni model **EKLENMEZ**; `added_models` DB katmanında. `canonicalizeModelId` + `ADDED_MODEL_DASH_TO_DOT` client dash formu (`claude-opus-4-8`) → canonical dot (`claude-opus-4.8`) çevirir.
- **Provider adapter:** proxy `getActiveProviderAdapter()` (`provider-adapter.ts`) → upstream HTTP adapter **`closerouter-service.ts`**: `forwardChat` (/chat/completions), `forwardTextEndpoint` (/messages + /responses), `forwardChatStream` (SSE). `provider-adapter.ts` ProviderAdapter bunları `forwardChat`/`forwardMessages`/`forwardResponses`/`forwardChatStream` olarak sunar; `forwardMessages`/`forwardResponses` → `forwardTextEndpoint('messages'|'responses', body)`'ye delege eder. Yeni provider eklerken model adı formatını **gerçek endpoint'te** doğrula (itest nock kullanır, mismatch'i yakalamaz); key'ler env'den, asla hardcode.

### Billing Akışı (proxy.ts → billing-service.ts)
Her text ucu `enforceRequestGuards()` koşar (paralel: model çözümleme, runtime config, apiKey policy, rate limit, model allowlist, bakiye>0 ön-guard) → `buildRequestGuard()` effective context/max-output limitlerini `min()` ile hesaplar.
1. `reserveUsageBudget()` — atomic `UPDATE users SET bakiye_tl -= cost WHERE bakiye_tl >= cost` + `kullanim_rezervasyon` transaction (key `usage_reserve_<reqId>`); yoksa `InsufficientBalanceError` → **402**
2. upstream forward → `normalizeProviderUsage()` (OpenAI: `prompt_tokens` taban, **cache çift sayılmaz**; Anthropic: `input + cache_read + cache_create`); ham usage `providerRaw` olarak saklanır
3. `resolveBilledPromptTokens(providerNormalized, serverContext)` — provider **>50** → ona güven (char/4 ile şişirme YOK, büyük-JSON over-billing'i önler); **≤50** (bozuk/sıfıra-yakın rapor) → `max(provider, serverContext)` floor (under-charge = bizim zarar). Sadece SAYIYI seçer, formülü değiştirmez.
4. `settleReservedUsage()` — tek `dbSql.begin` içinde: rezervasyonu iade (`iade`, `usage_release_<reqId>`) → `actualCost>0` ise gerçek maliyeti tahsil (`kullanim`, `usage_final_<reqId>`, **balance guard YOK** — servis verildi, overage'da hafif eksiye düşebilir) → **her zaman** bir `usage_records` satırı yazar (idempotent: `request_id` UNIQUE).
- **K1:** upstream hatasında **0 tahsil** + tam iade (usage_records status='error', cost 0). Hatada bile usage satırı yazılır; upstream error body `forwardUpstreamError` ile iletilir.
- Billing header'lar: `X-YZ-Cost-TL` / `X-YZ-Remaining-TL` / `X-YZ-Remaining-USD` / `X-YZ-Request-Id`.
- **`chargeUsage()`** = rezervasyonsuz fallback (key `usage_<reqId>`); error/0-cost'ta bakiyeye dokunmadan sadece usage satırı yazar.

### /v1 uç envanteri
- Gerçek: `POST /chat/completions` (stream + `web_search` auto-augment destekli), `GET /balance` (TL+USD+kur), `POST /responses` + `POST /messages` (ikisi de handleTextJsonEndpoint), `POST /web-search` (ayrı, sabit $0.001/arama ücreti).
- **Web search billing izolasyonu:** `web_search` upstream'e gönderilmeden önce strip edilir; settle SONRASI ayrı sabit $0.001/arama ücreti `chargeWebSearch` ile (key `ws_<reqId>`, reserve/settle'a DOKUNMAZ). Standalone `/web-search` yalnız sonuç varken charge eder.
- Stub'lar (501): `POST /images/generations` + `/images/edits` ("disabled during provider migration"), `POST /videos/submit` + `GET /videos/tasks/:id` ("Phase D not implemented"). Tüm gerçek uçlar `requireProxy` (upstream key yoksa 503) ve `maintenanceModeForApi` (503) ile sarılı.

### Frontend katalog & auth
- SPA entry zinciri: `index.html → src/main.tsx → src/App.tsx → yapayzekalab/App.jsx` (entry'ler **repo kökü/src**'de, `yapayzekalab/` içinde main.jsx/index.html YOK).
- `shared.jsx` ES module `export {}` blokları kullanır (default export YOK): icons (I), components (Card/Chip/Caption/PulseDot), data (PROVIDERS/MODELS), helpers (modelMeta/fmt/useCountUp). Müşteri katalog **dinamik** `/api/models`; `shared.jsx` MODELS = STATIK fallback (42-model contract testi kilitler).
- `tab-admin.jsx`: sections **module-level `const ADMIN_SECTIONS = [...]`** array'i (register() çağrısı değil), `.map()` ile render. Bölümler: dashboard, traffic, mali-izleme, gozcu, api, users, overrides, announce, providers, kur, payments, telegram, apikeys, logs, animations. `const API_SUB_SECTIONS` API-yönetim alt-tab'larını sürer. Sub-tab'lar `tab-admin-traffic.jsx` / `-mali-izleme.jsx` / `-gozcu.jsx`'ten gelir. (Hardcoded `LAUNCH_ADMIN_EMAIL='cix.crazy666@gmail.com'`.)

### Job'lar (`src/server/jobs/index.ts → startAllJobs`)
**8 job** (sıra ÖNEMLİ, hepsi NODE_ENV==='test'te skip — telegram-recovery hariç):
| Job | Cron | İş |
|-----|------|-----|
| kur-refresh | `0 * * * *` | saatlik USD/TRY + >5% anomali email |
| low-balance-scan | `15 * * * *` | saatlik düşük-bakiye email (24h cooldown) |
| daily-report | `0 9 * * *` | günlük kullanım/gelir/top-5 model |
| telegram-delivery-recovery | `*/10 * * * *` | başarısız API-key teslimat retry (attempt<5) |
| orphan-reservation-reaper | `30 * * * *` | sahipsiz `usage_reserve_*` hold iade |
| mali-izleme | `* * * * *` | activity-gated finansal denetim → `mali_izleme_taramalari` |
| **gozcu-job** | `* * * * *` | Gözcü scan + auto-heal + red-notify |
| **gozcu-digest** | `0 9 * * *` | günlük Gözcü bulgu özeti |

Sonda `markJobsStarted()` heartbeat staleness için boot anını kaydeder.

### Gözcü (Sentinel) — sistem nöbetçisi (`services/gozcu/`)
**READ-ONLY** sinyal tabloları üzerinde (yalnız SELECT); yalnızca `gozcu_findings` + `gozcu_signals` yazar — **parayı asla taşımaz**. Mali İzleme'nin `applyHysteresis` + `deriveVerdict` primitiflerini yeniden kullanır.
- **5 domain** (`registry.ts CHECK_REGISTRY`): **money** (Mali İzleme'nin 11 kontrolü / 14 alt-sonucu; k1 + ledger_drift≥1TL "immediate"), **uptime** (api_5xx, proxy_error, p95, job_liveness, db_pool_health, unhandled_error_spike), **provider** (upstream_error/timeout, **models_reachability** — aktif provider /models probe'u, ≥3 fail→red + failover suggestedHeal, provider_durum_staleness), **security** (auth_failure_spike, rate_limit_hit_spike, shopier_dead_letter, pending_iban, signup_bonus_abuse, telegram_delivery), **code** (`code_contracts` → verifyAllContracts, runtime'dan bağımsız regresyon yakalar).
- **Engine** (`engine.ts`): `runGozcuScan()` 5 domain'i paralel `safeRun` ile koşar (throwing check → yellow 'check_failed', engine çökmez), hysteresis + verdict, `persistScan()` dedup_key (domain:name) ile upsert + PII redaction (scrubObject), `gozcu_signals` özet satırı. `runGozcuScanIfActivity()` activity gate'i (para/trafik/stale heartbeat varsa veya en az 10dk'da bir zorla scan).
- **Metrics-collector** (`metrics-collector.ts`): in-memory 15×1dk ring buffer (app.ts `res.on('finish')` + middleware besler). Hot path'te DB yazımı YOK; veri yalnız scan anında (dk/1) `gozcu_signals`'a girer. Ham IP saklanmaz (sha256 `hashIp`, IP_CAP=200/bucket).
- **Heartbeat** (`heartbeat.ts`): cron başında `recordHeartbeat(jobName)`; "process canlı ama cron sessizce durdu"yu yakalar (mali-izleme + gozcu izlenir). Total process ölümü → EXTERNAL `scripts/gozcu-heartbeat.mjs`.
- **Layer-2 LLM diagnosis** (`diagnose.ts`, **advisory-only**): red bulgu için redacted code slice + contract → upstream /chat/completions (triage→deep escalation if confidence<0.6 veya kritik). TEXT-ONLY (rootCause/suggestedFix/confidence), DB/tool erişimi yok, heal tetiklemez, monthly token budget + 6h cooldown, asla throw etmez. Default modeller (env): `GOZCU_LLM_TRIAGE_MODEL='antigravity/gemini-3-flash-preview'`, `GOZCU_LLM_DEEP_MODEL='antigravity/claude-opus-4-6-thinking'` (kod içi "Haiku/Opus" yorumu stale).
- **Layer-3 code contracts** (`contracts/index.ts`): kodun NE OLMASI gerektiğinin declarative kaydı. `proxy/billed-tokens-floor` verify() proxy.ts'te `resolveBilledPromptTokens`'ı grepler, **<4 occurrence → violation** (billing-floor regresyonunu yakalar; okunamayan dosya = violation). Diğer: `billing/error-never-charged`, `billing/reserve-settle-or-release`, `payments/idempotent-credit`.
- **Auto-heal** (`heal/run.ts`, **default off**): `GOZCU_AUTOHEAL_MODE` (off/shadow/tiered/auto). HEAL_REGISTRY **3 whitelist**: `refund_orphan_reservations` (idempotent reap, yeni bakiye yazmaz), `expire_stale_pending_iban`, `failover_provider` (active_provider_id'yi erişilebilir alternatife çevirir). Her apply rails: rate-limit → guard → dryRun → cap → apply → audit.
- **Notify** (`notify.ts`): yalnız red, dedup_key başına 1h cooldown; hysteresis non-immediate red'leri yellow'a indirir → yalnız immediate/para-kritik page eder (k1, drift≥1TL, DB down, mali-job stall, models down, auth attack). `noteRecoveries()` green'de cooldown'u siler. Yellow'lar günlük digest'e.

---

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
| Provider leak | codename'ler (closerouter/wellflow/omniroute/metro/popusk) frontend'e ASLA geçmez — `npm run scan:public` (BUILT dist) + `*-noleak`/`*-contract` testleri (`provider-name-noleak-contract`, `catalog-noleak`, `provider-config-noleak`) + vite.config.ts `reject-template-guard` (SOURCE-time gate, scan:public bundle-time gate) |
| Migration | 19 dosya `0000…0018` (highest `0018_added_model_context.sql`; `0017_gozcu.sql` var). Yeni tablo: `... IF NOT EXISTS` + `schema.ts` Drizzle + `meta/_journal.json` sıralı güncellenir; deploy `db:migrate` çalıştırır |
| itest | gerçek Postgres (mock yok); `fileParallelism: false`; `itest-setup.ts` (mock-DB DEĞİL, real `./db/client`) |

### Raw-SQL Date param tuzağı (GOTCHA)
Raw `sql`/`dbSql` template literal'a doğrudan JS `Date` geçmek **runtime'da throw eder**: `TypeError: Received an instance of Date`. Önce serialize et: `${date.toISOString()}::timestamptz`. Pattern `mali-izleme-service.ts` `hasActivitySince()`, `gozcu/engine.ts`, `user-usage-stats-service.ts`'te. ⚠️ Bu yalnız **raw dbSql interpolasyonu** için — Drizzle'ın typed `gte()/lte()/eq()` operatörleri Date object'i sorunsuz kabul eder.

### DB client (`db/client.ts`)
Tek postgres-js pool (`max:10`). İki export aynı pool'u paylaşır: **`db`** = `drizzle(sql, {schema})` typed ORM; **`dbSql`** = raw postgres client (template-literal SQL, `dbSql.begin` transaction, limitless aggregate).

### env (`lib/env.ts`)
Tek env erişim noktası (Zod-validated `env`); doğrudan `process.env` kullanma. Import'ta `dotenv.config({path: NODE_ENV==='production' ? '.env.production' : '.env'})` + bare `dotenv.config()` fallback → sadece `NODE_ENV=production` set etmek `.env.production` okutur. Prod-only superRefine: `API_KEY_ENCRYPTION_SECRET` zorunlu + JWT_SECRET'tan farklı; WHATSAPP_OTP açıksa `WHATSAPP_OTP_HASH_SECRET` zorunlu + farklı (dev/test'te JWT_SECRET'a fallback). PORT default 4567, HOST 127.0.0.1 (loopback, yalnız nginx üzerinden).

---

## Test Katmanları
- **Unit (`*.test.ts`):** `npm test` (`vitest run`, `vitest.config.ts`) — DB-mock'lu/saf logic; setup `src/server/__tests__/setup.ts`
- **Contract (`*-contract.test.ts`):** bundle/sabit bütünlüğü (provider leak, fiyat parity, 42-lock, frontend display order, api-docs içerik). ⚠️ Dokümantasyon yüzeyi (`yapayzekalab/api-docs.js` + `tab-documents.jsx`) iki testle string/yapı-kilitli: `documents-content-contract` (zorunlu metinler: endpoint'ler, istemci adları, `ANTHROPIC_AUTH_TOKEN`, "Kod kopyala"/"Kopyalandı", TOC fn'leri) + `os-install-variants-contract` (her `osVariants` win/mac/linux dolu; Claude Code `$env:`/`setx`/`ANTHROPIC_AUTH_TOKEN`; Windows curl tek-satır `curl.exe`; her blokta `yzk_live_YOUR_KEY` placeholder). Dokümanı düzenlerken bunları koru.
- **Integration (`*.itest.ts`):** `npm run itest` (`--config vitest.itest.config.ts`) — gerçek Postgres (`db:up` + `db:migrate`); `fileParallelism:false`, timeout 30s
- **E2E:** `npm run e2e` (playwright chromium); setup `npm run e2e:up`
- **Smoke (`scripts/`):** canlı/local prod build'e HTTP probe (`smoke:vps`, `qa:uat`, `preflight:live`)

## Önemli Notlar
- Tüm env erişimi `src/server/lib/env.ts` (Zod) üzerinden; doğrudan `process.env` kullanma
- `scan:public` BUILT bundle'ı (dist/) tarar → `npm run build` SONRASI, deploy/commit ÖNCESI koş
- Money-critical tablolar: `users` (bakiyeTL numeric(14,4)), `transactions` (ledger, idempotencyKey UNIQUE), `usage_records` (costTL/costUsd, requestId UNIQUE), `payments`, `pendingIbanPayments`, `signupBonusGrants`, `systemConfig` (single-row id=1: kur/liveKur/kurBuffer + text/image/videoCarpan)
- **Ops / devir / çalışma modeli yzapi DIŞINDA:** `/Users/ufuk/yeniapi/.kiro/` — `steering/agent-team-workflow.md` (BAĞLAYICI: lider + uygulama ajanı + **3 QA, ≥2 PASS**), `CALISMA-GUNLUGU.md` (append-only, en yeni ALTTA). **Devir tek-doğruluk:** `docs/AI_HANDOFF.md` + `docs/OPERATIONS.md` (canlı status ile doğrula — eski raporlar tarihsel).