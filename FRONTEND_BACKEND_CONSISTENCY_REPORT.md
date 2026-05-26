# FRONTEND BACKEND CONSISTENCY REPORT

Durum: 60 dakikalık site testi sonrası doldurulacak.
# Frontend/Backend Consistency Report

## Uyuşmazlıklar
- UI/doküman beklentisi CloseRouter/OpenAI uyumlu model katalog endpointlerini ima ediyor; backend `/v1/models`, `/v1/providers`, `/v1/models/count` için 404 dönüyor.
- Modeller alanında video desteği görünür; ürün metni sınırlı/beta/501 durumunu net anlatmıyor.
- Docs/API entegrasyon örnekleri beklenen şekilde görünür doğrulanmadı; testte Google OAuth 503 cevabı docs/API akışını böldü.
- `/health` içinde `closerouter: unknown`; frontend sağlayıcı/aktivite iddiası gerçek upstream health ile bağlanmış görünmüyor.

## Karar
- `DEC-FE-BE-001`: REJECT.
- Gerekçe: public UI/API sözleşmesi ile backend `/v1` katalog ve OAuth durumu uyumsuz.

---

# Live Consistency Update — 2026-05-27

## Düzelenler

- Live public `/v1` catalog endpoints deploy sonrası 200 JSON dönüyor.
- Live `/docs` ve `qa:uat` smoke 10/10 geçti.
- Google OAuth with `cix.crazy666@gmail.com` standard Chrome'da tamamlandı.
- Admin tab anonymous durumda gizli; admin Google login sonrası görünüyor ve ayrı admin password formu açmıyor.

## Kalan Uyuşmazlıklar

- Admin/provider status UI `Anthropic`, `OpenAI`, `Google`, `Moonshot` için aktif durum gösterebiliyor; direct CloseRouter inference aynı oturumda OpenAI/Anthropic/Deepseek/Google için `502` döndü.
- `/health` CloseRouter catalog check'i `ok` görebiliyor, fakat catalog availability gerçek inference success anlamına gelmiyor.
- Kullanıcı açısından “provider aktif” ve “ilk API çağrısı çalışır” beklentisi hâlâ doğrulanmış değil.
- Successful funded API call olmadığı için UI usage/history, backend `usage_records`, response billing headers ve transaction ledger tutarlılığı kabul edilemedi.

## Güncel Karar

- `DEC-FE-BE-001`: REJECT remains.
- Gerekçe: catalog/OAuth/admin drift düzeldi, fakat provider status ve real inference/billing kanıtı hâlâ backend gerçekliğiyle tam uyumlu değil.
