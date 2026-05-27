# Security Report

Operasyon tarihi: 2026-05-26

## Kritik / High / Medium / Low Bulgular

| ID | Seviye | Bulgu | Kanıt | Durum |
|---|---|---|---|---|
| SEC-ADMIN-001 | High | Admin UI mutasyonlarında Authorization header eksikti. | Static grep + failing test | FIXED |
| SEC-ROUTE-001 | Medium | `/admin` route login ekranına ulaşmıyordu; admin UI test edilemiyordu. | Lokal/canlı path testi | FIXED LOCAL |
| SEC-AUTH-001 | Medium | Admin sadece parola/JWT rol bazlı; email allowlist yok. | `admin-auth.ts` | OPEN |
| SEC-ADMIN-002 | High | Admin-created API key hash’siz oluşuyordu. | Agent 2 review + regression test | FIXED LOCAL |
| SEC-BILLING-001 | High | Generic user patch route’u ledger dışı bakiye değiştirebiliyordu. | Agent 2 review + local API smoke | FIXED LOCAL |
| SEC-PAY-002 | Medium | Boş IBAN config aktif yöntem gibi dönebiliyor, payment min/max guard eksikti. | Agent 2 review + unit/local test | FIXED LOCAL |
| SEC-OAUTH-001 | Medium | Lokal Google OAuth env yok. | `/api/auth/google` lokal 503 | OPEN/ENV |
| SEC-PAY-001 | Medium | Shopier/Cryptomus gerçek/sandbox provider testleri yapılmadı. | Env yok / gerçek para yok | OPEN |
| SEC-API-001 | Medium | Başarılı canlı `/v1` billing header testi yapılamadı. | `SMOKE_API_KEY` yok | OPEN |
| SEC-STATIC-001 | Low | Tek lokal console 404 var. | Chrome `/admin` smoke | OPEN |
| SEC-SCAN-001 | Low | Kaynak secret scanner eksikti. | `MODULE_NOT_FOUND` | FIXED |

## Geçen Güvenlik Kontrolleri

- Authsuz `/api/admin/dashboard`: 401.
- Normal API key prefix dışı `/v1`: 401.
- Revoked API key `/v1`: 401.
- Unknown `/api/*` ve `/v1/*`: JSON 404, HTML/stack trace yok.
- Public bundle secret scan: PASS.
- Git kapsamlı source secret scan: PASS, 179 dosya, hit yok.
- API key DB storage: full key DB’de plaintext değil, hash var; full key listede dönmüyor.
- Admin-created API key: hash’li, full key sadece create response/UI uyarısında tek seferlik.
- Direct admin user patch ile bakiye değiştirme: 400.
- Boş IBAN env: methods disabled, init 503.
- IBAN duplicate approve: 409; çift credit yok.

## Secret Notu

Gerçek `.env` değerleri committed raporlara yazılmadı. Eski canlı env backup artefacti regular `.deploy/backups` içinden çıkarılıp root-only secure alana taşındı; live `.env.production` içindeki kullanılmayan legacy `ADMIN_PASSWORD` satırı kaldırıldı. Kullanıcının daha önce chat içinde paylaştığı veya canlı panel/env tarafında bulunan sağlayıcı anahtarları yine de rotate edilmelidir.

## Sonuç

Security açısından temel kontroller iyi; fakat admin allowlist, gerçek OAuth callback, gerçek provider webhookları ve canlı funded API kullanım testi tamamlanmadan production-ready denemez.

---

# Live Payment/Admin Security Update — 2026-05-27

## Ek Geçen Kontroller

- Live IBAN payment schema migration additive yapıldı; DB backup alındı, veri silinmedi.
- Normal user, admin payment queue endpointinde `403` aldı.
- Admin IBAN approve tek transaction ile credit etti.
- Duplicate approve `409` verdi; double-credit yok.
- Reject without reason `400` verdi; sebep zorunlu.
- Reject with reason `200` ve `iban_reject` audit üretti.
- Shopier/Cryptomus env yokken init endpointleri `503` disabled kaldı; frontend tek başına provider credit yaratmadı.
- Payment UI artık backend yuvarlama kuralını gösteriyor; fake/uygulanmayan komisyon metni kaldırıldı.

## Kalan Security/Release Riskleri

- Shopier/Cryptomus valid/invalid/duplicate callback/webhook E2E sandbox/test credential olmadan hâlâ açık launch gate.
- Successful funded `/v1` text response ve pozitif billing headers hâlâ CloseRouter upstream `502` nedeniyle kanıtlanmadı.

Güncel security verdict: IBAN admin/payment güvenliği güçlendi; genel release hâlâ billing/provider kanıtına bağlı.

---

# Live Deploy Secret Hygiene Update — 2026-05-27 10:38 TRT

- Live `.deploy/backups` içinde kalan eski env backup artefacti normal backup dizininden kaldırıldı.
- Secure copy root-only `600 root:root` olarak tutuldu.
- Live `.env.production` içindeki artık kullanılmayan `ADMIN_PASSWORD` satırı kaldırıldı.
- Test setup ve aktif deploy dokümanlarındaki legacy `ADMIN_PASSWORD` gereksinimi kaldırıldı.
- `turkapiprojesi.service` restart sonrası active döndü.
- Live smoke PASS.
- Source secret scan PASS, 227 scanned / 0 hits.

Kalan security gereksinimi: Provider-side credential rotation hâlâ önerilir; Shopier/Cryptomus sandbox E2E ve successful funded API billing geçmeden release onayı yok.
