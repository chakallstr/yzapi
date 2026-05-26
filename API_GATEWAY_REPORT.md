# API Gateway Report

Operasyon tarihi: 2026-05-26

## Test Edilen Endpointler

| Endpoint | Test | Sonuç | Not |
|---|---|---|---|
| `POST /v1/chat/completions` | Auth yok | PASS | 401 JSON |
| `POST /v1/chat/completions` | Local valid user/admin-created key, upstream env yok | PASS/PARTIAL | 503 `proxy not configured`; auth doğrulandı, provider çağrısı yok |
| `POST /v1/chat/completions` | Revoked key | PASS | 401 `Invalid API key` |
| `GET /v1/__missing__` | Unknown route | PASS | JSON 404 |
| `POST /v1/responses` | Static/test coverage | PARTIAL | Service tests var; canlı gerçek key ile denenmedi |
| `POST /v1/messages` | Static/test coverage | PARTIAL | Service tests var; canlı gerçek key ile denenmedi |
| `POST /v1/images/generations` | Static/test coverage | PARTIAL | Gerçek image upstream/key yok |
| `POST /v1/images/edits` | Static/test coverage | PARTIAL | Gerçek image upstream/key yok |
| `POST /v1/videos/submit` | Static | EXPECTED 501 | Production-ready değil |
| `GET /v1/videos/tasks/:taskId` | Static | EXPECTED 501 | Production-ready değil |

## Billing Header Durumu

- Authsuz/revoked/503 durumlarında billing header beklenmedi.
- Başarılı gerçek provider çağrısı yapılamadığı için `X-YZ-Cost-TL`, `X-YZ-Remaining-TL`, `X-YZ-Request-Id` canlı olarak doğrulanamadı.
- Mevcut kodda başarılı non-stream text/image çağrılarında header set ediliyor.

## Bloklayıcılar

- `SMOKE_API_KEY` yok.
- `SMOKE_LOW_BALANCE_API_KEY` yok.
- Lokal `CLOSEROUTER_API_KEY` yok.
- Canlı funded user API key sağlanmadı.
- Canlı `SMOKE_API_KEY` / `SMOKE_LOW_BALANCE_API_KEY` sağlanmadığı için billing header ve 402 low-balance testleri atlandı.

## Sonuç

PARTIAL PASS. Auth matrix ve JSON hata yüzeyi iyi; başarılı gerçek `/v1` kullanım ve billing header doğrulaması olmadan production onayı verilemez.
