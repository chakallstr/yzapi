# OPERATIONS — YapayZekaLab (yzapi)

Operatör el kitabı. Pratik komutlar ve prosedürler. Mimari/devir bağlamı için
`docs/AI_HANDOFF.md` ve `.kiro/steering/*` dosyalarına bak.

## 1. Proje özeti

OpenAI-uyumlu **API gateway + panel**. Müşteri TL bakiye yükler, `yzk_live_*` API
key ile "kullandıkça öde" mantığıyla LLM çağrısı yapar. Backend Node 22 + Express +
TypeScript (ESM), frontend React 19 + Vite SPA, DB PostgreSQL 14 + Drizzle.

- Kaynak (git): `/Users/ufuk/yzapi` (workspace'te `kaynak` symlink), dal `phase/release-vps-beta`.
- Canlı: `root@91.228.227.88:/opt/turkapiprojesi`, systemd `turkapiprojesi`, port 4568, nginx proxy.
- Public URL: `https://yapayzekalab.org`.

## 2. Ortam değişkenleri (env)

- Şema + tüm açıklamalar: `kaynak/.env.example` (tek referans).
- Dev: `kaynak/.env`. Canlı: `/opt/turkapiprojesi/.env.production` (izin 600).
- **Zorunlu (prod):** `DATABASE_URL`, `JWT_SECRET` (≥32), `API_KEY_ENCRYPTION_SECRET`
  (≥32, JWT_SECRET'tan FARKLI), WhatsApp OTP açıksa `WHATSAPP_OTP_HASH_SECRET`.
- **Upstream (aktif sağlayıcı profili öncelikli):** çözüm sırası: aktif `provider_profiles` profili
  (`system_api_config.active_provider_id`) → `system_api_config` DB değeri → env `AI_PROVIDER_BASE_URL`
  → kod-içi varsayılan. Anahtar aynı sırayla profil cipher → DB cipher → env. Hepsi boşsa `/v1` 503 döner.
  **Aktif/yedek sağlayıcı profilleri admin panelden yönetilir** (base URL'ler DB'de tutulur).
- **Opsiyonel:** Telegram, Shopier, Cryptomus, Crypto Pay, email — hepsi boşken ilgili uç 503 verir, app çökmez.

> ⚠️ Canlı `.env.production` upstream satırı yanlış değişirse tüm `/v1` kesilir.
> Değiştirmeden önce mevcut satırı yedekle, sonra hemen smoke test (bkz §9).
> Sağlayıcı değiştirmenin GÜVENLİ yolu env değil: admin panel → Sağlayıcı sekmesi → profil
> tek-tık (restart yok) veya `scripts/seed-provider-profiles.ts` (bkz §18).

## 3. Yerel başlatma

```bash
cd /Users/ufuk/yeniapi/kaynak
npm ci                 # bağımlılıklar (deploy'da da bu)
npm run dev            # tsx watch dev server (port 4567)
```

## 4. Build / test / lint komutları

```bash
npm run lint           # tsc --noEmit (tip kontrol)
npm test               # vitest run — unit + contract (~278 test, DB'siz)
npm run build          # vite build + esbuild → dist/server.js
npm run itest          # gerçek DB + nock money-flow (önce: npm run db:up + db:migrate)
npm run e2e            # playwright (chromium; ayrı terminalde npm run e2e:up)
npm run scan:public    # public bundle secret/formül taraması
```

## 5. Admin runtime test prosedürü

- Admin yetkisi yalnızca `cix.crazy666@gmail.com` Google hesabıyla (ayrı şifre yok).
- Tüm `/api/admin/*` uçları `adminAuth + requireWhatsappVerified` arkasında.
- Otomatik: `npm test -- admin` (28 test — single-owner, auth, traffic, billing-guard, override UI).
- Manuel (canlı, read-only): admin Google ile giriş → panel → `/api/admin/reconciliation`
  drift=0 olmalı; `/api/admin/api-settings` ve `/api/admin/config` okunabilir olmalı.
- Negatif: admin olmayan token ile `/api/admin/me` → 403 `Admin email required`.

## 6. Telegram opsiyonel akış prosedürü

- Telegram **opsiyonel**. `TELEGRAM_BOT_TOKEN` boşsa `/api/telegram/*` 503 döner, app çökmez,
  delivery-recovery job erken çıkar, deep-link `null` döner.
- Prod webhook secret zorunlu: `TELEGRAM_WEBHOOK_SECRET` boşsa prod'da tüm webhook update'leri reddedilir (K4).
- Deep-link için `TELEGRAM_BOT_USERNAME` (@'sız) gerekir; yoksa `getMe()`'ye düşer.
- Otomatik: `npm test -- telegram` (34 test). **Gerçek kullanıcıya mesaj gönderme** — yalnız test bot/chat ile.

## 7. Backup prosedürü

- Detaylı rehber: `docs/backup-cron.md`.
- Komut: `/Users/ufuk/yeniapi/_ops/backup-cron.sh` (sırları `_ops/backup.secrets.env`'den okur).
- Elle/interaktif: `_ops/backup-full.sh` (parolaları sorar).
- Çıktı: `/Users/ufuk/yeniapi/_backups/<UTC-timestamp>/` (4 `*.enc` + manifest + SHA256SUMS).
- Doğrula: `BACKUP_ENCRYPTION_PASSWORD=... _ops/verify-backup.sh _backups/<timestamp>`.

## 8. Cron kurulum prosedürü

- Yedek cron'u **yerel Mac** kullanıcı crontab'ında kurulur (canlı VPS'te DEĞİL).
- Önerilen: `0 3 * * * /Users/ufuk/yeniapi/_ops/backup-cron.sh >> /Users/ufuk/yeniapi/_backups/_logs/backup-cron.log 2>&1`
- Kurulum adımları + macOS Full Disk Access notu: `docs/backup-cron.md` §"Cron kurulumu".
- **Bu repo cron'u otomatik kurmaz** — operatör onayıyla uygulanır.

## 9. Restore prosedürü

1. `_ops/verify-backup.sh _backups/<timestamp>` ile yedeği doğrula.
2. DB: `openssl enc -d -aes-256-cbc -pbkdf2 -in live-db.dump.enc -out live-db.dump -pass env:BACKUP_ENCRYPTION_PASSWORD`
3. `pg_restore --clean --if-exists -d <DATABASE_URL> live-db.dump`
4. App gerekirse `live-app.tar.gz.enc` çöz + aç. Adım adım: `_ops/restore-guide.sh`.
- Restore canlı DB'yi değiştirir → yalnız felaket kurtarma/staging'de, onaylı.

## 10. Log konumları

- Canlı app: `journalctl -u turkapiprojesi` (systemd), nginx `/var/log/nginx/`.
- Backup: `_backups/<timestamp>/backup.log` + rotasyon `_backups/_logs/backup-cron.log`.
- Uygulama logu: pino (stdout, prod'da journald'a akar; secret redaction aktif).

## 11. Health check

```bash
curl -s https://yapayzekalab.org/health   # {status:ok, checks:{db,aiProvider,...}}
curl -s https://yapayzekalab.org/status   # release pointer (deploy.id/commit), modelCount
curl -s https://yapayzekalab.org/api/models | head   # 42 model (public)
```

## 12. Sık karşılaşılan hata senaryoları

- **`/v1` 503**: upstream key/base boş veya yanlış. `.env.production` upstream satırını kontrol et.
- **`/v1` 402**: kullanıcı bakiyesi yetersiz (reserve aşaması) — beklenen davranış.
- **Upstream model 400/402**: upstream sağlayıcı tarafı (credential/workspace) — faturada 0 tahsil (K1).
- **Telegram 503**: `TELEGRAM_BOT_TOKEN` set değil — opsiyonel, kasıtlı.
- **503 genel**: `docs/incident-503-runbook.md`.

## 13. Güvenli yeniden başlatma

```bash
ssh yzapi-vps "systemctl restart turkapiprojesi && sleep 3 && systemctl is-active turkapiprojesi"
curl -s https://yapayzekalab.org/health   # restart sonrası doğrula
```

## 14. Deploy (referans)

```bash
cd /Users/ufuk/yeniapi/kaynak
bash scripts/sync-deploy.sh --dry-run   # plan + working-tree-clean kontrol
bash scripts/sync-deploy.sh             # rsync→ci→lint→test→build→migrate→restart→smoke
```

## 15. ONAY OLMADAN DEĞİŞTİRİLMEZ

- **Pricing** (`pricing-service.ts`, USD bazlı, KDV %20).
- **Credit / billing** (`billing-service.ts` reserve/settle — K1/Y2 para garantileri).
- **Payment** (Shopier/Cryptomus/Crypto Pay webhook imza + idempotency).
- **API key logic** (`api-key-service.ts` bcrypt + AES-GCM, `API_KEY_ENCRYPTION_SECRET`).
- **Production DB** (migration dışında elle değişiklik yok).
- **Design / template / branding** (`rejected-template-guard.test.ts` kilitler).
- **Tek-admin allowlist** (`cix.crazy666@gmail.com` — 3 contract test).

## 16. Satış-öncesi kontrol listesi

- [x] BLOCKER-1 ÇÖZÜLDÜ: canlı upstream gerçek model çağrısında 200 + doğru bakiye düşümü kanıtlandı
  (metro, funded `yzk_live_****6cda`; 5 model türü 200+düşüm, drift=0 — bkz §18 + AI_HANDOFF).
- [x] App build/test yeşil (299 unit + 14 itest, tsc temiz).
- [x] Admin runtime doğrulandı (28 test, single-admin).
- [x] Telegram opsiyonel davranış doğrulandı (34 test).
- [x] Backup script + verify + cron wrapper + docs hazır.
- [ ] Backup cron operatörce kuruldu (onay bekliyor).
- [x] `.env.example` tam ve güncel.
- [x] Ledger drift=0, `/health`+`/status` yeşil.
- [ ] **Sohbette açık geçen sırlar rote edildi** (VPS/cPanel + metro key `sk-ant-api01-...BH5` +
  Claude Popusk key `sk-****UHNk`) — AÇIK, operatörce yapılacak.

## 17. Live /v1 funded smoke test

`scripts/live-v1-funded-smoke-test.mjs` — funded bir API key ile gerçek `/v1/chat/completions`
çağrısının 200 döndüğünü ve bakiyenin gerçekten düştüğünü kanıtlar. Key plaintext ASLA
yazılmaz (yalnız `yzk_live_****<son4>` maskeli). İstek `max_tokens=1` + "ping" ile maliyet-cap'li.

```bash
# VPS'te (app port 4568, prod env):
ssh yzapi-vps
cd /opt/turkapiprojesi
set -a; . ./.env.production; set +a
node scripts/live-v1-funded-smoke-test.mjs            # en yüksek bakiyeli aktif key
SMOKE_MODEL=<model-id> node scripts/live-v1-funded-smoke-test.mjs
API_KEY_ID=<uuid> node scripts/live-v1-funded-smoke-test.mjs
```

Çıktı JSON: `status_code`, `masked_api_key`, `before/after_balance_tl`, `deducted_tl`,
`usage`, `usage_record`. **PASS şartı: status_code=200 VE deducted_tl>0.**

> 2026-05-30 metro ölçümü (PASS): claude-sonnet-4-6 (map'li, upstream'e claude-sonnet-4.6) →200 −0.0023TL,
> gpt-5.4 →200, claude-opus-4.8 →200, gemini-3.5-flash →200, claude-opus-4-7 →200 (hepsi usage=success).
> Desteklenmeyen gpt-5.4-mini →404 (0 tahsil). Ledger drift=0.

## 18. Upstream sağlayıcı profilleri: metro (aktif) + closerouter (yedek) — 2026-05-30

İki sağlayıcı profili `provider_profiles` tablosunda; aktif olan `system_api_config.active_provider_id`
ile seçilir. Geçiş admin panelden tek-tık (restart yok — cache invalidate).

**metro (AKTİF):**
- Base URL: `https://api.stepanovikov.uno/v1` · Auth: `Bearer <key>` (OpenAI-uyumlu).
- 9 model destekler: gpt-5.5, gpt-5.4, claude-opus-4-7, claude-opus-4-6, claude-sonnet-4-6,
  claude-haiku-4-5-20251001, gemini-3.1-pro-preview, gemini-3.5-flash (eklenen), claude-opus-4.8 (eklenen).
- **model_map (3):** metro bazı modelleri nokta-form bekler → `claude-opus-4-6`→`claude-opus-4.6`,
  `claude-sonnet-4-6`→`claude-sonnet-4.6`, `claude-haiku-4-5-20251001`→`claude-haiku-4.5`.
  Map `closerouter-service.applyProfileModelMap()` ile upstream'e uygulanır; billing'e dokunmaz
  (cost canonical id'den çözülür, yalnız wire ismi değişir).

**closerouter (YEDEK):**
- Base URL: `https://api.claude-popusk.shop/v1` (Claude Popusk) · env key fallback (`AI_PROVIDER_API_KEY`).
- 41 master model (`gemini-3-pro-preview` hariç — sağlayıcıda yok, `model_overrides` enabled=false).

**Sağlayıcı değiştirme / yeniden seed:**
```bash
# Tek-tık: admin panel → Sağlayıcı sekmesi → metro ⇄ closerouter.
# Veya script (METRO_API_KEY env'den; key dosyaya/loga yazılmaz, maskeli özet):
ssh yzapi-vps
cd /opt/turkapiprojesi
ENV_FILE_PATH=.env.production NODE_ENV=production METRO_API_KEY='<key>' \
  ACTIVE_PROVIDER=metro npx tsx scripts/seed-provider-profiles.ts
```

> Yeni sağlayıcı eklerken: model adı formatını GERÇEK endpoint'te doğrula (`curl .../v1/models` +
> birkaç `chat/completions` denemesi). Canonical katalog id ≠ upstream wire id ise `model_map` doldur.
> **127.0.0.1:20128 (OmniRoute) yerel ölü uçtur — geri döndürme.**
- Sağlayıcı değişiminde: env'i güncelle → `systemctl restart turkapiprojesi` → §17 funded smoke test → ledger drift=0.
- e2e: `E2E_BASE_URL=https://yapayzekalab.org E2E_FUNDED_KEY=<key> npx playwright test e2e/provider-migration.e2e.ts`
  (key env'den verilir, koda yazılmaz).
- Sağlayıcı modellerini listele: `curl -s https://api.claude-popusk.shop/v1/models -H "Authorization: Bearer <key>"`.
