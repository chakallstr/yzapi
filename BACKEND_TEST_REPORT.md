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

---

# Backend Live Update — 2026-05-27

## Düzelen / Doğrulanan

- Live target gerçek servis olarak `/opt/turkapiprojesi`, `turkapiprojesi.service`, port `4568` doğrulandı.
- Canlı deploy sonrası `/health` 200; DB/kur/CloseRouter health checks `ok`.
- Canlı `qa:uat` 10/10 geçti.
- Public `/v1` katalog endpointleri canlı smoke kapsamından geçti.
- Authsuz `/v1/chat/completions` canlıda JSON `401` dönüyor.
- Admin Google OAuth canlıda tamamlandı; allowlisted `cix.crazy666@gmail.com` admin dashboard'a ayrı admin şifresi olmadan girebildi.
- Admin anonymous state'te görünmüyor.

## Kalan Backend/Billing Blokajı

- Successful `/v1` text inference billing kabulü hâlâ bloklu.
- İzole canlı funded/zero-balance API key testleri çalıştırıldı ve keyler revoke edildi.
- Low-balance path `402`, invalid key path `401`, upstream failure path zero-cost/no-decrement güvenli.
- Direct CloseRouter `/credits` ve `/models` çalışıyor, ancak direct inference OpenAI/Anthropic/Deepseek/Google tarafında `502 upstream_connection_refused` veya `502 upstream_connect_timeout` veriyor.
- Bu upstream 502 düzelmeden success `usage_records`, `transactions`, cost headers ve balance decrement acceptance yapılamaz.

## Live Payment Schema / IBAN Update — 2026-05-27

- Canlı DB’de eksik ödeme quote kolonları yedek sonrası idempotent olarak eklendi.
- `payments` ve `pending_iban_payments` içinde `amount_usd`, `payable_tl`, `credit_tl`, `kur_at_payment`, `rounding_tl` doğrulandı.
- Canlı IBAN init/admin approve/reject E2E geçici test verisiyle geçti.
- Duplicate approve `409`, normal user admin payment access `403`, reject without reason `400`.
- Shopier/Cryptomus env yoksa 503 ile güvenli disabled kalıyor.
- Test kayıtları canlı DB’den temizlendi.

Sonuç: Backend payment schema ve IBAN ledger/idempotency live PASS. Successful AI usage deduction ve Shopier/Cryptomus provider E2E hâlâ launch blocker.
