# BACKEND TEST REPORT

Durum: 60 dakikalık site testi sonrası doldurulacak.
# Backend Test Report — 2026-05-26

## Geçenler
- `GET /health`: `200`, JSON, `db: ok` son durumda.
- `GET /status`: `200`, JSON.
- `GET /api/models`: `200`, JSON.
- `GET /api/announcements/active`: `200`, JSON.
- Unknown `/api/*`: `404`, JSON.
- Unknown `/v1/*`: `404`, JSON.
- Authsuz admin endpoints: `401`.
- Authsuz payment endpoints: `401`.

## Başarısız / Bloklu
- Test sırasında Docker/Postgres kapalı kaldığında `/api/models` ve `/api/announcements/active` 500 verdi.
- Test sırasında Express listener/port en az iki kez erişilemez hale geldi; manuel restart gerekti.
- `GET /v1/models`, `/v1/providers`, `/v1/models/count` yok.
- Admin login credential yok; admin mutation testleri yapılmadı.
- User JWT yok; user profile, API key create/revoke, payment init, usage records gerçek kullanıcı akışı bloklu.
