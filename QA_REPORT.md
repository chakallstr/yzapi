# QA Report

Operasyon tarihi: 2026-05-26

## Executive Summary

YapayZekaLab public ve backend smoke yüzeyi çalışıyor. Lokal DB Docker ile ayağa kaldırıldı, migration/seed geçti, TypeScript/test/build/public scan/secret scan temiz. Üç gerçek eksik kapatıldı: admin mutasyonlarının token göndermemesi, SPA deep-link route’larının doğru tab açmaması ve eksik `scan-secrets.mjs` kalite aracının olmaması.

Ancak gerçek kullanıcı launch onayı verilemez: başarılı canlı `/v1` çağrısı, low-balance, Google callback tamamı, Shopier/Cryptomus sandbox/provider ve canlı payment UAT credential/test key olmadan doğrulanmadı.

## Test Edilenler

- Repo mimarisi, route/schema/service haritası.
- Lint, unit tests, build, public scan.
- Lokal DB migrate/seed.
- Lokal ve canlı `/health`, `/status`, `/api/models`, JSON 404, authsuz `/v1`.
- Chrome desktop/mobile public UAT.
- Kalıcı `npm run qa:uat` Chrome UAT smoke.
- Local user token ile API key create/list/revoke/hash.
- Local admin login ve protected admin API.
- Local IBAN payment init/admin approve/duplicate approve.
- Live Google OAuth redirect.

## Geçen Testler

- `npm run lint`: PASS
- `npm test`: 16 dosya / 75 test PASS
- `npm run build`: PASS
- `npm run scan:public`: PASS
- `node scripts/scan-secrets.mjs`: PASS, 175 Git kapsamlı dosya, hit yok
- `npm run qa:uat`: LOCAL PASS, 10/10
- `QA_BASE_URL=https://yapayzekalab.org npm run qa:uat`: LIVE FAIL, 6/10
- Local smoke: PARTIAL PASS, public checks PASS
- Live smoke: PARTIAL PASS, public checks PASS
- API key güvenliği: PASS LOCAL
- IBAN idempotency: PASS LOCAL
- Admin protected API: PASS LOCAL

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

## Kalan Riskler

- Admin email allowlist yok.
- Slack/Discord entegrasyonu yok/görünmedi.
- Sandbox/test API key özel quota yok/görünmedi.
- Monthly usage report endpointi yok/görünmedi.
- API key edit/PATCH yok.
- Video endpointleri 501.
- Public canlı sürümde yeni local fixler deploy edilmedi; canlı `qa:uat` `/sss` ve `/admin` için 4/10 route içerik hatası verdi.

## Sonuç

Final verdict: NOT READY — PAYMENT/BILLING/AUTH BLOCKERS.
