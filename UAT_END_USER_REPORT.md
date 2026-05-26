# UAT End User Report

Operasyon tarihi: 2026-05-26

## Browser Kanıtı

- Browser: Playwright `channel: chrome`, headless.
- Lokal `qa:uat` raporu: `qa-artifacts/uat-smoke-2026-05-26T14-05-53-517Z/uat-smoke-report.md`, 10/10 PASS.
- Canlı `qa:uat` raporu: `qa-artifacts/uat-smoke-2026-05-26T14-06-12-720Z/uat-smoke-report.md`, 6/10 FAIL.
- Screenshot artifactleri yerelde `qa-artifacts/` altında tutuldu; GitHub'a binary artifact olarak eklenmeyecek.

## Persona / Journey Sonuçları

| Journey | Persona | Sonuç | Kanıt | Not |
|---|---|---|---|---|
| UAT-001 İlk ziyaret | Anonymous Visitor | PASS | Lokal/canlı desktop-mobile Chrome | “YapayZekaLab” ve “bakiye” mesajı göründü |
| UAT-002 Model keşfi | Developer | PASS | `/models` route ve Modeller tab | Modeller erişilebilir; DB açılınca API 500 yok |
| UAT-003 SSS | Anonymous Visitor | PASS LOCAL / FAIL LIVE | `/sss` route | Lokal route fix sonrası doğru; canlı deploy edilmediği için beklenen içerik yok |
| UAT-004 Login | New Developer | PARTIAL | Canlı `/api/auth/google` 302 | Google redirect doğru; gerçek Google callback tamamlanmadı |
| UAT-005 API key | Developer | PASS LOCAL | Local test JWT + admin API | Tam key sadece create response; admin-created key artık hash’li; listede full key yok; revoke sonrası 401 |
| UAT-006 İlk API call | Developer | BLOCKED | `SMOKE_API_KEY` yok | Valid local key ile upstream env yoksa 503; canlı funded key yok |
| UAT-007 Bakiye/payment | Balance Buyer | PARTIAL PASS LOCAL | IBAN pre-guard + payment guard tests | IBAN approve/idempotency pre-guard doğrulandı; current env IBAN eksik olduğu için disabled/503; Shopier/Cryptomus env yok |
| UAT-008 Low balance | Low-Balance User | BLOCKED | `SMOKE_LOW_BALANCE_API_KEY` yok | Otomatik smoke atlandı |
| UAT-009 Usage/cost trust | Returning API User | BLOCKED | Gerçek başarılı `/v1` yok | Billing header ve usage DB gerçek provider çağrısıyla doğrulanamadı |
| UAT-010 Mobile | Mobile User | PASS PUBLIC | 390x844 Chrome | Homepage/Modeller/SSS/API görünür |
| UAT-011 Error recovery | Confused User | PARTIAL PASS | JSON 404/401 | Unknown API/v1 JSON; Google lokal env eksik 503 net |
| UAT-012 Admin exposure | Malicious/Admin | PASS LOCAL / FAIL LIVE | `/admin` fix sonrası login screen | Lokal login screen göründü; canlı deploy edilmediği için `Admin Girişi` görünmüyor |

## Browser Hataları

- DB kapalı ilk koşuda `/api/models` ve `/api/announcements/active` 500 verdi; Docker/Postgres açılınca kayboldu.
- Lokal `/admin` route’unda tek console 404 görüldü; büyük olasılıkla favicon/static kaynak. API bad response listesinde kritik 4xx/5xx yok.
- Canlı desktop/mobile homepage testinde console/network hata yok.
- Canlı `qa:uat` son koşuda 4 route içerik hatası verdi: desktop/mobile `/sss` ve desktop/mobile `/admin`. HTTP 200 var ama SPA başlangıç tabı canlıda doğru değil.

## UX Notları

- Public nav içinde Admin görünmüyor; `/admin` doğrudan route ile admin login artık açılıyor.
- `/docs` doğrudan route artık API tabına düşüyor.
- Canlı `/user-dashboard` 200 dönüyor ama gerçek login session olmadan müşteri dashboard akışı test edilmedi.

## Sonuç

UAT public yüzeyde lokal olarak iyi; canlıda route fix deploy edilmediği için `/sss` ve `/admin` smoke geçmiyor. Gerçek müşteri onboarding için ayrıca Google callback, funded API key, ilk başarılı API request, usage/cost ve gerçek ödeme provider doğrulamaları eksik.
