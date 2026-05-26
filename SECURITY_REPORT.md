# Security Report

Operasyon tarihi: 2026-05-26

## Kritik / High / Medium / Low Bulgular

| ID | Seviye | Bulgu | Kanıt | Durum |
|---|---|---|---|---|
| SEC-ADMIN-001 | High | Admin UI mutasyonlarında Authorization header eksikti. | Static grep + failing test | FIXED |
| SEC-ROUTE-001 | Medium | `/admin` route login ekranına ulaşmıyordu; admin UI test edilemiyordu. | Lokal/canlı path testi | FIXED LOCAL |
| SEC-AUTH-001 | Medium | Admin sadece parola/JWT rol bazlı; email allowlist yok. | `admin-auth.ts` | OPEN |
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
- Git kapsamlı source secret scan: PASS, 175 dosya, hit yok.
- API key DB storage: full key DB’de plaintext değil, hash var; full key listede dönmüyor.
- IBAN duplicate approve: 409; çift credit yok.

## Secret Notu

Gerçek `.env` değerleri raporlanmadı. Komut çıktılarında token, parola veya full API key yazılmadı.

## Sonuç

Security açısından temel kontroller iyi; fakat admin allowlist, gerçek OAuth callback, gerçek provider webhookları ve canlı funded API kullanım testi tamamlanmadan production-ready denemez.
