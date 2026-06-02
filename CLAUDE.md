# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje Özeti

**YZ API** — TL bakiye bazlı AI API gateway. Kullanıcı TL yükler, API key alır, model kullanımı kadar bakiyeden düşülür. 33+ model, OpenAI-uyumlu `/v1` endpoint'leri. Tek instance VPS deploy.

- **Stack:** Express + TypeScript backend, React/JSX SPA frontend (Vite), PostgreSQL (Drizzle ORM), Vitest
- **Upstream:** `AI_PROVIDER_BASE_URL` + `AI_PROVIDER_API_KEY` env ile yapılandırılır (aktif provider `provider_profiles` tablosundan okunur)
- **Deploy hedefi:** `/opt/yapayzekalab` — systemd + Nginx reverse proxy

---

## Komutlar

```bash
# Geliştirme
npm run dev          # tsx watch (backend) + Vite HMR (frontend birlikte)
npm run lint         # tsc --noEmit (TypeScript tip kontrolü)
npm test             # Vitest unit testler (DB gerektirmez)
npm run test:watch   # İnteraktif watch modu

# Integration testleri (gerçek Postgres gerekir)
npm run db:up        # Docker Compose ile Postgres başlat
npm run db:migrate   # Migrations uygula
npm run itest        # *.itest.ts dosyalarını çalıştır (fileParallelism: false)

# Tek test dosyası çalıştırma
npx vitest run src/server/services/billing-service.test.ts
npx vitest run --config vitest.itest.config.ts src/server/__tests__/money-flow.itest.ts

# Build & deploy
npm run build        # Vite (frontend) + esbuild (backend) → dist/
npm run scan:public  # Provider codename sızıntı taraması (commit öncesi çalıştır)
npm run deploy:vps   # VPS deploy scripti
npm run smoke:vps    # VPS smoke testi

# DB yönetimi
npm run db:migrate   # Migrations uygula
npm run db:seed      # Seed verisi
npm run db:studio    # Drizzle Studio UI
```

---

## Mimari

### Katmanlar

```
src/
├── server/
│   ├── app.ts              — Express app factory (createApp); route mounting
│   ├── index.ts            — Entry point; server start, Vite dev middleware, jobs
│   ├── routes/             — HTTP handler'lar
│   │   ├── proxy.ts        — /v1/* → upstream proxy, billing entegrasyonu
│   │   ├── admin.ts        — Admin CRUD + mali-izleme endpoint'leri
│   │   ├── payments.ts     — Shopier/Cryptomus/IBAN ödeme callback'leri
│   │   ├── auth.ts         — Google OAuth + JWT
│   │   └── user.ts         — Kullanıcı profil, API key, usage
│   ├── services/           — Business logic
│   ├── jobs/               — Cron job'lar (index.ts → startAllJobs)
│   ├── middleware/         — apiKeyAuth, adminAuth, userAuth, errorHandler
│   ├── db/
│   │   ├── schema.ts       — Drizzle şema (tek kaynak)
│   │   ├── client.ts       — db (Drizzle) + dbSql (postgres ham SQL)
│   │   └── migrations/     — Sequential SQL (0001_… → 0016_…)
│   └── lib/
│       ├── env.ts          — Zod env validasyonu (tek env erişim noktası)
│       └── errors.ts       — Typed error hiyerarşisi (InsufficientBalance vb.)
└── yapayzekalab/           — React/JSX SPA (tek-dosya bileşenler)
    ├── tab-admin.jsx
    ├── tab-admin-mali-izleme.jsx
    ├── tab-account.jsx
    └── …
```

### Billing Akışı

1. `proxy.ts` → `buildRequestGuard()` (model çözümleme, rate limit, bakiye ön kontrol)
2. Upstream'e iletme → token usage alınır
3. `resolveBilledPromptTokens(providerNormalized, serverContextTokens)`:
   - Provider `> 50 token` raporladıysa → provider değerine güven
   - `≤ 50` (bozuk rapor, WellFlow vb.) → `max(provider, serverContext)` floor
4. `chargeUsage()` — atomic DB transaction: bakiye düşürme + usage kaydı
5. `usage_records` → her istek için kanıt kaydı (idempotency: `request_id` UNIQUE)

### Provider Yönetimi

- Aktif provider `provider_profiles` tablosundan okunur (admin panelinde tek tıkla geçiş)
- `AI_PROVIDER_BASE_URL` / `AI_PROVIDER_API_KEY` env override olarak da çalışır
- `closerouter-service.ts` upstream adapter'ı (SSE parse, token normalizasyon)

### Job'lar (`src/server/jobs/`)

| Job | Görev |
|-----|-------|
| `kur-refresh-job` | USD/TRY kuru periyodik güncelleme |
| `daily-report-job` | Günlük kullanım raporu email |
| `low-balance-scan-job` | Düşük bakiye bildirimi |
| `orphan-reservation-reaper-job` | Sahipsiz rezervasyonları temizle |
| `mali-izleme-job` | Finansal denetim taraması → `mali_izleme_taramalari` |

---

## Kritik Kararlar

| Konu | Karar |
|------|-------|
| Fiyatlama | `provider_fiyat × 3.00` (efektif ~3.33× normalizasyon dahil) |
| Token normalizasyon | `real_tokens / 0.90` |
| Billing idempotency | `usage_records.request_id` UNIQUE index |
| Admin erişimi | Allowlisted email (env `ADMIN_EMAILS`), ayrı şifre yok |
| Provider leak | Provider codename'leri (closerouter, wellflow vb.) frontend'e/API yanıtına ASLA geçmemeli — `npm run scan:public` ile kontrol edilir |
| Migration | Her yeni tablo: `CREATE TABLE IF NOT EXISTS` + `schema.ts`'te Drizzle tanımı + `_journal.json` güncellenmeli |
| itest | Gerçek Postgres (mock DB yok); `fileParallelism: false`; her test kendi verisini `beforeAll/afterAll`'da temizler |

---

## Test Katmanları

- **Unit (`*.test.ts`):** `npm test` — DB mock'lu veya saf logic; hızlı
- **Integration (`*.itest.ts`):** `npm run itest` — gerçek Postgres; `db:up` + `db:migrate` gerekir
- **Contract (`*-contract.test.ts`):** Derleme/bundle bütünlüğü (provider leak, fiyat sabitleri)
- **Smoke (`scripts/`):** Canlı VPS veya local production build karşı HTTP probe

## Önemli Notlar

- `src/server/lib/env.ts` — tüm env'e bu Zod şema üzerinden erişilir, doğrudan `process.env` kullanma
- `dbSql` (raw postgres) limit'siz aggregate için, `db` (Drizzle) ORM sorguları için
- `resolveBilledPromptTokens` — billing formülüne dokunmaz; hangi token sayısının `chargeUsage`'a gideceğini seçer
- Frontend SPA `src/yapayzekalab/` altında JSX; build'de Vite bundle'a girer; admin sekmeler `tab-admin.jsx`'e kayıtlı
- Deploy'da `npm run db:migrate` unutulmamalı (özellikle yeni migration eklenince)
