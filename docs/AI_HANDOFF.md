# AI HANDOFF — YapayZekaLab (yzapi)

> Bu belge bir AI/geliştirici session'ından diğerine devir içindir. Mevcut durumun
> tek doğruluk kaynağı. Yeni session BURADAN başlar.
>
> Son güncelleme commit: `c732666` · dal: `phase/release-vps-beta`
> Canlı deploy: `sync-20260531T115533Z-c732666` · aktif sağlayıcı: **wellflow**
>
> ## SON OTURUM ÖZETİ (2026-05-31 #3) — Floor fazla-faturalama düzeltmesi + Claude Code haiku-akını çözümü
> **İŞ HAFIZASI:** Detaylı adım-adım kayıt `.kiro/CALISMA-GUNLUGU.md`'de (her yeni sekme ÖNCE onu okur — bkz
> steering `calisma-gunlugu.md` "OTURUM BAŞLANGIÇ PROTOKOLÜ"). Spec: `.kiro/specs/cache-read-token-overcharge-fix/`.
>
> 1. **Floor fazla-faturalama (ÇÖZÜLDÜ, canlı):** Eski `max(sağlayıcı, char/4)` floor'u Claude Code büyük-JSON
>    isteklerinde char/4 gerçeğin ~3-4 katına şiştiği için sağlayıcı doğru raporlasa bile FAZLA faturalıyordu
>    (canlı: ussafak 5 kayıt, 39.122 fazla token ≈ ~1.29 TL). Çözüm: `resolveBilledPromptTokens(provider, guard)`
>    (request-guard-service.ts, eşik `PROVIDER_MIN_VALID_TOKENS=50`): sağlayıcı normalize > 50 ise ONA GÜVEN
>    (şişirme); ≤ 50 ise floor (kaçak koruması korunur). proxy.ts 3 success-settle noktası. **billing-service +
>    error-path DOKUNULMADI.** Commit `c732666`, deploy `sync-20260531T115533Z-c732666`. 332 unit + 26 itest +
>    build yeşil, 3/3 QA PASS, ledger drift=0.
> 2. **"Opus 4.7 ama Haiku" gizemi (BUG DEĞİL):** Müşteri Claude Code + agent teams kullanıyor; WellFlow doküman
>    config'i `ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4.5` + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` öneriyor →
>    yüzlerce haiku subagent çağrısı (farklı x-claude-code-agent-id). Ana model Opus 4.7 olsa da trafik çoğu haiku.
>    Sistem doğru, faturalama doğru. Doküman + canlı log + DB üçlü teyit.
> 3. **WellFlow gelecekteki denetim araçları (CALISMA-GUNLUGU'da detay):** `/v1/messages/count_tokens` (char/4
>    yerine kesin input), `/reseller/v1/usage/events` (`cost_your_cost_cents` = gerçek upstream maliyetimiz →
>    margin mutabakatı), `X-Wellflow-Reseller:true` (SSE'de kesin cost), `/v1/models/info` (cache_read/write fiyat).
> 4. **Admin panel detay özeti (ÇÖZÜLDÜ, canlı):** `/users/:id/detail` özet kutuları son-50 yerine ömür-boyu
>    aggregate'ten (limit(50) bug). Commit içinde deploy edildi. itest kilitliyor.
> 5. **AÇIK:** ussafak ~1.29 TL geçmiş fazla-faturalama telafisi (ayrı karar, henüz yapılmadı).
>
> ## ÖNCEKİ OTURUM ÖZETİ (2026-05-31 #2) — KRİTİK: giriş token kaçağı kapatıldı (cache token + floor)
> **Sorun (kök neden, kesin kanıtlı):** WellFlow giriş token'ını EKSİK raporluyordu. Anthropic
> `/v1/messages` şemasında gerçek giriş `cache_read_input_tokens` (ör. 67394) alanındaydı ama
> `input_tokens=2` geliyordu; `/v1/chat/completions`'ta dev promptta bile `prompt_tokens=2`. Eski
> `extractTokenUsage` yalnız `prompt_tokens ?? input_tokens` okuyup cache alanlarını ATLIYOR + kendi
> sunucu sayımımızı (`guard.contextTokens`) floor olarak kullanMIYORduk → giriş token'ı ~hiç
> faturalanmıyordu = ZARAR. Canlıda ~468 çağrı etkilenmiş (çoğu `ahmet.soylu341@gmail.com`),
> ~1500 TL tahmini gelir kaybı. **Drift=0** (az-tahsildi, kayıp-para/çift-tahsil DEĞİL).
>
> **Düzeltme (billing FORMÜLÜNE DOKUNULMADAN — yalnız token SAYISI):**
> 1. `closerouter-service.ts` → yeni pür+export `normalizeProviderUsage()`: OpenAI'de `prompt_tokens`
>    taban (cache zaten dahil → çift saymaz); Anthropic'te `input + cache_read + cache_create` toplanır.
>    `extractTokenUsage` + stream SSE parser ortak bu fonksiyonu kullanır. `stream_options.include_usage`
>    eklendi (stream'de kesin usage talep eder).
> 2. `proxy.ts` → 3 success settle çağrısında `billedPromptTokens = max(usage.promptTokens,
>    guard.contextTokens)` FLOOR. Hata-path settle'ları DEĞİŞMEDİ (K1 cost=0 korundu).
>
> **Doğrulama:** 3 QA PASS (matematik 7 senaryo elle-hesap=kod=test; DOKUNULMAZ billing diff boş; regresyon).
> `token-usage-normalize.test.ts` (9 test) + `money-flow.itest.ts` (KN-A cache / KN-B floor / temiz-bozulmaz).
> 321 unit + build + tsc yeşil. **CANLI KANIT:** 56000-char prompt → `input_usage=14013` (eskiden 2!),
> `cost_tl=0.5201`, raw `promptTokens:3` ama floor 14013 faturaladı → **FLOOR_CALISTI=true**.
> Commit `84e7b94`, deploy `sync-20260531T015939Z-84e7b94`.
>
> **AÇIK NOTLAR:** (a) Geçmiş 468 çağrının kaybı GERİ ALINAMAZ (raw_usage_json'da cache alanı saklanmamıştı).
> (b) ÖNERİ (henüz YAPILMADI): `raw_usage_json`'a sağlayıcının TAM usage objesini (cache dahil) kaydet →
> gelecekte denetim. (c) WellFlow suçlanmaz — hata BİZİM kodumuzdaydı (cache atlama + floor eksikliği).
> (d) Kalıcı denetim aracı: `scripts/token-accounting-probe.mjs`.
>
> ## ÖNCEKİ OTURUM ÖZETİ (2026-05-31 #1) — Wellflow geçişi + RooCode/timeout/saat fix + yeni fiyatlar
> Bu oturumda yapılan ve CANLIDA doğrulanan işler (tek-doğruluk):
> 1. **RooCode 500 / stream fix:** `closerouter-service.ts` `forwardChatStream` içindeki dinamik
>    `require("stream")` esbuild ESM bundle'da patlıyordu → her `stream:true` isteği 500/`upstream_error`.
>    Statik `import { Readable } from "stream"` ile çözüldü. Deploy sonrası RooCode 200, "Dynamic require" 0.
> 2. **Saat (trafik analizi):** sunucu UTC; `admin-traffic-service.bucketLabel` + email/günlük rapor
>    `toLocale*`'a `timeZone: "Europe/Istanbul"` eklendi (yalnız GÖSTERİM; bucket/billing değişmedi).
> 3. **Upstream timeout:** `default_request_timeout_ms` 60s→**180s**, `default_stream_timeout_ms` 120s→180s
>    (DEFAULT_API_SETTINGS + schema DDL + canlı DB satırı). Büyük promptlarda 60s AbortError kalktı.
> 4. **Sağlayıcı = Wellflow (BİRİNCİL):** `api.wellflow.dev/v1`, OpenAI+Anthropic uyumlu, reseller key (`wf_`).
>    `provider_profiles`'a `wellflow` profili eklendi (5 Claude modeli, model_map BOŞ — canonical tire-id'leri
>    doğrudan kabul ediyor) ve aktif yapıldı. metro + closerouter standby kaldı (silinmedi). Switch sırasında
>    `maintenance_mode_for_api` açıldı, bitince kapatıldı. **GPT/Gemini Wellflow'da YOK** → aktif katalog 5 Claude
>    modeline düştü (supportedModelIds filtresi). Wellflow ~109K token büyük promptu işledi; dinamik rate limit
>    (`org_queue_full` 429) yük anlarında görülür, 429'da 0 tahsil (K1).
> 5. **Yeni fiyatlar (USD/1M, input=output) — CANLIDA:** opus-4.8=1.40 (DB added_model), opus-4.7=1.25,
>    opus-4.6=**1.05** (açık), sonnet-4.6=0.78, haiku-4.5=0.70. `familyPrice` (master-models.ts) + `shared.jsx`
>    MODELS (frontend parity) + `model_overrides`/`added_models` DB + 2 fiyat contract testi güncellendi.
>    Billing FORMÜLÜ DEĞİŞMEDİ; yalnız müşteri fiyat sabitleri.
> 5b. **Plan limitleri:** pro günlük 200→**1000 TL**, aylık 2000→**10000 TL** (seed.ts + canlı DB). ücretsiz
>     5/50 AYNI kaldı. NOT: plan `aylikLimitTL` rate-limit'te ENFORCE EDİLMİYOR (sadece günlük + api_key spend cap
>     enforce; aylık plan limiti gösterim/kayıt). 429 `retryAfter:3600` = günlük TL limiti veya key spend cap dolması.
> 6. **Doküman (api-docs.js):** GPT/Gemini örnek/katalogları kaldırıldı, 5 Claude modeline hizalandı
>    (SDK curl/python, client kartları, Codex Claude'a yönlendirildi). tab-home pazarlama metni güncellendi.
> 7. **Doğrulama:** 312 test + build yeşil; canlı `/api/models` 5 model + tüm hedef fiyatlar DOĞRU;
>    sağlayıcı adı sızıntısı YOK; ledger drift=0; gerçek trafik 7×200 + 3×429.
> 8. **GÜVENLİK (✅ ROTE EDİLDİ — 2026-06-01, kullanıcı beyanı):** Wellflow key (`wf_...fpI2`) + metro key
>    (`sk-ant-...GBH5`) sohbette açık geçmişti; kullanıcı tarafından iptal/yenileme yapıldı.
> **NOT:** `user.ts` + `report-service.ts` (aylık rapor) paralel oturum işi olarak bulundu, deploy temiz-tree
> için `ef88630`'da commit'lendi; bu oturumda yazılmadı, sadece test+build yeşil doğrulandı.

---

## 1. Projenin genel amacı

YapayZekaLab, OpenAI-uyumlu bir **API gateway + panel**. Müşteri TL bakiye yükler,
`yzk_live_*` API key ile model bazlı "kullandıkça öde" mantığıyla LLM çağrısı yapar.
Satış/bakiye/ödeme/KDV/usage/API key/admin kontrolü tamamen kendi backend'inde.

Upstream akış (TASARIM KARARI): `Müşteri → YapayZekaLab /v1 → aktif sağlayıcı profili → upstream`.
Aktif sağlayıcı `provider_profiles` + `system_api_config.active_provider_id` ile seçilir; admin panelden
tek-tık metro⇄closerouter geçişi (restart yok). Şu an AKTİF: **metro** (`api.stepanovikov.uno/v1`).

## 2. Şu ana kadar yapılan işler (bu ve önceki session'lar)

### deploy-sync-hardening spec (TAMAMLANDI, canlıda)
- **K1** upstream hatasında 0 tahsil + usage="error" (`billing-service.ts`)
- **K2** request-id daima sunucu-üretimli (`middleware/request-id.ts`)
- **K3** ölü Gemini demo uçları (`/api/route-agent`, `/api/files/*`, `/api/logs`) tamamen kaldırıldı
- **K4** prod'da Telegram webhook secret zorunlu + timingSafeEqual (`routes/telegram.ts`, `routes/telegram-webhook-auth.ts`)
- **Y2** settle kısmi-commit düzeltmesi (overage'da tahsil düşmez)
- **Y3** orphan rezervasyon reaper job (`jobs/orphan-reservation-reaper-job.ts`)
- **Y4** prod'da `API_KEY_ENCRYPTION_SECRET` ayrı+zorunlu, çift-anahtar rotasyon (`db/rotate-api-key-cipher.ts`)
- **Y5** trust proxy = 1 (`app.ts`)
- settings POST → adminAuth, cryptomus timing-safe, JWT `algorithms:["HS256"]` pin

### Operasyon master planı (Faz 0-6 yapıldı; 7-11 YAPILMADI)
- **Faz 0** durum kilidi
- **Faz 1** tam backup + restore kanıtı: `_ops/backup-full.sh` sertleştirildi (belgeler watchdog-skip, live-app sunucu-tarafı tar). Kanıt: `/Users/ufuk/yeniapi/_backups/20260530T060105Z/` (4 enc + manifest + SHA256SUMS, verify=OK, PGDMP doğru)
- **Faz 2** SSH key auth (`~/.ssh/yzapi_vps`, `ssh yzapi-vps` alias). Şifre rotasyonu KULLANICIDA.
- **Faz 3** tek-komut deploy: `scripts/sync-deploy.sh` (rsync→ci→lint→test→build→migrate→restart→smoke→manifest). Canlıda çalıştı.
- **Faz 4** `/status` deterministik release pointer okur (`.deploy/current-release.json`)
- **Faz 5/6** finansal E2E: upstream hata=0 tahsil ✓, düşük bakiye=402 ✓, ledger drift=0 ✓. **ANCAK Faz 5 KRİTİK BLOCKER ortaya çıkardı (aşağıda).**

### Telegram bağlama (canlıda)
- `BOT_DOMAIN_INVALID` çözüldü: `login_url`/`web_app` → düz `url` butonları
- Onboarding → `/account?telegramConnect=1` → login sonrası otomatik deep-link connect
- `TELEGRAM_BOT_USERNAME` env eksikti, eklendi (deep-link bunsuz null dönüyordu)

## 3. Değiştirilen dosyalar (bu session ana kalemler)

Kaynak (`/Users/ufuk/yzapi`):
- `src/server/services/billing-service.ts` (K1, Y2 + testler)
- `src/server/middleware/request-id.ts` + `request-id.test.ts` (K2)
- `src/server/routes/telegram.ts`, `routes/telegram-webhook-auth.ts(.test)` (K4 + onboarding url)
- `src/server/services/telegram-bot-service.ts(.test)` (düz url butonları)
- `src/server/lib/env.ts` (Y4 superRefine, GEMINI kaldırıldı)
- `src/server/services/api-key-service.ts(.test)` (Y4 çift-anahtar)
- `src/server/db/rotate-api-key-cipher.ts` (YENİ), `db/migrate.ts` (ENV_FILE_PATH)
- `src/server/jobs/orphan-reservation-reaper-job.ts(.test)` (Y3)
- `src/server/app.ts` (createApp, Y5, ölü router mount'ları kaldırıldı)
- `src/server/services/status-service.ts(.test)` (Faz 4)
- `src/server/services/auth-service.ts` (JWT alg pin)
- `src/App.tsx`, `src/yapayzekalab/App.jsx`, `tab-account.jsx` (telegramConnect akışı)
- `scripts/sync-deploy.sh` (YENİ), `scripts/vps-deploy.sh` (guard), `tsconfig.json` (scope)
- `.env.example` (API_KEY_ENCRYPTION_SECRET, TELEGRAM_BOT_USERNAME dokümante)
- SİLİNDİ: `routes/legacy.ts`, `routes/files.ts`, `routes/logs.ts`
- `docs/vps-deploy.md` güncellendi

Ops (`/Users/ufuk/yeniapi/_ops`, git dışı): `backup-full.sh` sertleştirildi.

## 4. Alınan teknik kararlar

- Tek yetkili kaynak `kaynak` git reposu. `canli/src` referans alınmaz.
- Deploy yalnızca commit edilmiş koddan (`sync-deploy.sh` working-tree-clean guard).
- `/opt/turkapiprojesi` git DEĞİL → deploy = rsync + sunucu-tarafı gate. `--delete` YOK.
- Tek admin: `cix.crazy666@gmail.com` (kod sabiti, 3 contract test kilitliyor — DEĞİŞTİRME).
- JWT iss/aud EKLENMEDİ (bilinçli: oturum düşürmemek için; algorithms zaten pinli).
- Backup: live-app node_modules HARİÇ (npm ci ile yeniden üretilir), belgeler-api watchdog ile atlanabilir.

## 5. Devam eden / kalan görevler

- **Master plan Faz 7** admin API runtime testi — ✅ DOĞRULANDI (28 admin testi, single-admin allowlist, tüm `/api/admin/*` adminAuth+whatsapp arkasında)
- **Faz 8** Telegram opsiyonel akış — ✅ DOĞRULANDI (34 telegram testi; token boşsa 503/no-crash, prod webhook secret guard). Bağsız kullanıcı canlı uçtan-uca akışı funded key (BLOCKER-1) gerektirir.
- **Faz 9** otomatik backup cron — ✅ HAZIR ama KURULMADI: `_ops/backup-cron.sh` (wrapper+retention+log) + `docs/backup-cron.md`. Crontab girdisi operatörce kurulacak (NEEDS_USER_INSTALL).
- **Faz 10** operasyon dokümanı — ✅ YAPILDI: `docs/OPERATIONS.md` (tam operatör el kitabı) + `docs/backup-cron.md`.
- **Faz 11** final satış-öncesi gate — KISMİ: yerel build/test/lint yeşil + canlı health/status yeşil; gerçek `/v1` 200+bakiye kanıtı BLOCKER-1'e bağlı (henüz "satışa hazır" DENMEZ).

## 6. AÇIK BUGLAR / BLOCKER

### ✅ metro-provider-switch + repricing: TAMAMLANDI (2026-05-30) — CANLIDA

- **Ne yapıldı:** İki sağlayıcı profili (metro AKTİF, closerouter yedek) + aktif-profile göre katalog
  görünürlüğü + 2 yeni model (added_models katmanı) + onaylı yeniden fiyatlama (×5/6 kilitli tablo).
- **Spec:** `.kiro/specs/metro-provider-switch/` (8 görev, hepsi `[x]`, agent ekibi + 3 QA/görev).
- **Commit'ler:** `69b2d55` (repricing), `c6606fc` (feature), `e58029a` (model_map fix + seed).
  Deploy: `sync-20260530T194227Z-e58029a`.
- **KRİTİK ÖĞRENİM (model_map):** Profil `model_map` (katalog-id → upstream-wire-id) tanımlıydı ama
  upstream çağrıda UYGULANMIYORDU; itest nock kullandığı için bunu yakalamadı — ancak deploy sırasında
  GERÇEK metro endpoint testi ortaya çıkardı. Metro bazı modelleri farklı isimle bekliyor (canonical
  `claude-sonnet-4-6` → metro `claude-sonnet-4.6`). `closerouter-service.applyProfileModelMap()` ile
  kapatıldı (forwardChat/forwardTextEndpoint/forwardChatStream). **Billing'e dokunulmadı:** master model
  + cost canonical id'den proxy.ts'de çözülür; model_map yalnız upstream'e giden wire ismini değiştirir.
  → DERS: yeni sağlayıcı eklerken model adı formatını GERÇEK endpoint'te doğrula (mock yetmez).
- **Canlı profiller:** metro (AKTİF, key `sk-****GBH5`, 9 model, 3 map), closerouter (yedek,
  `api.claude-popusk.shop/v1`, env key fallback, 41 model). Seed: `scripts/seed-provider-profiles.ts`
  (METRO_API_KEY env'den; key hardcoded DEĞİL; added_models inline idempotent seed).
- **CANLI KANIT (funded `yzk_live_****6cda`):** claude-sonnet-4-6 (map'li)→200 −0.0023TL · gpt-5.4→200 ·
  claude-opus-4.8→200 · gemini-3.5-flash→200 · claude-opus-4-7→200 (hepsi usage=success). Desteklenmeyen
  gpt-5.4-mini→404 (0 tahsil). `/api/models` tam 9 metro modeli. **Ledger drift=0.** aiProvider=ok.
- **Fiyatlar:** onaylı kilitli tabloya göre ayarlandı. **GÜNCELLEME (2026-05-31):** Claude ailesi
  yeniden fiyatlandı → claude-opus-4.8=1.40, claude-opus-4.7=1.25, claude-opus-4.6=1.05,
  claude-sonnet-4.6=0.78, claude-haiku-4.5=0.70 (USD/1M, input=output; her yerde aynı: master-models
  familyPrice + added_models seed + shared.jsx + contract testleri). DOKUNULMAZ billing FORMÜLÜ
  değişmedi; sadece müşteri fiyat sabitleri (USD bazlı, billing otomatik bu sabitleri okur).
- **GÜVENLİK (✅ ROTE EDİLDİ — 2026-06-01, kullanıcı beyanı):** metro key (`sk-ant-api01-...BH5`) ve Claude Popusk key (`sk-****UHNk`) sohbette açık geçmişti; iptal/yenileme yapıldı.

### ✅ BLOCKER-1: ÇÖZÜLDÜ (2026-05-30) — yeni sağlayıcı Claude Popusk
- **Kök neden:** CloseRouter kapandı; canlı `.env.production` geçici olarak yerel OmniRoute'a (`127.0.0.1:20128`) yönlendirilmişti, o da provider credential'sızdı → tüm modeller 400/502.
- **Çözüm (kullanıcı onayıyla A-B-C uygulandı):**
  - Yeni sağlayıcı **Claude Popusk** (`https://api.claude-popusk.shop/v1`, OpenAI-uyumlu, Bearer). Doküman: https://docs.claude-popusk.shop/
  - Canlı env: `AI_PROVIDER_BASE_URL=https://api.claude-popusk.shop/v1` + `AI_PROVIDER_API_KEY=sk-****UHNk`; eski `CLOSEROUTER_*` satırları boşaltıldı. Yedek: `.env.production.bak.20260530T111925Z`.
  - Katalog 42 modelin 41'i sağlayıcıda birebir var; tek istisna `gemini-3-pro-preview` sağlayıcıda yok (404) → `model_overrides` tablosunda `enabled=false` yapıldı (kod/fiyat/test değişmedi).
  - `OMNIROUTE_MODEL_MAP` zaten yalnız `127.0.0.1:20128`/`api.seslab.tr` için aktif → yeni base URL'de kendiliğinden devre dışı (koda dokunulmadı).
- **CANLI KANIT (funded key `yzk_live_****6cda`):** `/v1/chat/completions` → **200**, bakiye 925.2764 → 925.2759 (−0.0005 TL), `usage_records.status=success`. 6 model ailesi (Claude/GPT-5.4-mini/GPT-5.5/o4-mini/Gemini-3.1) hepsi 200+düşüm. `gemini-3-pro-preview` → 403 "Model disabled". **Ledger drift=0.**
- **Fiyatlar DEĞİŞMEDİ** (talimat + DOKUNULMAZ kuralı): `pricing-service`, `pricing/`, `customerInputUsd` aynı.
- **GÜVENLİK (✅ ROTE EDİLDİ — 2026-06-01, kullanıcı beyanı):** sohbette geçen sağlayıcı key'i (`sk-****UHNk`) iptal/yenileme yapıldı.

### Katalog ↔ upstream isim uyuşmazlığı — ✅ profil model_map ile çözüldü
- Aktif profil `model_map` (katalog-id → upstream-wire-id) artık upstream'e uygulanıyor
  (`closerouter-service.applyProfileModelMap`). Metro için 3 map aktif (claude-opus-4-6/sonnet-4-6/haiku-4-5).
- Eski `OMNIROUTE_MODEL_MAP` (`closerouter-service.ts`) yalnız 127.0.0.1:20128/api.seslab.tr için; metro/popusk'ta devre dışı.

## 7. Son çalıştırılan testler

- Yerel: `npm test` → **299 passed**, `npx tsc --noEmit` temiz, `npm run build` temiz (dist/server.js ~358kb)
- itest: `npm run itest` → **14 passed** (K1/K2 + metro-provider-switch gerçek DB; gerektirir: `npm run db:up` + migrate 0013)
- e2e: `npm run e2e` → 17 passed (önceki turda; Playwright)
- Canlı (deploy `sync-20260530T194227Z-e58029a`): `/health` 200, `/status` 200 (aiProvider=ok), ledger drift=0,
  funded `/v1` metro 200 + bakiye düşümü (5 model türü), desteklenmeyen model 404 (0 tahsil).

## 8. Başarısız denemeler (tekrarlama)

- Belgeler-api backup ilk denemede `tar SEEK_HOLE timeout` (34K dosya, Documents senkron yavaş) → watchdog-skip eklendi.
- live-app SSHFS mount üzerinden tar dayanılmaz yavaş → uzak helper'da sunucu-tarafı tar'a taşındı.
- Telegram `login_url` BotFather domain gerektirir (`BOT_DOMAIN_INVALID`) → düz url'e geçildi.
- `migrate.ts` `ENV_FILE_PATH` okumuyordu → düzeltildi.

## 9. Riskli alanlar

- **Canlı `.env.production` upstream satırı** — yanlış değiştirme tüm API'yi keser.
- **API_KEY_ENCRYPTION_SECRET** — değişirse mevcut cipher'lar çözülemez (rotasyon scripti şart).
- **DB migration** — `/opt/turkapiprojesi` git değil; migrate ENV_FILE_PATH ile çalışır.
- **canli/src vs çalışan dist** — geçmişte sapma vardı; deploy daima `kaynak`'tan.
- Geçmiş sohbetlerde VPS root + cPanel + CLOSEROUTER_API_KEY şifreleri açık geçmişti → ✅ ROTE EDİLDİ (2026-06-01, kullanıcı beyanı).

## 10. DOKUNULMAMASI gereken dosyalar / mantıklar

- `ADMIN_EMAIL = "cix.crazy666@gmail.com"` (admin-auth.ts) ve `SINGLE_ADMIN_EMAIL` (admin.ts) — 3 contract test kilitler.
- `billing-service.ts` settle/charge transaction mantığı — para güvenliği, K1/Y2 kritik.
- `rejected-template-guard.test.ts` fingerprint listesi — frontend tema sözleşmesi.
- 501 görsel/video uçları — bilinçli kapalı, kapsam dışı.
- `MASTER_MODELS` 42-kilit (master-models.ts) — yeni model EKLENMEZ; `added_models` katmanında tutulur.
- `provider_profiles` aktif profil mantığı — metro AKTİF, closerouter yedek; switch admin panelden.
- **`normalizeProviderUsage()` (closerouter-service.ts) + proxy.ts success-settle FLOOR** — giriş token
  kaçağını kapatan mantık. OpenAI'de cache EKLENMEZ (çift sayım), Anthropic'te cache TOPLANIR; success
  settle'da `max(usage, guard.contextTokens)`. Hata-path floor uygulaMAZ (K1 cost=0). Token SAYISI mantığı;
  billing FORMÜLÜ değil. `token-usage-normalize.test.ts` 9 test + money-flow.itest KN-A/KN-B kilitler.

## 11. Yeni session'da İLK yapılacak net görev

**Satışa hazırlık doğrulaması (BLOCKER kalmadı).** metro aktif + canlı kanıtlandı (funded /v1 200, drift=0).
Yeni session başlarken:
1. `/status` + `/health` yeşil mi, aktif sağlayıcı beklenen mi (`provider_profiles`'tan kontrol).
2. Sağlayıcı değiştirmek gerekirse: admin panel → Sağlayıcı sekmesi → metro⇄closerouter tek-tık
   (veya `scripts/seed-provider-profiles.ts` ACTIVE_PROVIDER env'i ile). Restart gerekmez.
3. Yeni sağlayıcı eklenirken model adı formatını **gerçek endpoint'te** doğrula; gerekirse `model_map` doldur.
4. **GÜVENLİK (✅ ROTE EDİLDİ — 2026-06-01, kullanıcı beyanı):** metro key (`sk-ant-api01-...BH5`) + Claude Popusk key (`sk-****UHNk`) sohbette açık geçmişti; iptal/yenileme yapıldı.

Çalışma kuralları: kod düzeltmeleri `kaynak`'ta + `npm test`/`tsc`/`itest` yeşil + `sync-deploy.sh` ile deploy.
Agent ekibi modeli (`.kiro/steering/agent-team-workflow.md`): her görev → uygulama ajanı → 3 QA (2/3 PASS).
