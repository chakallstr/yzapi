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

## Bu Turda Eklenen Komutlar

- `npm run qa:uat`: Chrome ile desktop/mobile homepage, modeller, SSS, docs ve admin login ekran smoke’u; JSON/MD rapor ve screenshot üretir.
- `node scripts/scan-secrets.mjs`: Git kapsamındaki dosyaları secret patternleri için tarar, gerçek değerleri maskeleyerek raporlar.

## Komut Sonuçları

- `npm test -- src/admin-fetch-guard.test.ts`: önce RED, sonra PASS.
- `npm test -- src/navigation.test.ts`: önce RED, sonra PASS.
- `npm test -- src/uat-smoke-script.test.ts`: önce RED, sonra PASS.
- `npm test -- src/secret-scan-script.test.ts`: önce RED, sonra PASS.
- `npm test`: 16 test dosyası, 75 test PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run scan:public`: PASS.
- `node scripts/scan-secrets.mjs`: PASS, 175 dosya, hit yok.
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
