# Automated Tests Report

Operasyon tarihi: 2026-05-26

## Mevcut Testler

- API key auth
- Error handler
- Auth token/hash/refresh
- Billing/usage/idempotency
- CloseRouter forwarding
- Cryptomus signature
- Shopier signature
- Payment/KDV/balance credit
- Pricing
- Model catalog snapshot
- Reconciliation
- Status service

## Bu Turda Eklenen Testler

| Dosya | Amaç | Sonuç |
|---|---|---|
| `src/admin-fetch-guard.test.ts` | Protected admin endpointlerin raw fetch ile çağrılmasını engellemek | PASS |
| `src/navigation.test.ts` | `/admin`, `/docs`, `/models`, `/sss`, query/hash tab routing başlangıcını doğrulamak | PASS |
| `src/uat-smoke-script.test.ts` | `qa:uat` Chrome UAT smoke komut sözleşmesini doğrulamak | PASS |
| `src/secret-scan-script.test.ts` | `scan-secrets.mjs` güvenli scanner sözleşmesini doğrulamak | PASS |
| `src/admin-billing-guard.test.ts` | Admin API key hash ve ledger dışı bakiye patch guard sözleşmesini doğrulamak | PASS |
| `src/server/services/payment-guards.test.ts` | Payment min/max ve IBAN config guard helperlarını doğrulamak | PASS |

## Bu Turda Eklenen Komutlar

- `npm run qa:uat`: Chrome ile desktop/mobile homepage, modeller, SSS, docs ve admin login ekran smoke’u; JSON/MD rapor ve screenshot üretir.
- `node scripts/scan-secrets.mjs`: Git kapsamındaki dosyaları secret patternleri için tarar, gerçek değerleri maskeleyerek raporlar.
- `node scripts/turkapi-smoke.mjs`: Kullanıcının istediği canlı smoke komut adını mevcut `vps-smoke` sözleşmesine bağlar.

## Komut Sonuçları

- `npm test -- src/admin-fetch-guard.test.ts`: önce RED, sonra PASS.
- `npm test -- src/navigation.test.ts`: önce RED, sonra PASS.
- `npm test -- src/uat-smoke-script.test.ts`: önce RED, sonra PASS.
- `npm test -- src/secret-scan-script.test.ts`: önce RED, sonra PASS.
- `npm test`: 18 test dosyası, 80 test PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run scan:public`: PASS.
- `node scripts/scan-secrets.mjs`: PASS, 179 dosya, hit yok.
- `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs`: PASS public checks; `SMOKE_API_KEY` ve `SMOKE_LOW_BALANCE_API_KEY` yok diye iki canlı key testi atlandı.
- `npm run qa:uat`: LOCAL PASS, 10/10.
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: LIVE FAIL, 6/10; `/sss` ve `/admin` canlıda doğru içerik göstermiyor.

## Otomasyon Boşlukları

- Playwright/Vitest E2E test dosyası yerine şimdilik script tabanlı Chrome smoke var.
- Full Google OAuth callback otomasyonu yok.
- Gerçek provider `/v1` successful billing testi için seeded funded live key yok.
- Shopier/Cryptomus sandbox callback/webhook E2E yok.
- Admin UI tüm tab click-through E2E yok.

## Sonuç

Regression coverage güçlendi ama launch-critical UAT için Playwright E2E suite kalıcılaştırılmalı.
