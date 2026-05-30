# AI HANDOFF — YapayZekaLab (yzapi)

> Bu belge bir AI/geliştirici session'ından diğerine devir içindir. Mevcut durumun
> tek doğruluk kaynağı. Yeni session BURADAN başlar.
>
> Son güncelleme commit: `d6ca658` · dal: `phase/release-vps-beta`

---

## 1. Projenin genel amacı

YapayZekaLab, OpenAI-uyumlu bir **API gateway + panel**. Müşteri TL bakiye yükler,
`yzk_live_*` API key ile model bazlı "kullandıkça öde" mantığıyla LLM çağrısı yapar.
Satış/bakiye/ödeme/KDV/usage/API key/admin kontrolü tamamen kendi backend'inde.

Upstream akış (TASARIM KARARI): `Müşteri → YapayZekaLab /v1 → CloseRouter → sağlayıcılar`.

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

### ✅ BLOCKER-1: ÇÖZÜLDÜ (2026-05-30) — yeni sağlayıcı Claude Popusk
- **Kök neden:** CloseRouter kapandı; canlı `.env.production` geçici olarak yerel OmniRoute'a (`127.0.0.1:20128`) yönlendirilmişti, o da provider credential'sızdı → tüm modeller 400/502.
- **Çözüm (kullanıcı onayıyla A-B-C uygulandı):**
  - Yeni sağlayıcı **Claude Popusk** (`https://api.claude-popusk.shop/v1`, OpenAI-uyumlu, Bearer). Doküman: https://docs.claude-popusk.shop/
  - Canlı env: `AI_PROVIDER_BASE_URL=https://api.claude-popusk.shop/v1` + `AI_PROVIDER_API_KEY=sk-****UHNk`; eski `CLOSEROUTER_*` satırları boşaltıldı. Yedek: `.env.production.bak.20260530T111925Z`.
  - Katalog 42 modelin 41'i sağlayıcıda birebir var; tek istisna `gemini-3-pro-preview` sağlayıcıda yok (404) → `model_overrides` tablosunda `enabled=false` yapıldı (kod/fiyat/test değişmedi).
  - `OMNIROUTE_MODEL_MAP` zaten yalnız `127.0.0.1:20128`/`api.seslab.tr` için aktif → yeni base URL'de kendiliğinden devre dışı (koda dokunulmadı).
- **CANLI KANIT (funded key `yzk_live_****6cda`):** `/v1/chat/completions` → **200**, bakiye 925.2764 → 925.2759 (−0.0005 TL), `usage_records.status=success`. 6 model ailesi (Claude/GPT-5.4-mini/GPT-5.5/o4-mini/Gemini-3.1) hepsi 200+düşüm. `gemini-3-pro-preview` → 403 "Model disabled". **Ledger drift=0.**
- **Fiyatlar DEĞİŞMEDİ** (talimat + DOKUNULMAZ kuralı): `pricing-service`, `pricing/`, `customerInputUsd` aynı.
- **GÜVENLİK:** sohbette geçen yeni sağlayıcı key'i (`sk-****UHNk`) rote edilmeli.

### Katalog ↔ upstream isim uyuşmazlığı
- Public katalog `gpt-5.4`, `claude-sonnet-4-...` gösteriyor; OmniRoute `cx/`, `cc/`, `seslab-auto` prefix bekliyor.
- `closerouter-service.ts:30` `OMNIROUTE_MODEL_MAP` sadece 1 model map'liyor.

## 7. Son çalıştırılan testler

- Yerel: `npm test` → **278 passed (64 dosya)**, `npx tsc --noEmit` temiz, `npm run build` temiz (dist/server.js 336kb)
- Faz 7-11 turu (2026-05-30): `npm test -- admin` 28 passed, `npm test -- telegram` 34 passed, lint temiz, build temiz
- itest: `npm run itest` → 3 passed (K1/K2 gerçek DB, gerektirir: `npm run db:up` + migrate)
- e2e: `npm run e2e` → 17 passed (önceki turda; Playwright)
- Canlı: `/health` 200 (db=ok, aiProvider=ok), `/status` 200 (modelCount=42, deploy.id sync-...-d6ca658), ledger drift=0

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
- Bu sohbette VPS root + cPanel + CLOSEROUTER_API_KEY şifreleri açık geçti → KULLANICI ROTE ETMELİ.

## 10. DOKUNULMAMASI gereken dosyalar / mantıklar

- `ADMIN_EMAIL = "cix.crazy666@gmail.com"` (admin-auth.ts) ve `SINGLE_ADMIN_EMAIL` (admin.ts) — 3 contract test kilitler.
- `billing-service.ts` settle/charge transaction mantığı — para güvenliği, K1/Y2 kritik.
- `rejected-template-guard.test.ts` fingerprint listesi — frontend tema sözleşmesi.
- 501 görsel/video uçları — bilinçli kapalı, kapsam dışı.

## 11. Yeni session'da İLK yapılacak net görev

**BLOCKER-1'i çöz:** Kullanıcıya canlı upstream kararını sor:
(a) `.env.production` `CLOSEROUTER_BASE_URL`/`CLOSEROUTER_API_KEY`'i gerçek CloseRouter'a geri çevir, VEYA
(b) OmniRoute'a sağlayıcı credential gir + `OMNIROUTE_MODEL_MAP`'i 42 model için doldur.
Karar alındıktan sonra funded test key ile gerçek `/v1/chat/completions` çağrısının 200 + doğru bakiye düşümü yaptığını canlıda kanıtla. Bu olmadan "satışa hazır" DENMEZ.

Çalışma kuralları: kod düzeltmeleri `kaynak`'ta + `npm test`/`tsc` yeşil + `sync-deploy.sh` ile deploy.
