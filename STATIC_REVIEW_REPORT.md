# Static Review Report

Operasyon tarihi: 2026-05-26

## İncelenen Alanlar

- `src/server/index.ts`
- `src/server/db/schema.ts`
- `src/server/routes/*.ts`
- `src/server/middleware/*.ts`
- `src/server/services/*.ts`
- `src/server/jobs/*.ts`
- `src/App.tsx`
- `package.json`, `.env.example`, deploy/test scriptleri

## Bulgular

| ID | Şiddet | Alan | Bulgu | Durum |
|---|---|---|---|---|
| BUG-ADMIN-001 | High | Admin UI | Admin panelde protected `/api/admin/*` mutasyonları raw `fetch` ile token göndermiyordu. | FIXED |
| BUG-ROUTE-001 | Medium | SPA routing | `/admin`, `/docs`, `/models`, `/sss` doğrudan açıldığında doğru tab seçilmiyordu. | FIXED |
| RISK-AUTH-001 | Medium | Admin auth | Admin sadece parola/JWT rol bazlı; email-based admin kısıtı kodda açık değil. | OPEN |
| RISK-FEATURE-001 | Medium | Missing feature | Slack/Discord entegrasyonu görünmedi. | OPEN |
| RISK-FEATURE-002 | Medium | Missing feature | Sandbox/test API key özel quota akışı görünmedi. | OPEN |
| RISK-FEATURE-003 | Medium | Missing feature | Ayrı monthly usage report endpointi görünmedi. | OPEN |
| RISK-APIKEY-001 | Low/Medium | User API keys | API key PATCH/edit endpointi yok; create/list/revoke var. | OPEN |
| RISK-VIDEO-001 | Medium | API gateway | Video endpointleri 501; UI bunu production-ready göstermemeli. | OPEN |

## Güvenlik/Secret Statik Sonucu

- `.env` gerçek değerleri okunmadı ve commit kapsamına alınmadı.
- Public bundle scan: PASS, hit yok.
- Tracked file grep taramasında gerçek secret gibi görünen yüksek güvenli bulgu yok; `.env.example` ve eski dokümanlarda placeholder/env isimleri var.

## Sonuç

Statik blocker olarak iki frontend sözleşme hatası bulundu ve düzeltildi. Kalan maddeler launch öncesi ürün kapsamı/manuel doğrulama riski olarak açık.
