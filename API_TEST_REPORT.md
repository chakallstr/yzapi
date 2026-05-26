# API TEST REPORT

Durum: 60 dakikalık site testi sonrası doldurulacak.
# API Test Report — 2026-05-26

## Sonuç
- Genel API sonucu: `PARTIAL / BLOCKED`
- Authsuz ve invalid-auth güvenlik kontrolleri çalıştı.
- Valid `yzk_live_*` anahtar olmadığı için başarılı text inference, billing header, balance düşümü ve usage_records doğrulaması bloklu.
- Paid image/video testi yapılmadı.

## Endpoint Sonuçları
- `GET /v1/__qa_missing_route__`: `404`, JSON.
- `POST /v1/chat/completions`: `401`, JSON.
- `POST /v1/responses`: `401`, JSON.
- `POST /v1/messages`: `401`, JSON.
- `POST /v1/images/generations`: `401`, JSON.
- `POST /v1/images/edits`: `401`, JSON.
- `POST /v1/videos/submit`: `401`, JSON.
- `GET /v1/videos/tasks/qa-test-task`: `401`, JSON.

## Blokajlar
- `GET /v1/models`: `404`.
- `GET /v1/providers`: `404`.
- `GET /v1/models/count`: `404`.
- Valid kullanıcı API anahtarı yok.
- Upstream CloseRouter health local ortamda `unknown`.
