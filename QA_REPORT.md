# QA Report

Operasyon tarihi: 2026-05-26

## Executive Summary

YapayZekaLab public ve backend smoke yüzeyi çalışıyor. Lokal DB Docker ile ayağa kaldırıldı, migration/seed geçti, TypeScript/test/build/public scan/secret scan temiz. Bu turda kritik eksikler kapatıldı: admin mutasyonlarının token göndermemesi, SPA deep-link route’larının doğru tab açmaması, eksik secret/live smoke komutları, admin API key’in hash’siz oluşması, user patch üzerinden ledger dışı bakiye değişimi ve ödeme init limit/IBAN guard eksikleri.

Ancak gerçek kullanıcı launch onayı verilemez: başarılı canlı `/v1` çağrısı, low-balance, Google callback tamamı, Shopier/Cryptomus sandbox/provider ve canlı payment UAT credential/test key olmadan doğrulanmadı.

## Test Edilenler

- Repo mimarisi, route/schema/service haritası.
- Lint, unit tests, build, public scan.
- Lokal DB migrate/seed.
- Lokal ve canlı `/health`, `/status`, `/api/models`, JSON 404, authsuz `/v1`.
- Chrome desktop/mobile public UAT.
- Kalıcı `npm run qa:uat` Chrome UAT smoke.
- Kalıcı `node scripts/turkapi-smoke.mjs` canlı smoke alias.
- Local user token ile API key create/list/revoke/hash.
- Local admin login ve protected admin API.
- Local admin-created API key create/revoke ve direct balance patch guard.
- Local IBAN payment init/admin approve/duplicate approve pre-guard; current env IBAN eksik olduğu için methods disabled.
- Live Google OAuth redirect.

## Geçen Testler

- `npm run lint`: PASS
- `npm test`: 18 dosya / 80 test PASS
- `npm run build`: PASS
- `npm run scan:public`: PASS
- `node scripts/scan-secrets.mjs`: PASS, 179 Git kapsamlı dosya, hit yok
- `npm run qa:uat`: LOCAL PASS, 10/10
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: LIVE FAIL, 6/10
- `SMOKE_BASE_URL=https://yapayzekalab.org node scripts/turkapi-smoke.mjs`: PASS public checks; funded/low-balance key yok diye iki test manuel gereksinim
- Local smoke: PARTIAL PASS, public checks PASS
- Live smoke: PARTIAL PASS, public checks PASS
- API key güvenliği: PASS LOCAL
- IBAN idempotency: PASS LOCAL
- Admin protected API: PASS LOCAL
- Admin-created API key hash/one-time full key: PASS LOCAL
- Direct `PATCH /api/admin/users/:id` ile bakiye değiştirme engeli: PASS LOCAL
- Payment min/max helper ve IBAN enabled guard: PASS UNIT/LOCAL METHODS

## Test Edilemeyenler

- Gerçek Google OAuth callback sonrası kullanıcı session.
- Gerçek funded API key ile `/v1` başarılı response ve billing headers.
- Low-balance canlı key ile 402 akışı.
- Shopier gerçek/sandbox ödeme.
- Cryptomus gerçek/sandbox webhook.
- Canlı admin browser UAT.

## Bugs Found / Fixed

- `BUG-ADMIN-001`: Admin UI token göndermeyen admin fetch çağrıları. FIXED.
- `BUG-ROUTE-001`: `/admin` ve `/docs` deep-link açılmıyordu. FIXED LOCAL.
- `BUG-QA-001`: `scripts/scan-secrets.mjs` yoktu. FIXED.
- `BUG-QA-002`: `scripts/turkapi-smoke.mjs` yoktu. FIXED.
- `BUG-ADMIN-002`: Admin-created API key `keyHash: null` ile kullanılamaz oluşuyordu. FIXED LOCAL.
- `BUG-ADMIN-003`: Generic user patch route’u `bakiyeTL` alanını ledger dışı değiştirebiliyordu. FIXED LOCAL.
- `BUG-PAY-001`: Payment init min/max guard yoktu ve boş IBAN config aktif görünebiliyordu. FIXED LOCAL.

## Kalan Riskler

- Admin email allowlist yok.
- Slack/Discord entegrasyonu yok/görünmedi.
- Sandbox/test API key özel quota yok/görünmedi.
- Monthly usage report endpointi yok/görünmedi.
- API key edit/PATCH yok.
- Video endpointleri 501.
- Public canlı sürümde yeni local fixler deploy edilmedi; canlı `qa:uat` `/sss` ve `/admin` için 6/10 kaldı, 4 route içerik hatası verdi.

## Sonuç

Final verdict: NOT READY — PAYMENT/BILLING/AUTH BLOCKERS.
