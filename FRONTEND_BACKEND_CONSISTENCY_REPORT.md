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
