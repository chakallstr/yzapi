# YapayZekaLab Kalan Testler Execution Report

Tarih: 2026-05-26

## 3 Ajan Durumu

- Gerçek subagent spawn denemesi `agent thread limit reached` verdi.
- Fallback olarak aynı 3 rol karar masası aktif kullanıldı:
  - Ajan 1: QA/UAT/Regression
  - Ajan 2: Backend/API/Billing
  - Ajan 3: Security/Visual/Release
- Önceki okuma ajanlarının riskleri uygulandı: live smoke önce koşuldu, raw provider secret/maliyet leak kontrol edildi, visual lock korundu, deploy gate kapalı tutuldu.

## Yapılan Düzeltmeler

- Docs/API örnekleri eski `https://api.yapayzekalab.com/v1` yerine `https://yapayzekalab.org/v1` kullanıyor.
- Örneklerde `YOUR_API_KEY` yerine `yzk_live_YOUR_KEY` prefix’i kullanılıyor.
- SSS video metni video API için beta/sınırlı durumu ve 501 ihtimalini net söylüyor.
- Yeni statik kontrat testi eklendi: `src/api-docs-content.test.ts`.
- Tasarım/stil/layout/class/CSS değişmedi; değişiklik metin/string seviyesinde.

## Lokal Runtime Smoke

- DB: `docker compose up -d postgres` PASS.
- Migration: `npm run db:migrate` PASS.
- Seed: `npm run db:seed` PASS.
- Server: `npm run dev` PASS, port `4567`.
- `node scripts/vps-smoke.mjs`: PASS.
- `/health`: `ok`, DB `ok`.
- `/status`: `ok`, model count `33`.
- `/api/models`: `33`.
- Authsuz `/v1/chat/completions`: `401`.
- Unknown `/api/*` ve `/v1/*`: JSON `404`.
- `SMOKE_API_KEY` yok: funded successful chat smoke `BLOCKED_BY_MISSING_CREDENTIAL`.
- `SMOKE_LOW_BALANCE_API_KEY` yok: low-balance smoke `BLOCKED_BY_MISSING_CREDENTIAL`.

## Lokal `/v1` Catalog Smoke

- `GET /v1/models`: `200`, data `33`.
- `GET /v1/providers`: `200`, data `11`.
- `GET /v1/models/count`: `200`, count `33`.
- `GET /v1/__catalog_missing__`: JSON `404`.
- Secret/internal field scan: `api_key`, `secret`, `upstream`, `base_url`, `routing`, `weight`, `providerInputUsd`, `providerOutputUsd` bulunmadı.

## Lokal Browser UAT

- `npm run qa:uat`: PASS `10/10`.
- Rapor: `qa-artifacts/uat-smoke-2026-05-26T20-27-58-773Z/uat-smoke-report.md`.
- Google callback, funded API key ve payment webhookları bu smoke kapsamında PASS sayılmadı.

## Canlı Smoke

- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: FAIL `8/10`.
- Rapor: `qa-artifacts/uat-smoke-2026-05-26T20-24-15-625Z/uat-smoke-report.md`.
- Canlı `/`, `/models`, `/docs`, `/admin`: PASS.
- Canlı `/sss`: desktop/mobile FAIL, beklenen `Bakiye kredi mi` metni yok.
- `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs`: PASS temel backend smoke.
- Canlı `/v1/models`, `/v1/providers`, `/v1/models/count`: 200 JSON.
- Canlı catalog secret/internal field scan: leak yok.
- Canlı `/v1` catalog payload şekli lokal son route ile birebir aynı değil; bu yüzden deploy drift hâlâ not edilmeli.

## OAuth/Admin Security Smoke

- Lokal `/api/admin/dashboard` authsuz: `401`.
- Lokal `/api/admin/me` authsuz: `401`.
- Lokal `/api/payments/admin/all` authsuz: `401`.
- Lokal `/api/admin/login`: `410`, ayrı admin şifresi kullanılmıyor.
- Lokal `/api/auth/google`: `503`, Google env yok.
- Canlı `/api/auth/google`: `302`, Google auth domainine yönleniyor ve redirect URI `https://yapayzekalab.org/api/auth/google/callback`.
- Gerçek Google callback/session tamamlanmadı: `BLOCKED_BY_MISSING_CREDENTIAL_OR_BROWSER_SESSION`.

## Regression

- `npm test -- src/api-docs-content.test.ts`: PASS, 2/2.
- `npm run lint`: PASS.
- `npm test`: PASS, 24 files / 101 tests.
- `npm run build`: PASS, mevcut chunk-size warning dışında hata yok.
- `npm run scan:public`: PASS, 3 scanned / 0 hits.
- `node scripts/scan-secrets.mjs`: PASS, 211 scanned / 0 hits.

## Hâlâ Bloklu Testler

- Funded `yzk_live_*` successful text call, billing headers, balance decrement, `usage_records`: `BLOCKED_BY_MISSING_SMOKE_API_KEY`.
- Low-balance key 402/no-charge: `BLOCKED_BY_MISSING_SMOKE_LOW_BALANCE_API_KEY`.
- Shopier sandbox valid/invalid/duplicate callback: `BLOCKED_BY_MISSING_ROTATED_SHOPIER_TEST_CREDENTIALS`.
- Cryptomus sandbox valid/invalid/duplicate webhook: `BLOCKED_BY_MISSING_ROTATED_CRYPTOMUS_TEST_CREDENTIALS`.
- IBAN admin approve/reject live browser UAT: `BLOCKED_BY_MISSING_ADMIN_SESSION`.
- Admin full browser UAT and audit evidence: `BLOCKED_BY_MISSING_ADMIN_SESSION`.
- Live `/sss` smoke: `FAIL_LIVE_CONTENT_DRIFT`.
- Deploy/rollback: `NOT_RUN`, GitHub backup required before deploy.

## 3 Ajan Son Karar

- Ajan 1 / QA-UAT: LOCAL PASS, LIVE PARTIAL FAIL. Canlı `/sss` ve auth/payment/admin gerçek akışları eksik.
- Ajan 2 / Backend-API-Billing: LOCAL API CATALOG PASS. Billing/payment P0 kanıtı credential olmadığı için hâlâ blocked.
- Ajan 3 / Security-Visual-Release: Visual lock ve scans PASS. Release gate kapalı; secrets yok, deploy yok, ödeme/OAuth/admin kanıtı eksik.

Final durum: `NOT READY — API/BILLING/BALANCE BLOCKERS`.
